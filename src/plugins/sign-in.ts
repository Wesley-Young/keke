import { definePlugin, msg, seg } from '@fraqjs/fraq';
import { DatabaseService } from '@fraqjs/plugin-kysely';

import {
  type CurrencyBalance,
  type CurrencyRef,
  CurrencyService,
} from './currency';

export interface SignInRecordRow {
  group_id: number;
  user_id: number;
  sign_in_date: string;
  signed_at: string;
}

export interface SignInResult {
  date: string;
  alreadySignedIn: boolean;
  lucky: boolean;
  reward: CurrencyBalance;
}

declare module '@fraqjs/plugin-kysely' {
  interface FraqDatabase {
    sign_in_records: SignInRecordRow;
  }
}

function assertRef(ref: CurrencyRef): void {
  if (!Number.isSafeInteger(ref.groupId)) {
    throw new RangeError('groupId must be a safe integer');
  }
  if (!Number.isSafeInteger(ref.userId)) {
    throw new RangeError('userId must be a safe integer');
  }
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function formatShanghaiDate(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const year = parts.find((part) => part.type === 'year')?.value ?? '0000';
  const month = parts.find((part) => part.type === 'month')?.value ?? '00';
  const day = parts.find((part) => part.type === 'day')?.value ?? '00';

  return `${year}-${month}-${day}`;
}

function isWeekendShanghai(date: Date): boolean {
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    weekday: 'short',
  }).format(date);

  return weekday === 'Sat' || weekday === 'Sun';
}

function createBaseReward(): CurrencyBalance {
  return {
    shell: randomInt(60000, 250000),
    stamina: randomInt(200, 600),
    charm: randomInt(350, 1000),
    bomb: randomInt(2, 6),
  };
}

function addWeekendBonus(reward: CurrencyBalance, date: Date): CurrencyBalance {
  if (!isWeekendShanghai(date)) {
    return reward;
  }

  return {
    ...reward,
    shell: reward.shell + randomInt(1000, 8000),
  };
}

async function signIn(
  db: DatabaseService,
  currency: CurrencyService,
  ref: CurrencyRef,
  now = new Date(),
): Promise<SignInResult> {
  assertRef(ref);
  const date = formatShanghaiDate(now);

  return db.kysely.transaction().execute(async (trx) => {
    const existing = await trx
      .selectFrom('sign_in_records' as const)
      .selectAll()
      .where('group_id', '=', ref.groupId)
      .where('user_id', '=', ref.userId)
      .where('sign_in_date', '=', date)
      .executeTakeFirst();

    if (existing) {
      return {
        date,
        alreadySignedIn: true,
        lucky: false,
        reward: {
          shell: 0,
          stamina: 0,
          charm: 0,
          bomb: 0,
        },
      };
    }

    const lucky = randomInt(1, 50) === 1;
    const baseReward = createBaseReward();
    const reward = addWeekendBonus(baseReward, now);

    await currency.addIn(trx, ref, baseReward);

    if (reward.shell !== baseReward.shell) {
      await currency.addIn(trx, ref, {
        shell: reward.shell - baseReward.shell,
      });
    }

    if (!lucky) {
      await trx
        .insertInto('sign_in_records' as const)
        .values({
          group_id: ref.groupId,
          user_id: ref.userId,
          sign_in_date: date,
          signed_at: now.toISOString(),
        })
        .execute();
    }

    return {
      date,
      alreadySignedIn: false,
      lucky,
      reward,
    };
  });
}

export const SignInPlugin = definePlugin({
  name: 'sign-in',
  inject: {
    db: DatabaseService,
    currency: CurrencyService,
  },
  apply(ctx) {
    ctx.db.schemas.register({
      name: 'signin',
      migrations: {
        '001_init_sign_in_records_table': {
          async up(db) {
            await db.schema
              .createTable('sign_in_records' as const)
              .ifNotExists()
              .addColumn('group_id', 'integer', (column) => column.notNull())
              .addColumn('user_id', 'integer', (column) => column.notNull())
              .addColumn('sign_in_date', 'text', (column) => column.notNull())
              .addColumn('signed_at', 'text', (column) => column.notNull())
              .addPrimaryKeyConstraint('sign_in_records_pk', [
                'group_id',
                'user_id',
                'sign_in_date',
              ])
              .execute();
          },
        },
      },
    });

    ctx.router.command('签到').execute(async (session) => {
      const message = session.raw;

      if (message.message_scene !== 'group') {
        await session.reply(msg`这个功能只能在群里使用`);
        return;
      }

      const result = await signIn(ctx.db, ctx.currency, {
        groupId: message.peer_id,
        userId: message.sender_id,
      });

      if (result.alreadySignedIn) {
        await session.reply(msg`
${seg.mention(message.sender_id)}
你今天已经签到过了
        `);
        return;
      }

      if (result.lucky) {
        await session.reply(msg`
${seg.mention(message.sender_id)}
签到成功
获得微壳：${result.reward.shell}
获得体力：${result.reward.stamina}
获得魅力：${result.reward.charm}
获得炸弹：${result.reward.bomb}
本次奖励不计入今日签到，可以再来一次
        `);
        return;
      }

      await session.reply(msg`
${seg.mention(message.sender_id)}
签到成功
获得微壳：${result.reward.shell}
获得体力：${result.reward.stamina}
获得魅力：${result.reward.charm}
获得炸弹：${result.reward.bomb}
      `);
    });
  },
});

export default SignInPlugin;
