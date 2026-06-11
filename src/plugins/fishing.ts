import { definePlugin, msg, param, type Session, seg } from '@fraqjs/fraq';
import { DatabaseService } from '@fraqjs/plugin-kysely';
import { RandomService } from '@fraqjs/plugin-random';

import type { QueryRunner } from '../util/kysely';
import {
  assertUserId,
  type KindedWeightedRule,
  pickRange,
  type Range,
} from '../util/rules';
import {
  type CurrencyBalance,
  type CurrencyPatch,
  CurrencyService,
  formatCurrencyChange,
} from './currency';

const FISHING_INVENTORY_TABLE = 'fishing_inventory' as const;

const ROD_PRICE = 50_000;
const BAIT_PRICE = 10_000;
const MIN_STAMINA_TO_FISH = 20;
const STAMINA_COST_MIN = 5;
const STAMINA_COST_MAX = 20;
const CHARM_HOOK_THRESHOLD = 5_000;
const HIGH_CHARM_WAIT_MIN_MS = 10_000;
const HIGH_CHARM_WAIT_MAX_MS = 20_000;
const LOW_CHARM_WAIT_MIN_MS = 15_000;
const LOW_CHARM_WAIT_MAX_MS = 30_000;
const SPECIAL_SELL_EVENT_CHANCE_WEIGHT = 3;
const SPECIAL_SELL_EVENT_NORMAL_WEIGHT = 7;
const SPECIAL_SELL_EVENT_MIN_MULTIPLIER = 10;
const SPECIAL_SELL_EVENT_MAX_MULTIPLIER = 15;
const YARN_REWARD = 19_900;

const fishingItemKinds = [
  'shoe',
  'underwear',
  'seashell',
  'frog',
  'yellowFish',
  'octopus',
  'whale',
  'electricEel',
  'diamondRing',
  'crown',
] as const;

const fishingInventoryKinds = ['rod', ...fishingItemKinds] as const;

type FishingItemKind = (typeof fishingItemKinds)[number];
type FishingInventoryKind = (typeof fishingInventoryKinds)[number];

type FishingInventory = Record<FishingInventoryKind, number>;
type FishingInventoryPatch = Partial<FishingInventory>;
type HookOutcomeKind = 'hooked' | 'empty' | 'yarn';

export interface FishingInventoryRow extends FishingInventory {
  user_id: number;
}

declare module '@fraqjs/plugin-kysely' {
  interface FraqDatabase {
    fishing_inventory: FishingInventoryRow;
  }
}

interface FishingItemMeta {
  kind: FishingItemKind;
  name: string;
  emoji: string;
}

interface CatchResult {
  text: string;
  inventoryPatch?: FishingInventoryPatch;
  currencyPatch?: CurrencyPatch;
}

interface SellShellResult {
  shellReward: number;
  message?: string;
}

interface SellFishRequest {
  item: FishingItemMeta;
  count: number;
}

type SellFishTextParseResult =
  | {
      ok: true;
      requests: SellFishRequest[];
    }
  | {
      ok: false;
      reason: string;
    };

type WeightedCatchOutcome =
  | { kind: 'item'; itemKind: FishingItemKind; weight: number }
  | {
      kind: 'rodLoss' | 'shellLoss' | 'doubleYellowFish';
      weight: number;
    };

type FishingFishResult =
  | {
      outcome: 'empty';
      staminaCost: number;
      charm: number;
      shellDelta: number;
      balance: CurrencyBalance;
      inventory: FishingInventory;
    }
  | {
      outcome: 'yarn';
      staminaCost: number;
      charm: number;
      shellDelta: number;
      balance: CurrencyBalance;
      inventory: FishingInventory;
    }
  | {
      outcome: 'catch';
      staminaCost: number;
      charm: number;
      catchResult: CatchResult;
      shellDelta: number;
      balance: CurrencyBalance;
      inventory: FishingInventory;
    };

type SellShellRule =
  | {
      kind: 'range';
      shell: Range;
    }
  | {
      kind: 'fixed';
      shell: number;
    }
  | {
      kind: 'specialMultiplier';
      baseShell: Range;
      eventKind: string;
      eventMessage(multiplier: number): string;
    }
  | {
      kind: 'weighted';
      outcomes: readonly SellShellOutcomeRule[];
    };

type SellShellOutcomeRule =
  | (KindedWeightedRule<'reward'> & {
      shell: Range;
    })
  | (KindedWeightedRule<'shock'> & {
      shell: number;
      message: string;
    });

type SellCharmRule =
  | {
      kind: 'none';
    }
  | {
      kind: 'range';
      charm: Range;
    };

const fishingItems: readonly FishingItemMeta[] = [
  {
    kind: 'shoe',
    name: '破鞋',
    emoji: '👞',
  },
  {
    kind: 'underwear',
    name: '内衣',
    emoji: '👙',
  },
  {
    kind: 'seashell',
    name: '贝壳',
    emoji: '🐚',
  },
  {
    kind: 'frog',
    name: '青蛙',
    emoji: '🐸',
  },
  {
    kind: 'yellowFish',
    name: '黄鱼',
    emoji: '🐠',
  },
  {
    kind: 'octopus',
    name: '章鱼',
    emoji: '🐙',
  },
  {
    kind: 'whale',
    name: '鲸鱼',
    emoji: '🐳',
  },
  {
    kind: 'electricEel',
    name: '电鳗',
    emoji: '⚡️',
  },
  {
    kind: 'diamondRing',
    name: '钻戒',
    emoji: '💎',
  },
  {
    kind: 'crown',
    name: '皇冠',
    emoji: '👑',
  },
];

const highCharmHookOutcomes: readonly KindedWeightedRule<HookOutcomeKind>[] = [
  { kind: 'hooked', weight: 4 },
  { kind: 'yarn', weight: 1 },
  { kind: 'empty', weight: 1 },
];

const lowCharmHookOutcomes: readonly KindedWeightedRule<HookOutcomeKind>[] = [
  { kind: 'hooked', weight: 2 },
  { kind: 'empty', weight: 1 },
  { kind: 'yarn', weight: 1 },
];

const catchOutcomes: readonly WeightedCatchOutcome[] = [
  { kind: 'item', itemKind: 'shoe', weight: 1 },
  { kind: 'item', itemKind: 'underwear', weight: 1 },
  { kind: 'item', itemKind: 'seashell', weight: 1 },
  { kind: 'item', itemKind: 'frog', weight: 1 },
  { kind: 'item', itemKind: 'yellowFish', weight: 1 },
  { kind: 'item', itemKind: 'octopus', weight: 1 },
  { kind: 'item', itemKind: 'whale', weight: 1 },
  { kind: 'item', itemKind: 'electricEel', weight: 1 },
  { kind: 'item', itemKind: 'diamondRing', weight: 1 },
  { kind: 'item', itemKind: 'crown', weight: 1 },
  { kind: 'rodLoss', weight: 1 },
  { kind: 'shellLoss', weight: 1 },
  { kind: 'doubleYellowFish', weight: 1 },
];

const sellShellRules: Record<FishingItemKind, SellShellRule> = {
  shoe: {
    kind: 'specialMultiplier',
    baseShell: { min: 2_000, max: 5_000 },
    eventKind: 'footFan',
    eventMessage: (multiplier) => `遇见神秘的足控，破鞋增值到${multiplier}倍`,
  },
  underwear: {
    kind: 'specialMultiplier',
    baseShell: { min: 8_000, max: 9_000 },
    eventKind: 'collector',
    eventMessage: (multiplier) =>
      `遇见神秘的内衣收藏家，内衣增值到${multiplier}倍`,
  },
  seashell: {
    kind: 'range',
    shell: { min: 15_000, max: 20_000 },
  },
  frog: {
    kind: 'range',
    shell: { min: 38_000, max: 45_000 },
  },
  yellowFish: {
    kind: 'range',
    shell: { min: 50_000, max: 60_000 },
  },
  octopus: {
    kind: 'range',
    shell: { min: 58_000, max: 65_000 },
  },
  whale: {
    kind: 'fixed',
    shell: 100_000,
  },
  electricEel: {
    kind: 'weighted',
    outcomes: [
      { kind: 'reward', weight: 1, shell: { min: 80_000, max: 120_000 } },
      { kind: 'shock', weight: 1, shell: -68_800, message: '电鳗把你电到了' },
    ],
  },
  diamondRing: {
    kind: 'fixed',
    shell: 180_000,
  },
  crown: {
    kind: 'fixed',
    shell: 300_000,
  },
};

const sellCharmRules: Record<FishingItemKind, SellCharmRule> = {
  shoe: { kind: 'none' },
  underwear: { kind: 'none' },
  seashell: { kind: 'none' },
  frog: { kind: 'none' },
  yellowFish: { kind: 'none' },
  octopus: { kind: 'none' },
  whale: { kind: 'none' },
  electricEel: { kind: 'none' },
  diamondRing: {
    kind: 'range',
    charm: { min: 50, max: 150 },
  },
  crown: {
    kind: 'range',
    charm: { min: 151, max: 250 },
  },
};

const fishingItemByKind = new Map(
  fishingItems.map((item) => [item.kind, item]),
);

const fishingItemsByNameLength = [...fishingItems].sort(
  (left, right) => right.name.length - left.name.length,
);

function createEmptyInventory(): FishingInventory {
  return {
    rod: 0,
    shoe: 0,
    underwear: 0,
    seashell: 0,
    frog: 0,
    yellowFish: 0,
    octopus: 0,
    whale: 0,
    electricEel: 0,
    diamondRing: 0,
    crown: 0,
  };
}

function toInventory(row?: FishingInventoryRow): FishingInventory {
  if (!row) {
    return createEmptyInventory();
  }

  return {
    rod: row.rod,
    shoe: row.shoe,
    underwear: row.underwear,
    seashell: row.seashell,
    frog: row.frog,
    yellowFish: row.yellowFish,
    octopus: row.octopus,
    whale: row.whale,
    electricEel: row.electricEel,
    diamondRing: row.diamondRing,
    crown: row.crown,
  };
}

function normalizeInventoryPatch(
  patch: FishingInventoryPatch,
): FishingInventoryPatch {
  const normalized: FishingInventoryPatch = {};

  for (const kind of fishingInventoryKinds) {
    const value = patch[kind];
    if (value === undefined) {
      continue;
    }

    if (!Number.isSafeInteger(value)) {
      throw new RangeError(`${kind} must be a safe integer`);
    }

    normalized[kind] = value;
  }

  return normalized;
}

async function ensureInventoryRow(
  db: QueryRunner,
  userId: number,
): Promise<void> {
  await db
    .insertInto(FISHING_INVENTORY_TABLE)
    .values({
      user_id: userId,
      ...createEmptyInventory(),
    })
    .onConflict((oc) => oc.column('user_id').doNothing())
    .execute();
}

async function getInventoryIn(
  db: QueryRunner,
  userId: number,
): Promise<FishingInventory> {
  const row = await db
    .selectFrom(FISHING_INVENTORY_TABLE)
    .selectAll()
    .where('user_id', '=', userId)
    .executeTakeFirst();

  return toInventory(row as FishingInventoryRow | undefined);
}

async function adjustInventoryIn(
  db: QueryRunner,
  userId: number,
  patch: FishingInventoryPatch,
): Promise<FishingInventory> {
  await ensureInventoryRow(db, userId);
  const current = await getInventoryIn(db, userId);
  const normalized = normalizeInventoryPatch(patch);
  const next = { ...current };

  for (const kind of fishingInventoryKinds) {
    const change = normalized[kind];
    if (change === undefined) {
      continue;
    }

    const updated = next[kind] + change;
    if (updated < 0) {
      throw new RangeError(`${kind} would become negative after adjustment`);
    }

    next[kind] = updated;
  }

  await db
    .updateTable(FISHING_INVENTORY_TABLE)
    .set(next)
    .where('user_id', '=', userId)
    .execute();

  return next;
}

function addItemResult(kind: FishingItemKind, count = 1): CatchResult {
  const item = fishingItemByKind.get(kind);
  if (!item) {
    throw new Error(`Unknown fishing item: ${kind}`);
  }

  return {
    text:
      count === 1
        ? `钓到${item.emoji}${item.name}`
        : `钓到${count}条${item.emoji}${item.name}`,
    inventoryPatch: {
      [kind]: count,
    },
  };
}

function repeatString(str: string, count: number): string {
  let result = '';
  for (let i = 0; i < count; i++) {
    result += str;
  }
  return result;
}

function formatInventory(inventory: FishingInventory): string {
  return fishingItems
    .map((item) => repeatString(item.emoji, inventory[item.kind]))
    .join('');
}

function formatFishPond(): string {
  return fishingItems.map((item) => `${item.emoji}${item.name}`).join(' ');
}

function formatSellEvents(messages: readonly string[]): string {
  if (messages.length < 1) {
    return '';
  }

  return `在售卖过程中遇到了如下事件：\n- ${messages.join('\n- ')}`;
}

function formatSellCurrencyChanges(
  balance: CurrencyBalance,
  shellReward: number,
  charmReward: number,
): string {
  const lines = [formatCurrencyChange('微壳', balance.shell, shellReward)];

  if (charmReward !== 0) {
    lines.push(formatCurrencyChange('魅力', balance.charm, charmReward));
  }

  return lines.join('\n');
}

function hasAnyFishingItem(inventory: FishingInventory): boolean {
  return fishingItems.some((item) => inventory[item.kind] > 0);
}

function parseSellFishText(text: string): SellFishTextParseResult {
  const input = text.trim();
  if (input.length < 1) {
    return {
      ok: false,
      reason: '请告诉我要卖什么，例如【卖鱼 青蛙】或【卖鱼 青蛙1 电鳗2】',
    };
  }

  const countsByKind = new Map<FishingItemKind, number>();
  let offset = 0;

  while (offset < input.length) {
    const spaceMatch = /^\s+/.exec(input.slice(offset));
    if (spaceMatch) {
      offset += spaceMatch[0].length;
      continue;
    }

    const item = fishingItemsByNameLength.find((item) =>
      input.startsWith(item.name, offset),
    );
    if (!item) {
      return {
        ok: false,
        reason: `没有找到这个种类：${input.slice(offset).trim()}`,
      };
    }

    offset += item.name.length;

    const countStartMatch = /^\s*/.exec(input.slice(offset));
    const countStart =
      offset + (countStartMatch ? countStartMatch[0].length : 0);
    const countMatch = /^\d+/.exec(input.slice(countStart));
    let count = 1;

    if (countMatch) {
      count = Number(countMatch[0]);
      offset = countStart + countMatch[0].length;
    }

    if (!Number.isSafeInteger(count) || count <= 0) {
      return {
        ok: false,
        reason: `${item.emoji}${item.name}的数量需要是正整数`,
      };
    }

    countsByKind.set(item.kind, (countsByKind.get(item.kind) ?? 0) + count);
  }

  const requests = fishingItems.flatMap((item) => {
    const count = countsByKind.get(item.kind);
    return count === undefined ? [] : [{ item, count }];
  });

  return {
    ok: true,
    requests,
  };
}

async function addCurrencySafelyIn(
  db: QueryRunner,
  currency: CurrencyService,
  userId: number,
  patch: CurrencyPatch,
): Promise<CurrencyBalance> {
  const current = await currency.getIn(db, userId);
  const nextPatch = { ...patch };

  if (nextPatch.shell !== undefined && current.shell + nextPatch.shell < 0) {
    nextPatch.shell = -current.shell;
  }

  return currency.adjustIn(db, userId, nextPatch);
}

function shellDelta(before: CurrencyBalance, after: CurrencyBalance): number {
  return after.shell - before.shell;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export class FishingService {
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

  async fish(userId: number): Promise<FishingFishResult> {
    assertUserId(userId);

    return this.db.kysely.transaction().execute(async (trx) => {
      await ensureInventoryRow(trx, userId);

      const inventory = await getInventoryIn(trx, userId);
      const balance = await this.currency.getIn(trx, userId);

      if (inventory.rod < 1) {
        throw new Error(
          `
你没有鱼竿，发送【购买鱼竿】可以花5W微壳购买

获得鱼竿后，发送【钓鱼】自动花费1W微壳购买鱼饵
每次钓鱼消耗${STAMINA_COST_MIN}-${STAMINA_COST_MAX}体力
体力至少需要${MIN_STAMINA_TO_FISH}
钓到的鱼可以卖掉换微壳和魅力，发送【卖鱼 物品名】出售
也可以发送【卖鱼 全部】出售所有的鱼（和物品）

发送【鱼塘】查看能够钓到的鱼（和别的东西）
发送【鱼库】查看拥有的鱼和鱼竿

鱼塘里有：${formatFishPond()}
        `.trim(),
        );
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
        const nextBalance = await this.currency.addIn(trx, userId, {
          shell: YARN_REWARD,
        });

        return {
          outcome: 'yarn' as const,
          staminaCost,
          charm: paidBalance.charm,
          shellDelta: shellDelta(balance, nextBalance),
          balance: nextBalance,
          inventory,
        };
      }

      const catchResult = this.pickCatchResult(paidBalance.shell);

      let nextInventory = inventory;
      if (catchResult.inventoryPatch) {
        nextInventory = await adjustInventoryIn(
          trx,
          userId,
          catchResult.inventoryPatch,
        );
      }

      let nextBalance = paidBalance;
      if (catchResult.currencyPatch) {
        nextBalance = await addCurrencySafelyIn(
          trx,
          this.currency,
          userId,
          catchResult.currencyPatch,
        );
      }

      return {
        outcome: 'catch' as const,
        staminaCost,
        charm: paidBalance.charm,
        catchResult,
        shellDelta: shellDelta(balance, nextBalance),
        balance: nextBalance,
        inventory: nextInventory,
      };
    });
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
      charm >= CHARM_HOOK_THRESHOLD
        ? highCharmHookOutcomes
        : lowCharmHookOutcomes;

    return this.random.weightedPick(outcomes, (item) => item.weight).kind;
  }

  private pickCatchResult(currentShell: number): CatchResult {
    const outcome = this.random.weightedPick(
      catchOutcomes,
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
}

export const FishingPlugin = definePlugin({
  name: 'fishing',
  provides: [FishingService],
  inject: {
    db: DatabaseService,
    currency: CurrencyService,
    random: RandomService,
  },
  apply(ctx) {
    const fishing = new FishingService(ctx.db, ctx.currency, ctx.random);
    const fishingUserIds = new Set<number>();
    const replyError = async (
      session: Session,
      error: unknown,
      fallback: string,
    ) => {
      const message = session.raw;
      await session.reply(msg`
${seg.mention(message.sender_id)}
${error instanceof Error ? error.message : fallback}
      `);
    };

    ctx.provide(FishingService, fishing);

    ctx.db.schemas.register({
      name: 'fishing',
      migrations: {
        '001_init_fishing_inventory_table': {
          async up(db) {
            await db.schema
              .createTable(FISHING_INVENTORY_TABLE)
              .ifNotExists()
              .addColumn('user_id', 'integer', (column) => column.notNull())
              .addColumn('rod', 'integer', (column) =>
                column.notNull().defaultTo(0),
              )
              .addColumn('shoe', 'integer', (column) =>
                column.notNull().defaultTo(0),
              )
              .addColumn('underwear', 'integer', (column) =>
                column.notNull().defaultTo(0),
              )
              .addColumn('seashell', 'integer', (column) =>
                column.notNull().defaultTo(0),
              )
              .addColumn('frog', 'integer', (column) =>
                column.notNull().defaultTo(0),
              )
              .addColumn('yellowFish', 'integer', (column) =>
                column.notNull().defaultTo(0),
              )
              .addColumn('octopus', 'integer', (column) =>
                column.notNull().defaultTo(0),
              )
              .addColumn('whale', 'integer', (column) =>
                column.notNull().defaultTo(0),
              )
              .addColumn('electricEel', 'integer', (column) =>
                column.notNull().defaultTo(0),
              )
              .addColumn('diamondRing', 'integer', (column) =>
                column.notNull().defaultTo(0),
              )
              .addColumn('crown', 'integer', (column) =>
                column.notNull().defaultTo(0),
              )
              .addPrimaryKeyConstraint('fishing_inventory_pk', ['user_id'])
              .execute();
          },
        },
      },
    });

    ctx.router.command('购买鱼竿').execute(async (session) => {
      const message = session.raw;

      try {
        const result = await fishing.buyRod(message.sender_id);

        await session.reply(msg`
${seg.mention(message.sender_id)}
购买成功
当前鱼竿：${result.inventory.rod}个
${formatCurrencyChange('微壳', result.balance.shell, -ROD_PRICE)}
      `);
      } catch (error) {
        await replyError(session, error, '购买鱼竿失败');
      }
    });

    ctx.router.command('钓鱼').execute(async (session) => {
      const message = session.raw;
      if (fishingUserIds.has(message.sender_id)) {
        return;
      }

      fishingUserIds.add(message.sender_id);

      try {
        const result = await fishing.fish(message.sender_id);

        await ctx.client.send_group_message_reaction({
          group_id: message.peer_id,
          message_seq: message.message_seq,
          reaction: '424',
        });

        const waitMs =
          result.charm >= CHARM_HOOK_THRESHOLD
            ? ctx.random.range(HIGH_CHARM_WAIT_MIN_MS, HIGH_CHARM_WAIT_MAX_MS)
            : ctx.random.range(LOW_CHARM_WAIT_MIN_MS, LOW_CHARM_WAIT_MAX_MS);

        await sleep(waitMs);

        if (result.outcome === 'empty') {
          await session.reply(msg`
${seg.mention(message.sender_id)}
毛线都没钓到
${formatCurrencyChange('微壳', result.balance.shell, result.shellDelta)}
${formatCurrencyChange('体力', result.balance.stamina, -result.staminaCost)}
        `);
          return;
        }

        if (result.outcome === 'yarn') {
          await session.reply(msg`
${seg.mention(message.sender_id)}
钓到了🧶毛线！自动转化为${YARN_REWARD}微壳
${formatCurrencyChange('微壳', result.balance.shell, result.shellDelta)}
${formatCurrencyChange('体力', result.balance.stamina, -result.staminaCost)}
        `);
          return;
        }

        await session.reply(msg`
${seg.mention(message.sender_id)}
${result.catchResult.text}
当前鱼竿：${result.inventory.rod}
${formatCurrencyChange('微壳', result.balance.shell, result.shellDelta)}
${formatCurrencyChange('体力', result.balance.stamina, -result.staminaCost)}
      `);
      } catch (error) {
        await replyError(session, error, '钓鱼失败');
      } finally {
        fishingUserIds.delete(message.sender_id);
      }
    });

    ctx.router.command('鱼库').execute(async (session) => {
      const message = session.raw;
      const inventory = await fishing.getInventory(message.sender_id);

      await session.reply(msg`
${seg.mention(message.sender_id)}
你有${inventory.rod}个🎣鱼竿
钓鱼收获：${formatInventory(inventory)}
      `);
    });

    ctx.router
      .command('卖鱼')
      .arg('content', param.greedy())
      .execute(async (session, { content }) => {
        const message = session.raw;
        const sellText = content.trim();

        try {
          if (sellText === '全部') {
            const result = await fishing.sellAllFish(message.sender_id);

            await session.reply(msg`
${seg.mention(message.sender_id)}
成功售卖所有收获，共${result.soldCount}个
${result.soldItems}
${formatSellEvents(result.messages)}
${formatSellCurrencyChanges(
  result.balance,
  result.shellReward,
  result.charmReward,
)}
          `);
            return;
          }

          const parseResult = parseSellFishText(sellText);
          if (!parseResult.ok) {
            await session.reply(msg`
${seg.mention(message.sender_id)}
${parseResult.reason}
可以发送【查看鱼塘】看看能卖什么
          `);
            return;
          }

          if (parseResult.requests.length === 1) {
            const [{ item, count }] = parseResult.requests;
            if (count === 1) {
              const result = await fishing.sellFish(message.sender_id, item);

              await session.reply(msg`
${seg.mention(message.sender_id)}
成功售卖了${item.emoji}${item.name}
${formatSellEvents(result.message ? [result.message] : [])}
${formatSellCurrencyChanges(
  result.balance,
  result.shellReward,
  result.charmReward,
)}
        `);
              return;
            }
          }

          const result = await fishing.sellFishBatch(
            message.sender_id,
            parseResult.requests,
          );

          await session.reply(msg`
${seg.mention(message.sender_id)}
成功售卖了${result.soldCount}个收获
${result.soldItems}
${formatSellEvents(result.messages)}
${formatSellCurrencyChanges(
  result.balance,
  result.shellReward,
  result.charmReward,
)}
        `);
        } catch (error) {
          await replyError(session, error, '卖鱼失败');
        }
      });

    ctx.router.command('鱼塘').execute(async (session) => {
      const message = session.raw;
      await session.reply(msg`
${seg.mention(message.sender_id)}
${formatFishPond()}
      `);
    });
  },
});

export default FishingPlugin;
