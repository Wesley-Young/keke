import type { QueryRunner } from '../../util/kysely';
import { DICK_PROFILE_TABLE, RANKING_LIMIT } from './constants';
import type { DickProfile, DickProfileRow, DickRanking } from './types';

export function nowIso(): string {
  return new Date().toISOString();
}

export function toProfile(row: DickProfileRow): DickProfile {
  return {
    userId: row.user_id,
    length: row.length,
  };
}

export async function getProfileIn(
  db: QueryRunner,
  userId: number,
): Promise<DickProfile | undefined> {
  const row = await db
    .selectFrom(DICK_PROFILE_TABLE)
    .selectAll()
    .where('user_id', '=', userId)
    .executeTakeFirst();

  return row ? toProfile(row as DickProfileRow) : undefined;
}

export async function insertProfileIn(
  db: QueryRunner,
  userId: number,
  length: number,
): Promise<DickProfile> {
  const timestamp = nowIso();

  await db
    .insertInto(DICK_PROFILE_TABLE)
    .values({
      user_id: userId,
      length,
      registered_at: timestamp,
      updated_at: timestamp,
    })
    .execute();

  return {
    userId,
    length,
  };
}

export async function setLengthIn(
  db: QueryRunner,
  userId: number,
  length: number,
): Promise<DickProfile> {
  if (!Number.isSafeInteger(length)) {
    throw new RangeError('length must be a safe integer');
  }

  await db
    .updateTable(DICK_PROFILE_TABLE)
    .set({
      length,
      updated_at: nowIso(),
    })
    .where('user_id', '=', userId)
    .execute();

  return {
    userId,
    length,
  };
}

export async function deleteProfileIn(
  db: QueryRunner,
  userId: number,
): Promise<void> {
  await db
    .deleteFrom(DICK_PROFILE_TABLE)
    .where('user_id', '=', userId)
    .execute();
}

export async function getRankingIn(db: QueryRunner): Promise<DickRanking> {
  const positiveRows = await db
    .selectFrom(DICK_PROFILE_TABLE)
    .select(['user_id', 'length'])
    .where('length', '>', 0)
    .orderBy('length', 'desc')
    .orderBy('user_id', 'asc')
    .limit(RANKING_LIMIT)
    .execute();
  const negativeRows = await db
    .selectFrom(DICK_PROFILE_TABLE)
    .select(['user_id', 'length'])
    .where('length', '<', 0)
    .orderBy('length', 'asc')
    .orderBy('user_id', 'asc')
    .limit(RANKING_LIMIT)
    .execute();

  return {
    positive: positiveRows.map((row) => ({
      userId: row.user_id,
      length: row.length,
    })),
    negative: negativeRows.map((row) => ({
      userId: row.user_id,
      length: row.length,
    })),
  };
}
