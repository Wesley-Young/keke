import type { Disposable } from '@fraqjs/fraq';
import type { DatabaseService } from '@fraqjs/plugin-kysely';
import type { RandomService } from '@fraqjs/plugin-random';

import type { QueryRunner } from '../../util/kysely';
import { assertUserId, pickRange } from '../../util/rules';
import type { CurrencyService } from '../currency';
import { addCurrencySafelyIn, shellDelta } from './currency-utils';
import { formatInventory } from './messages';
import {
  adjustInventoryIn,
  clearThiefWarningIn,
  ensureInventoryRow,
  getInventoryIn,
  getThiefWarningIn,
  setThiefWarnedIn,
  updateThiefStolenIn,
  updateThiefWeightIn,
} from './repository';
import {
  addItemResult,
  BAIT_PRICE,
  CHARM_HOOK_THRESHOLD,
  calculateInventoryCount,
  calculateInventoryWeight,
  catchOutcomes,
  createEmptyInventory,
  createStolenInventory,
  createThiefInventoryPatch,
  EXTRA_HIGH_CHARM_THRESHOLD,
  extraHighCharmHookOutcomes,
  FISHING_BOMB_CHARM_COST,
  FISHING_BOMB_COOLDOWN_MS,
  FISHING_BOMB_MUTE_SECONDS,
  FISHING_BOMB_STAMINA_COST,
  fishingItems,
  HIGH_CHARM_WAIT_MAX_MS,
  HIGH_CHARM_WAIT_MIN_MS,
  hasAnyFishingItem,
  hasFishingItemGain,
  highCharmHookOutcomes,
  LOW_CHARM_WAIT_MAX_MS,
  LOW_CHARM_WAIT_MIN_MS,
  lowCharmHookOutcomes,
  MIN_STAMINA_TO_FISH,
  ROD_PRICE,
  SPECIAL_SELL_EVENT_CHANCE_WEIGHT,
  SPECIAL_SELL_EVENT_MAX_MULTIPLIER,
  SPECIAL_SELL_EVENT_MIN_MULTIPLIER,
  SPECIAL_SELL_EVENT_NORMAL_WEIGHT,
  STAMINA_COST_MAX,
  STAMINA_COST_MIN,
  sellCharmRules,
  sellShellRules,
  THIEF_CLEAR_WARNING_WEIGHT,
  THIEF_COOLDOWN_MS,
  THIEF_STEAL_MAX_PERCENT,
  THIEF_STEAL_MAX_WEIGHT,
  THIEF_STEAL_MIN_PERCENT,
  THIEF_STEAL_MIN_WEIGHT,
  THIEF_STEAL_PROBABILITY,
  THIEF_WARNING_WEIGHT,
  ULTRA_HIGH_CHARM_THRESHOLD,
  ultraHighCharmCatchOutcomes,
  YARN_REWARD,
} from './rules';
import type {
  ApplyCatchInventoryResult,
  CatchResult,
  FishingBombResult,
  FishingFishResult,
  FishingInventory,
  FishingInventoryPatch,
  FishingItemMeta,
  FishingThiefEvent,
  FishingWaitRecord,
  FishingWaitResolution,
  FishingWaitStartedHandler,
  HookOutcomeKind,
  SellFishRequest,
  SellShellResult,
} from './types';
import { AlreadyFishingError, FishingBombRateLimitError } from './types';
import { createFishingWaitRecord } from './wait';

export class FishingService implements Disposable {
  private readonly fishingWaits = new Map<number, FishingWaitRecord>();
  private readonly lastFishingBombAtByUserId = new Map<number, number>();
  private disposing = false;

  constructor(
    private readonly db: DatabaseService,
    private readonly currency: CurrencyService,
    private readonly random: RandomService,
  ) {}

  async getInventory(userId: number): Promise<FishingInventory> {
    assertUserId(userId);

    return getInventoryIn(this.db.kysely, userId);
  }

  async buyRod(userId: number) {
    assertUserId(userId);

    return this.db.kysely.transaction().execute(async (trx) => {
      const balance = await this.currency.getIn(trx, userId);
      if (balance.shell < ROD_PRICE) {
        throw new Error(
          `你的微壳不足，购买鱼竿需要${ROD_PRICE}微壳\n当前微壳：${balance.shell}`,
        );
      }

      const nextBalance = await this.currency.spendIn(trx, userId, {
        shell: ROD_PRICE,
      });
      const inventory = await adjustInventoryIn(trx, userId, {
        rod: 1,
      });

      return {
        balance: nextBalance,
        inventory,
      };
    });
  }

  async fish(
    userId: number,
    onWaitStarted?: FishingWaitStartedHandler,
  ): Promise<FishingFishResult> {
    assertUserId(userId);

    if (this.disposing) {
      throw new Error('机器人正在关闭维护，请稍候再钓鱼');
    }

    if (this.fishingWaits.has(userId)) {
      throw new AlreadyFishingError();
    }

    const waitRecord = createFishingWaitRecord();
    this.fishingWaits.set(userId, waitRecord);

    const operation = this.fishWithWait(userId, waitRecord, onWaitStarted);
    waitRecord.operation = operation;

    try {
      return await operation;
    } finally {
      waitRecord.finish('settle');
      this.fishingWaits.delete(userId);
    }
  }

  isFishing(userId: number): boolean {
    assertUserId(userId);

    return this.fishingWaits.has(userId);
  }

  async dispose(): Promise<void> {
    this.disposing = true;

    const waits = [...this.fishingWaits.values()];
    for (const wait of waits) {
      wait.finish('settle');
    }

    await Promise.allSettled(
      waits.flatMap((wait) => (wait.operation ? [wait.operation] : [])),
    );
  }

  forfeitAllWaitingFish(): number {
    const waits = [...this.fishingWaits.values()];
    for (const wait of waits) {
      wait.finish('forfeit');
    }

    return waits.length;
  }

  async bombFish(userId: number): Promise<FishingBombResult> {
    assertUserId(userId);
    this.assertFishingBombCooldown(userId);

    if (this.fishingWaits.size < 1) {
      throw new Error('现在没有人在钓鱼');
    }

    const muteSeconds = pickRange(this.random, FISHING_BOMB_MUTE_SECONDS);
    const balance = await this.db.kysely.transaction().execute(async (trx) => {
      const current = await this.currency.getIn(trx, userId);
      if (current.bomb < 1) {
        throw new Error('炸弹不足\n发送【购买炸弹 数量】购买炸弹');
      }

      if (current.stamina < FISHING_BOMB_STAMINA_COST) {
        throw new Error(
          `体力不足，炸鱼需要${FISHING_BOMB_STAMINA_COST}体力\n当前体力：${current.stamina}`,
        );
      }

      if (current.charm < FISHING_BOMB_CHARM_COST) {
        throw new Error(
          `魅力不足，炸鱼需要${FISHING_BOMB_CHARM_COST}魅力\n当前魅力：${current.charm}`,
        );
      }

      return this.currency.spendIn(trx, userId, {
        bomb: 1,
        stamina: FISHING_BOMB_STAMINA_COST,
        charm: FISHING_BOMB_CHARM_COST,
      });
    });

    this.consumeFishingBombCooldown(userId);
    const waits = [...this.fishingWaits.values()];
    for (const wait of waits) {
      wait.bombLootUserId = userId;
      wait.finish('settle');
    }

    const settled = await Promise.allSettled(
      waits.flatMap((wait) => (wait.operation ? [wait.operation] : [])),
    );
    const results = settled.flatMap((item) =>
      item.status === 'fulfilled' ? [item.value as FishingFishResult] : [],
    );
    const loot = this.summarizeBombLoot(results);

    return {
      balance,
      settledCount: waits.length,
      stolenUserCount: loot.stolenUserCount,
      stolenCount: loot.stolenCount,
      stolenInventory: loot.stolenInventory,
      muteSeconds,
      staminaCost: FISHING_BOMB_STAMINA_COST,
      charmCost: FISHING_BOMB_CHARM_COST,
    };
  }

  private summarizeBombLoot(settled: readonly FishingFishResult[]): {
    stolenUserCount: number;
    stolenCount: number;
    stolenInventory: FishingInventory;
  } {
    const stolenInventory = createEmptyInventory();
    let stolenUserCount = 0;

    for (const result of settled) {
      if (result.outcome !== 'catch' || !result.bombLootInventory) {
        continue;
      }

      stolenUserCount += 1;
      for (const item of fishingItems) {
        stolenInventory[item.kind] += result.bombLootInventory[item.kind] ?? 0;
      }
    }

    return {
      stolenUserCount,
      stolenCount: calculateInventoryCount(stolenInventory),
      stolenInventory,
    };
  }

  private async fishWithWait(
    userId: number,
    waitRecord: FishingWaitRecord,
    onWaitStarted?: FishingWaitStartedHandler,
  ): Promise<FishingFishResult> {
    const result = await this.castLine(userId);
    await this.notifyWaitStarted(onWaitStarted);
    waitRecord.start(this.pickWaitMs(result.charm));
    const resolution = await waitRecord.wait;

    return this.settleFishResult(userId, waitRecord, result, resolution);
  }

  private async castLine(userId: number): Promise<FishingFishResult> {
    return this.db.kysely.transaction().execute(async (trx) => {
      await ensureInventoryRow(trx, userId);

      const inventory = await getInventoryIn(trx, userId);
      const balance = await this.currency.getIn(trx, userId);

      if (inventory.rod < 1) {
        throw new Error(`你没有鱼竿\n发送【玩法 钓鱼】查看玩法说明`);
      }

      if (balance.shell < BAIT_PRICE) {
        throw new Error(
          `你的微壳不足，钓鱼需要花费1W微壳购买鱼饵\n当前微壳：${balance.shell}`,
        );
      }

      if (balance.stamina < MIN_STAMINA_TO_FISH) {
        throw new Error(
          `你没有足够的体力来钓鱼，至少需要${MIN_STAMINA_TO_FISH}体力\n当前体力：${balance.stamina}`,
        );
      }

      const staminaCost = this.random.range(STAMINA_COST_MIN, STAMINA_COST_MAX);
      const paidBalance = await this.currency.spendIn(trx, userId, {
        shell: BAIT_PRICE,
        stamina: staminaCost,
      });

      const hookOutcome = this.pickHookOutcome(paidBalance.charm);
      if (hookOutcome === 'empty') {
        return {
          outcome: 'empty' as const,
          staminaCost,
          charm: paidBalance.charm,
          shellDelta: shellDelta(balance, paidBalance),
          balance: paidBalance,
          inventory,
        };
      }

      if (hookOutcome === 'yarn') {
        return {
          outcome: 'yarn' as const,
          staminaCost,
          charm: paidBalance.charm,
          shellDelta: shellDelta(balance, paidBalance),
          balance: paidBalance,
          inventory,
        };
      }

      const catchResult = this.pickCatchResult(
        paidBalance.charm,
        paidBalance.shell,
      );

      return {
        outcome: 'catch' as const,
        staminaCost,
        charm: paidBalance.charm,
        catchResult,
        shellDelta: shellDelta(balance, paidBalance),
        balance: paidBalance,
        inventory,
      };
    });
  }

  private async settleFishResult(
    userId: number,
    waitRecord: FishingWaitRecord,
    result: FishingFishResult,
    resolution: FishingWaitResolution,
  ): Promise<FishingFishResult> {
    if (resolution === 'forfeit') {
      return {
        outcome: 'interrupted',
        staminaCost: result.staminaCost,
        charm: result.charm,
        shellDelta: result.shellDelta,
        balance: result.balance,
        inventory: result.inventory,
      };
    }

    if (result.outcome === 'yarn') {
      const nextBalance = await this.currency.add(userId, {
        shell: YARN_REWARD,
      });

      return {
        ...result,
        shellDelta: result.shellDelta + shellDelta(result.balance, nextBalance),
        balance: nextBalance,
      };
    }

    if (result.outcome !== 'catch') {
      return result;
    }

    let nextBalance = result.balance;
    if (result.catchResult.currencyPatch) {
      nextBalance = await addCurrencySafelyIn(
        this.db.kysely,
        this.currency,
        userId,
        result.catchResult.currencyPatch,
      );
    }

    if (!result.catchResult.inventoryPatch) {
      return {
        ...result,
        shellDelta: result.shellDelta + shellDelta(result.balance, nextBalance),
        balance: nextBalance,
      };
    }

    const inventoryResult = await this.applyCatchInventory(
      userId,
      result.catchResult.inventoryPatch,
      waitRecord.bombLootUserId,
    );

    return {
      ...result,
      shellDelta: result.shellDelta + shellDelta(result.balance, nextBalance),
      balance: nextBalance,
      inventory: inventoryResult.inventory,
      thiefEvent: inventoryResult.thiefEvent,
      bombLootInventory: inventoryResult.bombLootInventory,
    };
  }

  private pickWaitMs(charm: number): number {
    return charm >= CHARM_HOOK_THRESHOLD
      ? this.random.range(HIGH_CHARM_WAIT_MIN_MS, HIGH_CHARM_WAIT_MAX_MS)
      : this.random.range(LOW_CHARM_WAIT_MIN_MS, LOW_CHARM_WAIT_MAX_MS);
  }

  private async notifyWaitStarted(
    onWaitStarted?: FishingWaitStartedHandler,
  ): Promise<void> {
    try {
      await onWaitStarted?.();
    } catch (error) {
      void error;
    }
  }

  private assertFishingBombCooldown(userId: number): void {
    const lastFishingBombAt = this.lastFishingBombAtByUserId.get(userId);
    if (lastFishingBombAt === undefined) {
      return;
    }

    const elapsedMs = Date.now() - lastFishingBombAt;
    if (elapsedMs < FISHING_BOMB_COOLDOWN_MS) {
      throw new FishingBombRateLimitError(FISHING_BOMB_COOLDOWN_MS - elapsedMs);
    }
  }

  private consumeFishingBombCooldown(userId: number): void {
    this.lastFishingBombAtByUserId.set(userId, Date.now());
  }

  async applyCatchInventory(
    userId: number,
    inventoryPatch: FishingInventoryPatch,
    bombLootUserId?: number,
  ): Promise<ApplyCatchInventoryResult> {
    assertUserId(userId);

    return this.db.kysely.transaction().execute(async (trx) => {
      let inventory = await adjustInventoryIn(trx, userId, inventoryPatch);
      let bombLootInventory: FishingInventory | undefined;

      if (bombLootUserId !== undefined) {
        const bombLootPatch = this.extractFishingItemPatch(inventoryPatch);

        if (this.hasAnyFishingItemPatch(bombLootPatch)) {
          inventory = await adjustInventoryIn(
            trx,
            userId,
            this.negateFishingItemPatch(bombLootPatch),
          );
          await adjustInventoryIn(trx, bombLootUserId, bombLootPatch);
          bombLootInventory = this.toFishingItemInventory(bombLootPatch);
        }
      }

      const thiefEvent = hasFishingItemGain(inventoryPatch)
        ? await this.applyThiefEventIn(trx, userId, inventory)
        : undefined;

      return {
        inventory,
        thiefEvent,
        bombLootInventory,
      };
    });
  }

  private extractFishingItemPatch(
    patch: FishingInventoryPatch,
  ): FishingInventoryPatch {
    const result: FishingInventoryPatch = {};

    for (const item of fishingItems) {
      const count = patch[item.kind] ?? 0;
      if (count > 0) {
        result[item.kind] = count;
      }
    }

    return result;
  }

  private hasAnyFishingItemPatch(patch: FishingInventoryPatch): boolean {
    return fishingItems.some((item) => (patch[item.kind] ?? 0) > 0);
  }

  private negateFishingItemPatch(
    patch: FishingInventoryPatch,
  ): FishingInventoryPatch {
    const result: FishingInventoryPatch = {};

    for (const item of fishingItems) {
      const count = patch[item.kind] ?? 0;
      if (count > 0) {
        result[item.kind] = -count;
      }
    }

    return result;
  }

  private toFishingItemInventory(
    patch: FishingInventoryPatch,
  ): FishingInventory {
    const result = createEmptyInventory();

    for (const item of fishingItems) {
      result[item.kind] = Math.max(0, patch[item.kind] ?? 0);
    }

    return result;
  }

  async sellFish(userId: number, item: FishingItemMeta) {
    assertUserId(userId);

    return this.db.kysely.transaction().execute(async (trx) => {
      await ensureInventoryRow(trx, userId);

      const inventory = await getInventoryIn(trx, userId);
      const balance = await this.currency.getIn(trx, userId);
      if (inventory[item.kind] < 1) {
        throw new Error(`你的${item.emoji}${item.name}不足`);
      }

      const shellResult = this.sellShell(item);
      const charmReward = this.sellCharm(item);
      const nextInventory = await adjustInventoryIn(trx, userId, {
        [item.kind]: -1,
      });
      const nextBalance = await addCurrencySafelyIn(
        trx,
        this.currency,
        userId,
        {
          shell: shellResult.shellReward,
          charm: charmReward,
        },
      );
      await this.clearThiefWarningIfSafeIn(trx, userId, nextInventory);

      return {
        inventory: nextInventory,
        balance: nextBalance,
        shellReward: shellDelta(balance, nextBalance),
        charmReward,
        message: shellResult.message,
      };
    });
  }

  async sellFishBatch(userId: number, requests: readonly SellFishRequest[]) {
    assertUserId(userId);

    return this.db.kysely.transaction().execute(async (trx) => {
      await ensureInventoryRow(trx, userId);

      const inventory = await getInventoryIn(trx, userId);
      const balance = await this.currency.getIn(trx, userId);
      for (const { item, count } of requests) {
        if (inventory[item.kind] < count) {
          throw new Error(
            `你的${item.emoji}${item.name}不足，需要${count}个，当前有${inventory[item.kind]}个`,
          );
        }
      }

      const inventoryPatch: FishingInventoryPatch = {};
      let shellReward = 0;
      let charmReward = 0;
      let soldCount = 0;
      const soldInventory = createEmptyInventory();
      const messages: string[] = [];

      for (const { item, count } of requests) {
        inventoryPatch[item.kind] = (inventoryPatch[item.kind] ?? 0) - count;
        soldInventory[item.kind] += count;
        soldCount += count;

        for (let i = 0; i < count; i++) {
          const itemShellResult = this.sellShell(item);
          if (itemShellResult.message) {
            messages.push(itemShellResult.message);
          }

          shellReward += itemShellResult.shellReward;
          charmReward += this.sellCharm(item);
        }
      }

      const nextInventory = await adjustInventoryIn(
        trx,
        userId,
        inventoryPatch,
      );
      const nextBalance = await addCurrencySafelyIn(
        trx,
        this.currency,
        userId,
        {
          shell: shellReward,
          charm: charmReward,
        },
      );
      await this.clearThiefWarningIfSafeIn(trx, userId, nextInventory);

      return {
        inventory: nextInventory,
        balance: nextBalance,
        shellReward: shellDelta(balance, nextBalance),
        charmReward,
        soldCount,
        soldItems: formatInventory(soldInventory),
        messages,
      };
    });
  }

  async sellAllFish(userId: number) {
    assertUserId(userId);

    return this.db.kysely.transaction().execute(async (trx) => {
      await ensureInventoryRow(trx, userId);

      const inventory = await getInventoryIn(trx, userId);
      const balance = await this.currency.getIn(trx, userId);
      if (!hasAnyFishingItem(inventory)) {
        throw new Error('你的鱼库里没有可以卖掉的鱼（和物品）');
      }

      const inventoryPatch: FishingInventoryPatch = {};
      let shellReward = 0;
      let charmReward = 0;
      let soldCount = 0;
      const messages: string[] = [];
      const soldItems = formatInventory(inventory);

      for (const item of fishingItems) {
        const count = inventory[item.kind];
        if (count < 1) {
          continue;
        }

        inventoryPatch[item.kind] = -count;
        soldCount += count;

        for (let i = 0; i < count; i++) {
          const itemShellResult = this.sellShell(item);
          if (itemShellResult.message) {
            messages.push(itemShellResult.message);
          }

          shellReward += itemShellResult.shellReward;
          charmReward += this.sellCharm(item);
        }
      }

      const nextInventory = await adjustInventoryIn(
        trx,
        userId,
        inventoryPatch,
      );
      const nextBalance = await addCurrencySafelyIn(
        trx,
        this.currency,
        userId,
        {
          shell: shellReward,
          charm: charmReward,
        },
      );
      await this.clearThiefWarningIfSafeIn(trx, userId, nextInventory);

      return {
        inventory: nextInventory,
        balance: nextBalance,
        shellReward: shellDelta(balance, nextBalance),
        charmReward,
        soldCount,
        soldItems,
        messages,
      };
    });
  }

  private pickHookOutcome(charm: number): HookOutcomeKind {
    const outcomes =
      charm >= EXTRA_HIGH_CHARM_THRESHOLD
        ? extraHighCharmHookOutcomes
        : charm >= CHARM_HOOK_THRESHOLD
          ? highCharmHookOutcomes
          : lowCharmHookOutcomes;

    return this.random.weightedPick(outcomes, (item) => item.weight).kind;
  }

  private pickCatchResult(charm: number, currentShell: number): CatchResult {
    const outcome = this.random.weightedPick(
      charm >= ULTRA_HIGH_CHARM_THRESHOLD
        ? ultraHighCharmCatchOutcomes
        : catchOutcomes,
      (item) => item.weight,
    );

    switch (outcome.kind) {
      case 'item':
        return addItemResult(outcome.itemKind);
      case 'rodLoss':
        return {
          text: '遇到霉运，起竿的时候鱼竿损坏了',
          inventoryPatch: {
            rod: -1,
          },
        };
      case 'shellLoss': {
        const loss = Math.min(currentShell, this.random.range(500, 2_000));
        return {
          text: `遇到霉运，起竿的时候掉了${loss}微壳`,
          currencyPatch: {
            shell: -loss,
          },
        };
      }
      case 'doubleYellowFish':
        return addItemResult('yellowFish', 2);
    }
  }

  private sellShell(item: FishingItemMeta): SellShellResult {
    const rule = sellShellRules[item.kind];

    if (rule.kind === 'range') {
      return { shellReward: pickRange(this.random, rule.shell) };
    }

    if (rule.kind === 'fixed') {
      return { shellReward: rule.shell };
    }

    if (rule.kind === 'weighted') {
      const outcome = this.random.weightedPick(
        rule.outcomes,
        (item) => item.weight,
      );

      if (outcome.kind === 'reward') {
        return { shellReward: pickRange(this.random, outcome.shell) };
      }

      return {
        shellReward: outcome.shell,
        message: outcome.message,
      };
    }

    const baseReward = pickRange(this.random, rule.baseShell);
    const eventOutcome = this.random.weightedPick(
      [
        { kind: rule.eventKind, weight: SPECIAL_SELL_EVENT_CHANCE_WEIGHT },
        { kind: 'normal', weight: SPECIAL_SELL_EVENT_NORMAL_WEIGHT },
      ],
      (item) => item.weight,
    );

    if (eventOutcome.kind === 'normal') {
      return { shellReward: baseReward };
    }

    const multiplier = this.random.range(
      SPECIAL_SELL_EVENT_MIN_MULTIPLIER,
      SPECIAL_SELL_EVENT_MAX_MULTIPLIER,
    );

    return {
      shellReward: baseReward * multiplier,
      message: rule.eventMessage(multiplier),
    };
  }

  private sellCharm(item: FishingItemMeta): number {
    const rule = sellCharmRules[item.kind];
    if (rule.kind === 'none') {
      return 0;
    }

    return pickRange(this.random, rule.charm);
  }

  private async clearThiefWarningIfSafeIn(
    db: QueryRunner,
    userId: number,
    inventory: FishingInventory,
  ): Promise<void> {
    const inventoryWeight = calculateInventoryWeight(inventory);
    if (inventoryWeight <= THIEF_CLEAR_WARNING_WEIGHT) {
      await clearThiefWarningIn(db, userId, inventoryWeight);
    }
  }

  private async applyThiefEventIn(
    db: QueryRunner,
    userId: number,
    inventory: FishingInventory,
  ): Promise<FishingThiefEvent | undefined> {
    const inventoryWeight = calculateInventoryWeight(inventory);
    const now = Date.now();

    if (inventoryWeight <= THIEF_CLEAR_WARNING_WEIGHT) {
      await clearThiefWarningIn(db, userId, inventoryWeight);
      return undefined;
    }

    if (inventoryWeight <= THIEF_WARNING_WEIGHT) {
      return undefined;
    }

    const state = await getThiefWarningIn(db, userId);
    if (!state?.warned) {
      await setThiefWarnedIn(db, userId, inventoryWeight, now);
      return {
        outcome: 'warning',
        inventoryWeight,
      };
    }

    if (
      state.last_stolen_at !== null &&
      now - state.last_stolen_at < THIEF_COOLDOWN_MS
    ) {
      await updateThiefWeightIn(db, userId, inventoryWeight);
      return undefined;
    }

    if (!this.random.bool(THIEF_STEAL_PROBABILITY)) {
      await updateThiefWeightIn(db, userId, inventoryWeight);
      return undefined;
    }

    const targetWeight = Math.min(
      THIEF_STEAL_MAX_WEIGHT,
      Math.max(
        THIEF_STEAL_MIN_WEIGHT,
        Math.floor(
          (inventoryWeight *
            this.random.range(
              THIEF_STEAL_MIN_PERCENT,
              THIEF_STEAL_MAX_PERCENT,
            )) /
            100,
        ),
      ),
    );
    const stolenItems = createStolenInventory(
      inventory,
      targetWeight,
      this.random,
    );
    const stolenWeight = calculateInventoryWeight(stolenItems);
    const stolenCount = calculateInventoryCount(stolenItems);

    if (stolenCount < 1) {
      await updateThiefWeightIn(db, userId, inventoryWeight);
      return undefined;
    }

    await adjustInventoryIn(db, userId, createThiefInventoryPatch(stolenItems));
    await updateThiefStolenIn(
      db,
      userId,
      Math.max(0, inventoryWeight - stolenWeight),
      stolenCount,
      stolenWeight,
      now,
    );

    return {
      outcome: 'stolen',
      inventoryWeight,
      stolenItems,
      stolenCount,
      stolenWeight,
    };
  }
}
