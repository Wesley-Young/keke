import { definePlugin } from '@fraqjs/fraq';
import { DatabaseService } from '@fraqjs/plugin-kysely';

export const currencyKinds = ['shell', 'stamina', 'charm', 'bomb'] as const;

export type CurrencyKind = (typeof currencyKinds)[number];

export interface CurrencyRef {
  groupId: number;
  userId: number;
}

export interface CurrencyBalance {
  shell: number;
  stamina: number;
  charm: number;
  bomb: number;
}

export type CurrencySet = Partial<CurrencyBalance>;
export type CurrencyDelta = Partial<Record<CurrencyKind, number>>;

export interface CurrencyTransferOptions {
  reason?: string;
}

export type CurrencyQueryRunner = Pick<
  DatabaseService['kysely'],
  'selectFrom' | 'insertInto' | 'updateTable'
>;

export interface CurrencyAccountRow extends CurrencyBalance {
  group_id: number;
  user_id: number;
}

declare module '@fraqjs/plugin-kysely' {
  interface FraqDatabase {
    currency_accounts: CurrencyAccountRow;
  }
}

const CURRENCY_TABLE = 'currency_accounts' as const;

function createZeroBalance(): CurrencyBalance {
  return {
    shell: 0,
    stamina: 0,
    charm: 0,
    bomb: 0,
  };
}

function assertSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${label} must be a safe integer`);
  }
}

function assertNonNegativeInteger(value: number, label: string): void {
  assertSafeInteger(value, label);
  if (value < 0) {
    throw new RangeError(`${label} must be greater than or equal to 0`);
  }
}

function assertPositiveInteger(value: number, label: string): void {
  assertSafeInteger(value, label);
  if (value <= 0) {
    throw new RangeError(`${label} must be greater than 0`);
  }
}

function assertRef(ref: CurrencyRef): void {
  assertSafeInteger(ref.groupId, 'groupId');
  assertSafeInteger(ref.userId, 'userId');
}

function toBalance(row?: CurrencyAccountRow): CurrencyBalance {
  if (!row) {
    return createZeroBalance();
  }

  return {
    shell: row.shell,
    stamina: row.stamina,
    charm: row.charm,
    bomb: row.bomb,
  };
}

function normalizePatch(
  patch: CurrencySet | CurrencyDelta,
  allowNegative: boolean,
): Partial<CurrencyBalance> {
  const normalized: Partial<CurrencyBalance> = {};

  for (const kind of currencyKinds) {
    const value = patch[kind];
    if (value === undefined) {
      continue;
    }

    assertSafeInteger(value, kind);
    if (!allowNegative) {
      assertNonNegativeInteger(value, kind);
    }

    normalized[kind] = value;
  }

  return normalized;
}

export class CurrencyService {
  constructor(private readonly db: DatabaseService) {}

  async get(ref: CurrencyRef): Promise<CurrencyBalance> {
    return this.getIn(this.db.kysely, ref);
  }

  async getIn(
    db: CurrencyQueryRunner,
    ref: CurrencyRef,
  ): Promise<CurrencyBalance> {
    assertRef(ref);

    const row = await db
      .selectFrom(CURRENCY_TABLE)
      .selectAll()
      .where('group_id', '=', ref.groupId)
      .where('user_id', '=', ref.userId)
      .executeTakeFirst();

    return toBalance(row as CurrencyAccountRow | undefined);
  }

  async getOne(ref: CurrencyRef, kind: CurrencyKind): Promise<number> {
    const balance = await this.get(ref);
    return balance[kind];
  }

  async ensure(
    ref: CurrencyRef,
    initial: CurrencySet = {},
  ): Promise<CurrencyBalance> {
    return this.ensureIn(this.db.kysely, ref, initial);
  }

  async ensureIn(
    db: CurrencyQueryRunner,
    ref: CurrencyRef,
    initial: CurrencySet = {},
  ): Promise<CurrencyBalance> {
    assertRef(ref);
    const patch = normalizePatch(initial, false);

    await db
      .insertInto(CURRENCY_TABLE)
      .values({
        group_id: ref.groupId,
        user_id: ref.userId,
        shell: patch.shell ?? 0,
        stamina: patch.stamina ?? 0,
        charm: patch.charm ?? 0,
        bomb: patch.bomb ?? 0,
      })
      .onConflict((oc) => oc.columns(['group_id', 'user_id']).doNothing())
      .execute();

    return this.getIn(db, ref);
  }

  async set(ref: CurrencyRef, patch: CurrencySet): Promise<CurrencyBalance> {
    return this.db.kysely.transaction().execute(async (trx) => {
      await this.ensureRow(trx, ref);
      const nextPatch = normalizePatch(patch, false);
      if (Object.keys(nextPatch).length === 0) {
        return this.getWith(trx, ref);
      }

      await trx
        .updateTable(CURRENCY_TABLE)
        .set(nextPatch)
        .where('group_id', '=', ref.groupId)
        .where('user_id', '=', ref.userId)
        .execute();

      return this.getWith(trx, ref);
    });
  }

  async adjust(
    ref: CurrencyRef,
    delta: CurrencyDelta,
  ): Promise<CurrencyBalance> {
    return this.db.kysely.transaction().execute(async (trx) => {
      return this.adjustIn(trx, ref, delta);
    });
  }

  async adjustIn(
    db: CurrencyQueryRunner,
    ref: CurrencyRef,
    delta: CurrencyDelta,
  ): Promise<CurrencyBalance> {
    await this.ensureRow(db, ref);
    const current = await this.getWith(db, ref);
    const patch = normalizePatch(delta, true);
    const next = { ...current };

    for (const kind of currencyKinds) {
      const change = patch[kind];
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
      .updateTable(CURRENCY_TABLE)
      .set(next)
      .where('group_id', '=', ref.groupId)
      .where('user_id', '=', ref.userId)
      .execute();

    return this.getWith(db, ref);
  }

  async add(ref: CurrencyRef, patch: CurrencySet): Promise<CurrencyBalance> {
    return this.adjust(ref, this.toDelta(patch, 1));
  }

  async addIn(
    db: CurrencyQueryRunner,
    ref: CurrencyRef,
    patch: CurrencySet,
  ): Promise<CurrencyBalance> {
    return this.adjustIn(db, ref, this.toDelta(patch, 1));
  }

  async spend(ref: CurrencyRef, patch: CurrencySet): Promise<CurrencyBalance> {
    return this.adjust(ref, this.toDelta(patch, -1));
  }

  async spendIn(
    db: CurrencyQueryRunner,
    ref: CurrencyRef,
    patch: CurrencySet,
  ): Promise<CurrencyBalance> {
    return this.adjustIn(db, ref, this.toDelta(patch, -1));
  }

  async canAfford(ref: CurrencyRef, patch: CurrencySet): Promise<boolean> {
    const current = await this.get(ref);
    const normalized = normalizePatch(patch, false);

    for (const kind of currencyKinds) {
      const amount = normalized[kind];
      if (amount === undefined) {
        continue;
      }
      if (current[kind] < amount) {
        return false;
      }
    }

    return true;
  }

  async requireEnough(ref: CurrencyRef, patch: CurrencySet): Promise<void> {
    if (!(await this.canAfford(ref, patch))) {
      throw new Error('Insufficient currency balance');
    }
  }

  async transfer(
    from: CurrencyRef,
    to: CurrencyRef,
    patch: CurrencySet,
    _options: CurrencyTransferOptions = {},
  ): Promise<{ from: CurrencyBalance; to: CurrencyBalance }> {
    assertRef(from);
    assertRef(to);

    if (from.groupId !== to.groupId) {
      throw new Error(
        'Currency transfer only supports accounts in the same group',
      );
    }

    const delta = normalizePatch(patch, false);

    return this.db.kysely.transaction().execute(async (trx) => {
      await this.ensureRow(trx, from);
      await this.ensureRow(trx, to);

      const fromCurrent = await this.getWith(trx, from);
      const toCurrent = await this.getWith(trx, to);
      const nextFrom = { ...fromCurrent };
      const nextTo = { ...toCurrent };

      for (const kind of currencyKinds) {
        const amount = delta[kind];
        if (amount === undefined) {
          continue;
        }

        if (nextFrom[kind] < amount) {
          throw new Error(`Insufficient ${kind} balance`);
        }

        nextFrom[kind] -= amount;
        nextTo[kind] += amount;
      }

      await trx
        .updateTable(CURRENCY_TABLE)
        .set(nextFrom)
        .where('group_id', '=', from.groupId)
        .where('user_id', '=', from.userId)
        .execute();

      if (from.groupId === to.groupId && from.userId === to.userId) {
        return {
          from: nextFrom,
          to: nextFrom,
        };
      }

      await trx
        .updateTable(CURRENCY_TABLE)
        .set(nextTo)
        .where('group_id', '=', to.groupId)
        .where('user_id', '=', to.userId)
        .execute();

      return {
        from: nextFrom,
        to: nextTo,
      };
    });
  }

  async top(
    kind: CurrencyKind,
    groupId: number,
    limit = 10,
  ): Promise<Array<{ userId: number; amount: number }>> {
    assertSafeInteger(groupId, 'groupId');
    assertPositiveInteger(limit, 'limit');

    const rows = await this.db.kysely
      .selectFrom(CURRENCY_TABLE)
      .select(['user_id', kind])
      .where('group_id', '=', groupId)
      .orderBy(kind, 'desc')
      .orderBy('user_id', 'asc')
      .limit(limit)
      .execute();

    return rows.map((row) => ({
      userId: row.user_id,
      amount: row[kind],
    }));
  }

  private async ensureRow(
    db: CurrencyQueryRunner,
    ref: CurrencyRef,
  ): Promise<void> {
    await db
      .insertInto(CURRENCY_TABLE)
      .values({
        group_id: ref.groupId,
        user_id: ref.userId,
        shell: 0,
        stamina: 0,
        charm: 0,
        bomb: 0,
      })
      .onConflict((oc) => oc.columns(['group_id', 'user_id']).doNothing())
      .execute();
  }

  private async getWith(
    db: CurrencyQueryRunner,
    ref: CurrencyRef,
  ): Promise<CurrencyBalance> {
    const row = await db
      .selectFrom(CURRENCY_TABLE)
      .selectAll()
      .where('group_id', '=', ref.groupId)
      .where('user_id', '=', ref.userId)
      .executeTakeFirst();

    return toBalance(row as CurrencyAccountRow | undefined);
  }

  private toDelta(patch: CurrencySet, direction: 1 | -1): CurrencyDelta {
    const delta: CurrencyDelta = {};
    const normalized = normalizePatch(patch, false);

    for (const kind of currencyKinds) {
      const amount = normalized[kind];
      if (amount === undefined) {
        continue;
      }
      delta[kind] = amount * direction;
    }

    return delta;
  }
}

export const CurrencyPlugin = definePlugin({
  name: 'currency',
  provides: [CurrencyService],
  inject: {
    db: DatabaseService,
  },
  apply(ctx) {
    ctx.provide(CurrencyService, new CurrencyService(ctx.db));

    ctx.db.schemas.register({
      name: 'currency',
      migrations: {
        '001_init_currency_accounts_table': {
          async up(db) {
            await db.schema
              .createTable(CURRENCY_TABLE)
              .ifNotExists()
              .addColumn('group_id', 'integer', (column) => column.notNull())
              .addColumn('user_id', 'integer', (column) => column.notNull())
              .addColumn('shell', 'integer', (column) =>
                column.notNull().defaultTo(0),
              )
              .addColumn('stamina', 'integer', (column) =>
                column.notNull().defaultTo(0),
              )
              .addColumn('charm', 'integer', (column) =>
                column.notNull().defaultTo(0),
              )
              .addColumn('bomb', 'integer', (column) =>
                column.notNull().defaultTo(0),
              )
              .addPrimaryKeyConstraint('currency_accounts_pk', [
                'group_id',
                'user_id',
              ])
              .execute();
          },
        },
      },
    });
  },
});

export default CurrencyPlugin;
