import { definePlugin, msg, param, seg } from '@fraqjs/fraq';
import { DatabaseService } from '@fraqjs/plugin-kysely';
import { RandomService } from '@fraqjs/plugin-random';

import {
  type CurrencyBalance,
  type CurrencyPatch,
  CurrencyService,
} from './currency';

const FISHING_INVENTORY_TABLE = 'fishing_inventory' as const;

const ROD_PRICE = 50_000;
const BAIT_PRICE = 10_000;
const MIN_STAMINA_TO_FISH = 20;
const STAMINA_COST_MIN = 5;
const STAMINA_COST_MAX = 20;
const CHARM_HOOK_THRESHOLD = 5_000;
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

export interface FishingInventoryRow extends FishingInventory {
  user_id: number;
}

declare module '@fraqjs/plugin-kysely' {
  interface FraqDatabase {
    fishing_inventory: FishingInventoryRow;
  }
}

type FishingQueryRunner = Pick<
  DatabaseService['kysely'],
  'selectFrom' | 'insertInto' | 'updateTable'
>;

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

interface WeightedHookOutcome {
  outcome: 'hooked' | 'empty' | 'yarn';
  weight: number;
}

type WeightedCatchOutcome =
  | { kind: 'item'; itemKind: FishingItemKind; weight: number }
  | {
      kind: 'rodLoss' | 'shellLoss' | 'doubleYellowFish' | 'diamondRing';
      weight: number;
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

const fishingItemByKind = new Map(
  fishingItems.map((item) => [item.kind, item]),
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
  db: FishingQueryRunner,
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
  db: FishingQueryRunner,
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
  db: FishingQueryRunner,
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

function formatSellReward(shellReward: number, charmReward: number): string {
  const shellText =
    shellReward >= 0
      ? `奖励${shellReward}微壳`
      : `损失${Math.abs(shellReward)}微壳`;

  if (charmReward > 0) {
    return `${shellText}，获得${charmReward}魅力`;
  }

  return shellText;
}

function hasAnyFishingItem(inventory: FishingInventory): boolean {
  return fishingItems.some((item) => inventory[item.kind] > 0);
}

async function addCurrencySafelyIn(
  db: FishingQueryRunner,
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

export const FishingPlugin = definePlugin({
  name: 'fishing',
  inject: {
    db: DatabaseService,
    currency: CurrencyService,
    random: RandomService,
  },
  apply(ctx) {
    const pickHookOutcome = (charm: number): 'hooked' | 'empty' | 'yarn' => {
      const outcomes: readonly WeightedHookOutcome[] =
        charm >= CHARM_HOOK_THRESHOLD
          ? [
              { outcome: 'hooked', weight: 1 },
              { outcome: 'empty', weight: 1 },
            ]
          : [
              { outcome: 'hooked', weight: 2 },
              { outcome: 'empty', weight: 1 },
              { outcome: 'yarn', weight: 1 },
            ];

      return ctx.random.weightedPick(outcomes, (item) => item.weight).outcome;
    };

    const pickCatchResult = (currentShell: number): CatchResult => {
      const outcome = ctx.random.weightedPick(
        [
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
        ] satisfies readonly WeightedCatchOutcome[],
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
          const loss = Math.min(currentShell, ctx.random.range(500, 2_000));
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
    };

    const sellShell = (item: FishingItemMeta): number => {
      switch (item.kind) {
        case 'shoe':
          return ctx.random.range(2_000, 5_000);
        case 'underwear':
          return ctx.random.range(8_000, 9_000);
        case 'seashell':
          return ctx.random.range(15_000, 20_000);
        case 'frog':
          return ctx.random.range(38_000, 45_000);
        case 'yellowFish':
          return ctx.random.range(50_000, 60_000);
        case 'octopus':
          return ctx.random.range(58_000, 65_000);
        case 'whale':
          return 100_000;
        case 'electricEel': {
          const outcome = ctx.random.weightedPick(
            [
              { kind: 'reward', weight: 1 },
              { kind: 'shock', weight: 1 },
            ],
            (item) => item.weight,
          );

          return outcome.kind === 'reward'
            ? ctx.random.range(80_000, 120_000)
            : -68_800;
        }
        case 'diamondRing':
          return 180_000;
        case 'crown':
          return 300_000;
      }
    };

    const sellCharm = (item: FishingItemMeta): number => {
      switch (item.kind) {
        case 'diamondRing':
          return ctx.random.range(50, 150);
        case 'crown':
          return ctx.random.range(151, 250);
        default:
          return 0;
      }
    };

    const buyRod = async (userId: number) => {
      return ctx.db.kysely.transaction().execute(async (trx) => {
        const balance = await ctx.currency.getIn(trx, userId);
        if (balance.shell < ROD_PRICE) {
          return {
            ok: false as const,
            balance,
            inventory: await getInventoryIn(trx, userId),
          };
        }

        const nextBalance = await ctx.currency.spendIn(trx, userId, {
          shell: ROD_PRICE,
        });
        const inventory = await adjustInventoryIn(trx, userId, {
          rod: 1,
        });

        return {
          ok: true as const,
          balance: nextBalance,
          inventory,
        };
      });
    };

    const fish = async (userId: number) => {
      return ctx.db.kysely.transaction().execute(async (trx) => {
        await ensureInventoryRow(trx, userId);

        const inventory = await getInventoryIn(trx, userId);
        const balance = await ctx.currency.getIn(trx, userId);

        if (inventory.rod < 1) {
          return {
            ok: false as const,
            reason: 'noRod' as const,
            balance,
            inventory,
          };
        }

        if (balance.shell < BAIT_PRICE) {
          return {
            ok: false as const,
            reason: 'noShell' as const,
            balance,
            inventory,
          };
        }

        if (balance.stamina < MIN_STAMINA_TO_FISH) {
          return {
            ok: false as const,
            reason: 'noStamina' as const,
            balance,
            inventory,
          };
        }

        const staminaCost = ctx.random.range(
          STAMINA_COST_MIN,
          STAMINA_COST_MAX,
        );
        const paidBalance = await ctx.currency.spendIn(trx, userId, {
          shell: BAIT_PRICE,
          stamina: staminaCost,
        });

        const hookOutcome = pickHookOutcome(paidBalance.charm);
        if (hookOutcome === 'empty') {
          return {
            ok: true as const,
            outcome: 'empty' as const,
            staminaCost,
            balance: paidBalance,
            inventory,
          };
        }

        if (hookOutcome === 'yarn') {
          const nextBalance = await ctx.currency.addIn(trx, userId, {
            shell: YARN_REWARD,
          });

          return {
            ok: true as const,
            outcome: 'yarn' as const,
            staminaCost,
            balance: nextBalance,
            inventory,
          };
        }

        const catchResult = pickCatchResult(paidBalance.shell);

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
            ctx.currency,
            userId,
            catchResult.currencyPatch,
          );
        }

        return {
          ok: true as const,
          outcome: 'catch' as const,
          staminaCost,
          catchResult,
          balance: nextBalance,
          inventory: nextInventory,
        };
      });
    };

    const sellFish = async (userId: number, item: FishingItemMeta) => {
      return ctx.db.kysely.transaction().execute(async (trx) => {
        await ensureInventoryRow(trx, userId);

        const inventory = await getInventoryIn(trx, userId);
        const balance = await ctx.currency.getIn(trx, userId);
        if (inventory[item.kind] < 1) {
          return {
            ok: false as const,
            inventory,
            balance,
          };
        }

        const shellReward = sellShell(item);
        const charmReward = sellCharm(item);
        const nextInventory = await adjustInventoryIn(trx, userId, {
          [item.kind]: -1,
        });
        const nextBalance = await addCurrencySafelyIn(
          trx,
          ctx.currency,
          userId,
          {
            shell: shellReward,
            charm: charmReward,
          },
        );

        return {
          ok: true as const,
          inventory: nextInventory,
          balance: nextBalance,
          shellReward: shellDelta(balance, nextBalance),
          charmReward,
        };
      });
    };

    const sellAllFish = async (userId: number) => {
      return ctx.db.kysely.transaction().execute(async (trx) => {
        await ensureInventoryRow(trx, userId);

        const inventory = await getInventoryIn(trx, userId);
        const balance = await ctx.currency.getIn(trx, userId);
        if (!hasAnyFishingItem(inventory)) {
          return {
            ok: false as const,
            inventory,
            balance,
          };
        }

        const inventoryPatch: FishingInventoryPatch = {};
        let shellReward = 0;
        let charmReward = 0;
        let soldCount = 0;
        let electricEelShockCount = 0;
        const soldItems = formatInventory(inventory);

        for (const item of fishingItems) {
          const count = inventory[item.kind];
          if (count < 1) {
            continue;
          }

          inventoryPatch[item.kind] = -count;
          soldCount += count;

          for (let i = 0; i < count; i++) {
            const itemShellReward = sellShell(item);
            if (item.kind === 'electricEel' && itemShellReward < 0) {
              electricEelShockCount++;
            }

            shellReward += itemShellReward;
            charmReward += sellCharm(item);
          }
        }

        const nextInventory = await adjustInventoryIn(
          trx,
          userId,
          inventoryPatch,
        );
        const nextBalance = await addCurrencySafelyIn(
          trx,
          ctx.currency,
          userId,
          {
            shell: shellReward,
            charm: charmReward,
          },
        );

        return {
          ok: true as const,
          inventory: nextInventory,
          balance: nextBalance,
          shellReward: shellDelta(balance, nextBalance),
          charmReward,
          soldCount,
          soldItems,
          electricEelShockCount,
        };
      });
    };

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
      const result = await buyRod(message.sender_id);

      if (!result.ok) {
        await session.reply(msg`
${seg.mention(message.sender_id)}
你的微壳不足，购买鱼竿需要${ROD_PRICE}微壳
当前微壳：${result.balance.shell}
        `);
        return;
      }

      await session.reply(msg`
${seg.mention(message.sender_id)}
购买成功
当前鱼竿：${result.inventory.rod}个
当前微壳：${result.balance.shell}
      `);
    });

    ctx.router.command('钓鱼').execute(async (session) => {
      const message = session.raw;
      const result = await fish(message.sender_id);

      if (!result.ok) {
        if (result.reason === 'noRod') {
          await session.reply(msg`
${seg.mention(message.sender_id)}
你没有鱼竿，发送【购买鱼竿】可以花5W微壳购买

获得鱼竿后，发送【钓鱼】自动花费1W微壳购买鱼饵
每次钓鱼消耗${STAMINA_COST_MIN}-${STAMINA_COST_MAX}体力
体力至少需要${MIN_STAMINA_TO_FISH}
钓到的鱼可以卖掉换微壳和魅力，发送【卖鱼 物品名】出售
也可以发送【卖鱼 全部】出售所有的鱼（和物品）

发送【鱼塘】查看能够钓到的鱼（和别的东西）
发送【鱼库】查看拥有的鱼和鱼竿

鱼塘里有：${formatFishPond()}
          `);
          return;
        }

        if (result.reason === 'noShell') {
          await session.reply(msg`
${seg.mention(message.sender_id)}
你的微壳不足，钓鱼需要花费1W微壳购买鱼饵
当前微壳：${result.balance.shell}
          `);
          return;
        }

        await session.reply(msg`
${seg.mention(message.sender_id)}
你没有足够的体力来钓鱼，至少需要${MIN_STAMINA_TO_FISH}体力
当前体力：${result.balance.stamina}
        `);
        return;
      }

      if (result.outcome === 'empty') {
        await session.reply(msg`
${seg.mention(message.sender_id)}
毛线都没钓到
花费鱼饵：${BAIT_PRICE}微壳
花费体力：${result.staminaCost}
当前微壳：${result.balance.shell}
当前体力：${result.balance.stamina}
        `);
        return;
      }

      if (result.outcome === 'yarn') {
        await session.reply(msg`
${seg.mention(message.sender_id)}
钓到了🧶毛线！自动转化为${YARN_REWARD}微壳
花费鱼饵：${BAIT_PRICE}微壳
花费体力：${result.staminaCost}
当前微壳：${result.balance.shell}
当前体力：${result.balance.stamina}
        `);
        return;
      }

      await session.reply(msg`
${seg.mention(message.sender_id)}
${result.catchResult.text}
花费鱼饵：${BAIT_PRICE}微壳
花费体力：${result.staminaCost}
当前鱼竿：${result.inventory.rod}
当前微壳：${result.balance.shell}
当前体力：${result.balance.stamina}
      `);
    });

    ctx.router.command('鱼库').execute(async (session) => {
      const message = session.raw;
      const inventory = await getInventoryIn(ctx.db.kysely, message.sender_id);

      await session.reply(msg`
${seg.mention(message.sender_id)}
你有${inventory.rod}个🎣鱼竿
钓鱼收获：${formatInventory(inventory)}
      `);
    });

    ctx.router
      .command('卖鱼')
      .arg('itemName', param.str())
      .execute(async (session, { itemName }) => {
        const message = session.raw;

        if (itemName === '全部') {
          const result = await sellAllFish(message.sender_id);
          if (!result.ok) {
            await session.reply(msg`
${seg.mention(message.sender_id)}
你的鱼库里没有可以卖掉的鱼（和物品）
            `);
            return;
          }

          await session.reply(msg`
${seg.mention(message.sender_id)}
成功售卖所有收获，共${result.soldCount}个
${result.soldItems}
${result.electricEelShockCount > 0 ? `被电鳗电到了${result.electricEelShockCount}次` : ''}
${formatSellReward(result.shellReward, result.charmReward)}
当前微壳：${result.balance.shell}
当前魅力：${result.balance.charm}
          `);
          return;
        }

        const item = fishingItems.find((item) => item.name === itemName);
        if (!item) {
          await session.reply(msg`
${seg.mention(message.sender_id)}
没有找到这个种类：${itemName}
可以发送【查看鱼塘】看看能卖什么
          `);
          return;
        }

        const result = await sellFish(message.sender_id, item);
        if (!result.ok) {
          await session.reply(msg`
${seg.mention(message.sender_id)}
你的${item.emoji}${item.name}不足
        `);
          return;
        }

        await session.reply(msg`
${seg.mention(message.sender_id)}
${
  result.shellReward < 0 && item.kind === 'electricEel'
    ? `电鳗把你电到了`
    : `成功售卖了${item.emoji}${item.name}`
}，${formatSellReward(result.shellReward, result.charmReward)}
当前微壳：${result.balance.shell}
当前魅力：${result.balance.charm}
        `);
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
