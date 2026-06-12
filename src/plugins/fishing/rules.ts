import type { RandomService } from '@fraqjs/plugin-random';

import { fishingInventoryKinds, thiefStealableItemKinds } from './constants';
import { fishingItems } from './items';
import type {
  CatchResult,
  FishingInventory,
  FishingInventoryPatch,
  FishingInventoryRow,
  FishingItemKind,
  SellFishTextParseResult,
} from './types';

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
