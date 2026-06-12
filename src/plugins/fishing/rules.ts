import type { RandomService } from '@fraqjs/plugin-random';

import type { KindedWeightedRule } from '../../util/rules';
import type {
  CatchResult,
  FishingInventory,
  FishingInventoryPatch,
  FishingInventoryRow,
  FishingItemKind,
  FishingItemMeta,
  HookOutcomeKind,
  SellCharmRule,
  SellFishTextParseResult,
  SellShellRule,
  WeightedCatchOutcome,
} from './types';

export const fishingItemKinds = [
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

export const fishingInventoryKinds = ['rod', ...fishingItemKinds] as const;

export const fishingItems: readonly FishingItemMeta[] = [
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

export const extraHighCharmHookOutcomes: readonly KindedWeightedRule<HookOutcomeKind>[] =
  [
    { kind: 'hooked', weight: 8 },
    { kind: 'yarn', weight: 1 },
    { kind: 'empty', weight: 1 },
  ];

export const highCharmHookOutcomes: readonly KindedWeightedRule<HookOutcomeKind>[] =
  [
    { kind: 'hooked', weight: 4 },
    { kind: 'yarn', weight: 1 },
    { kind: 'empty', weight: 1 },
  ];

export const lowCharmHookOutcomes: readonly KindedWeightedRule<HookOutcomeKind>[] =
  [
    { kind: 'hooked', weight: 2 },
    { kind: 'empty', weight: 1 },
    { kind: 'yarn', weight: 1 },
  ];

export const ultraHighCharmCatchOutcomes: readonly WeightedCatchOutcome[] = [
  { kind: 'item', itemKind: 'shoe', weight: 1 },
  { kind: 'item', itemKind: 'underwear', weight: 1 },
  { kind: 'item', itemKind: 'seashell', weight: 1 },
  { kind: 'item', itemKind: 'frog', weight: 3 },
  { kind: 'item', itemKind: 'yellowFish', weight: 3 },
  { kind: 'item', itemKind: 'octopus', weight: 3 },
  { kind: 'item', itemKind: 'whale', weight: 3 },
  { kind: 'item', itemKind: 'electricEel', weight: 1 },
  { kind: 'item', itemKind: 'diamondRing', weight: 2 },
  { kind: 'item', itemKind: 'crown', weight: 2 },
  { kind: 'rodLoss', weight: 1 },
  { kind: 'shellLoss', weight: 1 },
  { kind: 'doubleYellowFish', weight: 3 },
];

export const catchOutcomes: readonly WeightedCatchOutcome[] = [
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

export const sellShellRules: Record<FishingItemKind, SellShellRule> = {
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

export const sellCharmRules: Record<FishingItemKind, SellCharmRule> = {
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

export const fishingItemWeights: Record<FishingItemKind, number> = {
  shoe: 1,
  underwear: 1,
  seashell: 2,
  frog: 2,
  yellowFish: 2,
  octopus: 3,
  whale: 4,
  electricEel: 4,
  diamondRing: 6,
  crown: 10,
};

export const fishingItemByKind = new Map(
  fishingItems.map((item) => [item.kind, item]),
);

export const fishingItemsByNameLength = [...fishingItems].sort(
  (left, right) => right.name.length - left.name.length,
);

export const ROD_PRICE = 50_000;
export const BAIT_PRICE = 10_000;
export const MIN_STAMINA_TO_FISH = 20;
export const STAMINA_COST_MIN = 5;
export const STAMINA_COST_MAX = 20;
export const ULTRA_HIGH_CHARM_THRESHOLD = 50_000;
export const EXTRA_HIGH_CHARM_THRESHOLD = 20_000;
export const CHARM_HOOK_THRESHOLD = 5_000;
export const HIGH_CHARM_WAIT_MIN_MS = 10_000;
export const HIGH_CHARM_WAIT_MAX_MS = 20_000;
export const LOW_CHARM_WAIT_MIN_MS = 15_000;
export const LOW_CHARM_WAIT_MAX_MS = 30_000;
export const FISHING_BOMB_COOLDOWN_MS = 10 * 60 * 1000;
export const FISHING_BOMB_STAMINA_COST = 50;
export const FISHING_BOMB_CHARM_COST = 50;
export const FISHING_BOMB_MUTE_SECONDS = { min: 3 * 60, max: 5 * 60 } as const;
export const SPECIAL_SELL_EVENT_CHANCE_WEIGHT = 3;
export const SPECIAL_SELL_EVENT_NORMAL_WEIGHT = 7;
export const SPECIAL_SELL_EVENT_MIN_MULTIPLIER = 10;
export const SPECIAL_SELL_EVENT_MAX_MULTIPLIER = 15;
export const YARN_REWARD = 19_900;
export const THIEF_WARNING_WEIGHT = 80;
export const THIEF_CLEAR_WARNING_WEIGHT = 60;
export const THIEF_STEAL_PROBABILITY = 0.3;
export const THIEF_STEAL_MIN_PERCENT = 8;
export const THIEF_STEAL_MAX_PERCENT = 15;
export const THIEF_STEAL_MIN_WEIGHT = 10;
export const THIEF_STEAL_MAX_WEIGHT = 80;
export const THIEF_COOLDOWN_MS = 6 * 60 * 60 * 1000;
export const thiefStealableItemKinds = ['diamondRing', 'crown'] as const;

export function createEmptyInventory(): FishingInventory {
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

export function toInventory(row?: FishingInventoryRow): FishingInventory {
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

export function normalizeInventoryPatch(
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

export function createThiefPool(
  inventory: FishingInventory,
): FishingItemKind[] {
  const pool: FishingItemKind[] = [];

  for (const kind of thiefStealableItemKinds) {
    for (let index = 0; index < inventory[kind]; index++) {
      pool.push(kind);
    }
  }

  return pool;
}

export function createStolenInventory(
  inventory: FishingInventory,
  targetWeight: number,
  random: RandomService,
): FishingInventory {
  const stolenInventory = createEmptyInventory();
  const remainingInventory = { ...inventory };
  let remainingWeight = calculateInventoryWeight(remainingInventory);

  while (
    remainingWeight > 0 &&
    calculateInventoryWeight(stolenInventory) < targetWeight
  ) {
    const pool = createThiefPool(remainingInventory);
    if (pool.length < 1) {
      break;
    }

    const kind = random.pick(pool);
    remainingInventory[kind] -= 1;
    stolenInventory[kind] += 1;
    remainingWeight -= fishingItemWeights[kind];
  }

  return stolenInventory;
}

export function createThiefInventoryPatch(
  stolenInventory: FishingInventory,
): FishingInventoryPatch {
  const patch: FishingInventoryPatch = {};

  for (const item of fishingItems) {
    const count = stolenInventory[item.kind];
    if (count > 0) {
      patch[item.kind] = -count;
    }
  }

  return patch;
}

export function addItemResult(kind: FishingItemKind, count = 1): CatchResult {
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

export function hasAnyFishingItem(inventory: FishingInventory): boolean {
  return fishingItems.some((item) => inventory[item.kind] > 0);
}

export function hasFishingItemGain(patch: FishingInventoryPatch): boolean {
  return fishingItems.some((item) => (patch[item.kind] ?? 0) > 0);
}

export function calculateInventoryWeight(inventory: FishingInventory): number {
  return fishingItems.reduce((total, item) => {
    return total + inventory[item.kind] * fishingItemWeights[item.kind];
  }, 0);
}

export function calculateInventoryCount(inventory: FishingInventory): number {
  return fishingItems.reduce((total, item) => total + inventory[item.kind], 0);
}

export function parseSellFishText(text: string): SellFishTextParseResult {
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
