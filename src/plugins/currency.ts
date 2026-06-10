import { definePlugin } from '@fraqjs/fraq';
import { DatabaseService } from '@fraqjs/plugin-kysely';

const CURRENCY_SCHEMA_NAME = 'currency';
const SHELL_TABLE_NAME = 'shell_accounts';

declare module '@fraqjs/plugin-kysely' {
  interface FraqDatabase {
    shell_accounts: ShellAccountRow;
  }
}

export interface ShellAccountRow {
  group_id: number;
  user_id: number;
  balance: number;
  created_at: string;
  updated_at: string;
}

export class CurrencyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CurrencyError';
  }
}

export class InvalidShellAmountError extends CurrencyError {
  constructor(amount: number) {
    super(`Invalid shell amount: ${amount}.`);
    this.name = 'InvalidShellAmountError';
  }
}

export class InsufficientShellBalanceError extends CurrencyError {
  constructor(groupId: number, userId: number, balance: number, delta: number) {
    super(
      `Insufficient shell balance for group ${groupId}, user ${userId}: balance=${balance}, delta=${delta}.`,
    );
    this.name = 'InsufficientShellBalanceError';
  }
}

export class SelfTransferError extends CurrencyError {
  constructor(groupId: number, userId: number) {
    super(
      `Cannot transfer shell to the same account in group ${groupId}, user ${userId}.`,
    );
    this.name = 'SelfTransferError';
  }
}

export class CurrencyService {
  constructor(private readonly db: DatabaseService) {}

  async getShellBalance(groupId: number, userId: number): Promise<number> {
    const row = await this.db.kysely
      .selectFrom(SHELL_TABLE_NAME)
      .select('balance')
      .where('group_id', '=', groupId)
      .where('user_id', '=', userId)
      .executeTakeFirst();

    return row?.balance ?? 0;
  }

  async setShellBalance(
    groupId: number,
    userId: number,
    balance: number,
  ): Promise<number> {
    assertValidBalance(balance);

    const now = new Date().toISOString();

    await this.db.kysely.transaction().execute(async (trx) => {
      const row = await trx
        .selectFrom(SHELL_TABLE_NAME)
        .select('balance')
        .where('group_id', '=', groupId)
        .where('user_id', '=', userId)
        .executeTakeFirst();

      if (row) {
        await trx
          .updateTable(SHELL_TABLE_NAME)
          .set({
            balance,
            updated_at: now,
          })
          .where('group_id', '=', groupId)
          .where('user_id', '=', userId)
          .execute();
        return;
      }

      await trx
        .insertInto(SHELL_TABLE_NAME)
        .values({
          group_id: groupId,
          user_id: userId,
          balance,
          created_at: now,
          updated_at: now,
        })
        .execute();
    });

    return balance;
  }

  async addShell(
    groupId: number,
    userId: number,
    amount: number,
  ): Promise<number> {
    assertValidAmount(amount);
    if (amount === 0) {
      return this.getShellBalance(groupId, userId);
    }

    return this.adjustShellBalance(groupId, userId, amount);
  }

  async subtractShell(
    groupId: number,
    userId: number,
    amount: number,
  ): Promise<number> {
    assertValidAmount(amount);
    if (amount === 0) {
      return this.getShellBalance(groupId, userId);
    }

    return this.adjustShellBalance(groupId, userId, -amount);
  }

  async transferShell(
    groupId: number,
    fromUserId: number,
    toUserId: number,
    amount: number,
  ): Promise<{ fromBalance: number; toBalance: number }> {
    assertValidAmount(amount);

    if (fromUserId === toUserId) {
      throw new SelfTransferError(groupId, fromUserId);
    }

    const now = new Date().toISOString();

    const result = await this.db.kysely.transaction().execute(async (trx) => {
      const source = await trx
        .selectFrom(SHELL_TABLE_NAME)
        .select('balance')
        .where('group_id', '=', groupId)
        .where('user_id', '=', fromUserId)
        .executeTakeFirst();

      const sourceBalance = source?.balance ?? 0;
      if (sourceBalance < amount) {
        throw new InsufficientShellBalanceError(
          groupId,
          fromUserId,
          sourceBalance,
          -amount,
        );
      }

      const target = await trx
        .selectFrom(SHELL_TABLE_NAME)
        .select('balance')
        .where('group_id', '=', groupId)
        .where('user_id', '=', toUserId)
        .executeTakeFirst();

      const targetBalance = target?.balance ?? 0;
      const nextSourceBalance = sourceBalance - amount;
      const nextTargetBalance = targetBalance + amount;

      await upsertShellRow(trx, {
        group_id: groupId,
        user_id: fromUserId,
        balance: nextSourceBalance,
        now,
      });

      await upsertShellRow(trx, {
        group_id: groupId,
        user_id: toUserId,
        balance: nextTargetBalance,
        now,
      });

      return {
        fromBalance: nextSourceBalance,
        toBalance: nextTargetBalance,
      };
    });

    return result;
  }

  async listShellBalances(
    groupId: number,
    limit = 10,
  ): Promise<Array<{ userId: number; balance: number }>> {
    if (!Number.isInteger(limit) || limit < 1) {
      throw new InvalidShellAmountError(limit);
    }

    const rows = await this.db.kysely
      .selectFrom(SHELL_TABLE_NAME)
      .select(['user_id', 'balance'])
      .where('group_id', '=', groupId)
      .orderBy('balance', 'desc')
      .orderBy('user_id', 'asc')
      .limit(limit)
      .execute();

    return rows.map((row) => ({
      userId: row.user_id,
      balance: row.balance,
    }));
  }

  private async adjustShellBalance(
    groupId: number,
    userId: number,
    delta: number,
  ): Promise<number> {
    const now = new Date().toISOString();

    return await this.db.kysely.transaction().execute(async (trx) => {
      const row = await trx
        .selectFrom(SHELL_TABLE_NAME)
        .select('balance')
        .where('group_id', '=', groupId)
        .where('user_id', '=', userId)
        .executeTakeFirst();

      const currentBalance = row?.balance ?? 0;
      const nextBalance = currentBalance + delta;

      if (nextBalance < 0) {
        throw new InsufficientShellBalanceError(
          groupId,
          userId,
          currentBalance,
          delta,
        );
      }

      await upsertShellRow(trx, {
        group_id: groupId,
        user_id: userId,
        balance: nextBalance,
        now,
      });

      return nextBalance;
    });
  }
}

type ShellUpsertArgs = {
  group_id: number;
  user_id: number;
  balance: number;
  now: string;
};

function assertValidAmount(amount: number): void {
  if (!Number.isInteger(amount) || amount < 0) {
    throw new InvalidShellAmountError(amount);
  }
}

function assertValidBalance(balance: number): void {
  if (!Number.isInteger(balance) || balance < 0) {
    throw new InvalidShellAmountError(balance);
  }
}

async function upsertShellRow(
  trx: DatabaseService['kysely'],
  args: ShellUpsertArgs,
): Promise<void> {
  const row = await trx
    .selectFrom(SHELL_TABLE_NAME)
    .select('balance')
    .where('group_id', '=', args.group_id)
    .where('user_id', '=', args.user_id)
    .executeTakeFirst();

  if (row) {
    await trx
      .updateTable(SHELL_TABLE_NAME)
      .set({
        balance: args.balance,
        updated_at: args.now,
      })
      .where('group_id', '=', args.group_id)
      .where('user_id', '=', args.user_id)
      .execute();
    return;
  }

  await trx
    .insertInto(SHELL_TABLE_NAME)
    .values({
      group_id: args.group_id,
      user_id: args.user_id,
      balance: args.balance,
      created_at: args.now,
      updated_at: args.now,
    })
    .execute();
}

export const CurrencyPlugin = definePlugin({
  name: 'currency',
  inject: {
    db: DatabaseService,
  },
  provides: [CurrencyService],
  apply(ctx) {
    ctx.db.schemas.register({
      name: CURRENCY_SCHEMA_NAME,
      migrations: {
        '001_initial_shell': {
          async up(db) {
            await db.schema
              .createTable(SHELL_TABLE_NAME)
              .ifNotExists()
              .addColumn('group_id', 'integer', (column) => column.notNull())
              .addColumn('user_id', 'integer', (column) => column.notNull())
              .addColumn('balance', 'integer', (column) =>
                column.notNull().defaultTo(0),
              )
              .addColumn('created_at', 'text', (column) => column.notNull())
              .addColumn('updated_at', 'text', (column) => column.notNull())
              .addPrimaryKeyConstraint('shell_accounts_pk', [
                'group_id',
                'user_id',
              ])
              .execute();
          },
        },
      },
    });

    ctx.provide(CurrencyService, new CurrencyService(ctx.db));
  },
});
