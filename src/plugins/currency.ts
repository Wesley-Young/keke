import { definePlugin } from '@fraqjs/fraq';
import { DatabaseService } from '@fraqjs/plugin-kysely';

export const currencyKinds = ['shell', 'stamina', 'charm', 'bomb'] as const;

export type CurrencyKind = (typeof currencyKinds)[number];

export interface CurrencyBalance {
  shell: number;
  stamina: number;
  charm: number;
  bomb: number;
}

export type CurrencyPatch = Partial<CurrencyBalance>;
export type CurrencyDelta = Partial<Record<CurrencyKind, number>>;

export interface CurrencyTransferOptions {
  reason?: string;
}

export type CurrencyQueryRunner = Pick<
  DatabaseService['kysely'],
  'selectFrom' | 'insertInto' | 'updateTable'
>;

export interface CurrencyAccountRow extends CurrencyBalance {
  user_id: number;
}

declare module '@fraqjs/plugin-kysely' {
  interface FraqDatabase {
    currency_accounts: CurrencyAccountRow;
  }
}

export const CURRENCY_TABLE = 'currency_accounts' as const;

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

export function formatCurrencyDelta(delta: number): string {
  return `${delta >= 0 ? '+' : ''}${delta}`;
}

export function formatCurrencyChange(
  label: string,
  current: number,
  delta: number,
): string {
  return `当前${label}：${current} (${formatCurrencyDelta(delta)})`;
}

function assertUserId(userId: number): void {
  assertSafeInteger(userId, 'userId');
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
  patch: CurrencyPatch | CurrencyDelta,
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

function toDelta(patch: CurrencyPatch, direction: 1 | -1): CurrencyDelta {
  const normalized = normalizePatch(patch, false);
  const delta: CurrencyDelta = {};

  for (const kind of currencyKinds) {
    const amount = normalized[kind];
    if (amount === undefined) {
      continue;
    }

    delta[kind] = amount * direction;
  }

  return delta;
}

export class CurrencyService {
  constructor(private readonly db: DatabaseService) {}

  async get(userId: number): Promise<CurrencyBalance> {
    return this.getIn(this.db.kysely, userId);
  }

  async getIn(
    db: CurrencyQueryRunner,
    userId: number,
  ): Promise<CurrencyBalance> {
    assertUserId(userId);

    const row = await db
      .selectFrom(CURRENCY_TABLE)
      .selectAll()
      .where('user_id', '=', userId)
      .executeTakeFirst();

    return toBalance(row as CurrencyAccountRow | undefined);
  }

  async getOne(userId: number, kind: CurrencyKind): Promise<number> {
    const balance = await this.get(userId);
    return balance[kind];
  }

  async ensure(
    userId: number,
    initial: CurrencyPatch = {},
  ): Promise<CurrencyBalance> {
    return this.ensureIn(this.db.kysely, userId, initial);
  }

  async ensureIn(
    db: CurrencyQueryRunner,
    userId: number,
    initial: CurrencyPatch = {},
  ): Promise<CurrencyBalance> {
    assertUserId(userId);
    const patch = normalizePatch(initial, false);

    await db
      .insertInto(CURRENCY_TABLE)
      .values({
        user_id: userId,
        shell: patch.shell ?? 0,
        stamina: patch.stamina ?? 0,
        charm: patch.charm ?? 0,
        bomb: patch.bomb ?? 0,
      })
      .onConflict((oc) => oc.column('user_id').doNothing())
      .execute();

    return this.getIn(db, userId);
  }

  async set(userId: number, patch: CurrencyPatch): Promise<CurrencyBalance> {
    return this.db.kysely.transaction().execute(async (trx) => {
      return this.setIn(trx, userId, patch);
    });
  }

  async setIn(
    db: CurrencyQueryRunner,
    userId: number,
    patch: CurrencyPatch,
  ): Promise<CurrencyBalance> {
    await this.ensureRow(db, userId);
    const nextPatch = normalizePatch(patch, false);
    if (Object.keys(nextPatch).length === 0) {
      return this.getIn(db, userId);
    }

    await db
      .updateTable(CURRENCY_TABLE)
      .set(nextPatch)
      .where('user_id', '=', userId)
      .execute();

    return this.getIn(db, userId);
  }

  async adjust(userId: number, delta: CurrencyDelta): Promise<CurrencyBalance> {
    return this.db.kysely.transaction().execute(async (trx) => {
      return this.adjustIn(trx, userId, delta);
    });
  }

  async adjustIn(
    db: CurrencyQueryRunner,
    userId: number,
    delta: CurrencyDelta,
  ): Promise<CurrencyBalance> {
    await this.ensureRow(db, userId);
    const current = await this.getIn(db, userId);
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
      .where('user_id', '=', userId)
      .execute();

    return this.getIn(db, userId);
  }

  async add(userId: number, patch: CurrencyPatch): Promise<CurrencyBalance> {
    return this.adjust(userId, toDelta(patch, 1));
  }

  async addIn(
    db: CurrencyQueryRunner,
    userId: number,
    patch: CurrencyPatch,
  ): Promise<CurrencyBalance> {
    return this.adjustIn(db, userId, toDelta(patch, 1));
  }

  async spend(userId: number, patch: CurrencyPatch): Promise<CurrencyBalance> {
    return this.adjust(userId, toDelta(patch, -1));
  }

  async spendIn(
    db: CurrencyQueryRunner,
    userId: number,
    patch: CurrencyPatch,
  ): Promise<CurrencyBalance> {
    return this.adjustIn(db, userId, toDelta(patch, -1));
  }

  async canAfford(userId: number, patch: CurrencyPatch): Promise<boolean> {
    const current = await this.get(userId);
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

  async requireEnough(userId: number, patch: CurrencyPatch): Promise<void> {
    if (!(await this.canAfford(userId, patch))) {
      throw new Error('Insufficient currency balance');
    }
  }

  async transfer(
    fromUserId: number,
    toUserId: number,
    patch: CurrencyPatch,
    _options: CurrencyTransferOptions = {},
  ): Promise<{ from: CurrencyBalance; to: CurrencyBalance }> {
    return this.db.kysely.transaction().execute(async (trx) => {
      return this.transferIn(trx, fromUserId, toUserId, patch);
    });
  }

  async transferIn(
    db: CurrencyQueryRunner,
    fromUserId: number,
    toUserId: number,
    patch: CurrencyPatch,
  ): Promise<{ from: CurrencyBalance; to: CurrencyBalance }> {
    assertUserId(fromUserId);
    assertUserId(toUserId);

    if (fromUserId === toUserId) {
      const balance = await this.getIn(db, fromUserId);
      return {
        from: balance,
        to: balance,
      };
    }

    const delta = normalizePatch(patch, false);
    await this.ensureRow(db, fromUserId);
    await this.ensureRow(db, toUserId);

    const fromCurrent = await this.getIn(db, fromUserId);
    const toCurrent = await this.getIn(db, toUserId);
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

    await db
      .updateTable(CURRENCY_TABLE)
      .set(nextFrom)
      .where('user_id', '=', fromUserId)
      .execute();

    await db
      .updateTable(CURRENCY_TABLE)
      .set(nextTo)
      .where('user_id', '=', toUserId)
      .execute();

    return {
      from: nextFrom,
      to: nextTo,
    };
  }

  private async ensureRow(
    db: CurrencyQueryRunner,
    userId: number,
  ): Promise<void> {
    await db
      .insertInto(CURRENCY_TABLE)
      .values({
        user_id: userId,
        shell: 0,
        stamina: 0,
        charm: 0,
        bomb: 0,
      })
      .onConflict((oc) => oc.column('user_id').doNothing())
      .execute();
  }
}

export const CurrencyPlugin = definePlugin({
  name: 'currency',
  provides: [CurrencyService],
  inject: {
    db: DatabaseService,
  },
  apply(ctx) {
    const currency = new CurrencyService(ctx.db);

    ctx.provide(CurrencyService, currency);

    ctx.db.schemas.register({
      name: 'currency',
      migrations: {
        '001_init_currency_accounts_table': {
          async up(db) {
            await db.schema
              .createTable(CURRENCY_TABLE)
              .ifNotExists()
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
              .addPrimaryKeyConstraint('currency_accounts_pk', ['user_id'])
              .execute();
          },
        },
      },
    });
  },
});

export default CurrencyPlugin;
