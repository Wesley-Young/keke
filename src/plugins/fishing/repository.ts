import type { QueryRunner } from '../../util/kysely';
import {
  createEmptyInventory,
  fishingInventoryKinds,
  normalizeInventoryPatch,
  toInventory,
} from './rules';
import type {
  FishingInventory,
  FishingInventoryPatch,
  FishingInventoryRow,
  FishingThiefWarningRow,
} from './types';

export const FISHING_INVENTORY_TABLE = 'fishing_inventory' as const;
export const FISHING_THIEF_WARNING_TABLE = 'fishing_thief_warning' as const;

export async function ensureInventoryRow(
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

export async function getInventoryIn(
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

export async function adjustInventoryIn(
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

export async function getThiefWarningIn(
  db: QueryRunner,
  userId: number,
): Promise<FishingThiefWarningRow | undefined> {
  return db
    .selectFrom(FISHING_THIEF_WARNING_TABLE)
    .selectAll()
    .where('user_id', '=', userId)
    .executeTakeFirst();
}

export async function setThiefWarnedIn(
  db: QueryRunner,
  userId: number,
  inventoryWeight: number,
  now: number,
): Promise<void> {
  await db
    .insertInto(FISHING_THIEF_WARNING_TABLE)
    .values({
      user_id: userId,
      warned: 1,
      warned_at: now,
      warned_weight: inventoryWeight,
      last_weight: inventoryWeight,
      last_stolen_at: null,
      stolen_count: 0,
      stolen_weight: 0,
    })
    .onConflict((oc) =>
      oc.column('user_id').doUpdateSet({
        warned: 1,
        warned_at: now,
        warned_weight: inventoryWeight,
        last_weight: inventoryWeight,
      }),
    )
    .execute();
}

export async function clearThiefWarningIn(
  db: QueryRunner,
  userId: number,
  inventoryWeight: number,
): Promise<void> {
  const state = await getThiefWarningIn(db, userId);
  if (!state) {
    return;
  }

  await db
    .updateTable(FISHING_THIEF_WARNING_TABLE)
    .set({
      warned: 0,
      warned_at: null,
      warned_weight: 0,
      last_weight: inventoryWeight,
    })
    .where('user_id', '=', userId)
    .execute();
}

export async function updateThiefWeightIn(
  db: QueryRunner,
  userId: number,
  inventoryWeight: number,
): Promise<void> {
  await db
    .updateTable(FISHING_THIEF_WARNING_TABLE)
    .set({
      last_weight: inventoryWeight,
    })
    .where('user_id', '=', userId)
    .execute();
}

export async function updateThiefStolenIn(
  db: QueryRunner,
  userId: number,
  inventoryWeight: number,
  stolenCount: number,
  stolenWeight: number,
  now: number,
): Promise<void> {
  const state = await getThiefWarningIn(db, userId);
  await db
    .updateTable(FISHING_THIEF_WARNING_TABLE)
    .set({
      last_weight: inventoryWeight,
      last_stolen_at: now,
      stolen_count: (state?.stolen_count ?? 0) + stolenCount,
      stolen_weight: (state?.stolen_weight ?? 0) + stolenWeight,
    })
    .where('user_id', '=', userId)
    .execute();
}
