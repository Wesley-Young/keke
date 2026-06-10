import { definePlugin, msg, seg } from '@fraqjs/fraq';
import { DatabaseService } from '@fraqjs/plugin-kysely';
import { RandomService } from '@fraqjs/plugin-random';

import { type CurrencyBalance, CurrencyService } from './currency';

const SIGN_IN_TABLE = 'sign_in_records' as const;
const SHANGHAI_TIME_ZONE = 'Asia/Shanghai';

export interface SignInRecordRow {
  user_id: number;
  sign_in_date: string;
  signed_at: string;
}

declare module '@fraqjs/plugin-kysely' {
  interface FraqDatabase {
    sign_in_records: SignInRecordRow;
  }
}

function formatShanghaiDate(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: SHANGHAI_TIME_ZONE,
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
    timeZone: SHANGHAI_TIME_ZONE,
    weekday: 'short',
  }).format(date);

  return weekday === 'Sat' || weekday === 'Sun';
}

function emptyReward(): CurrencyBalance {
  return {
    shell: 0,
    stamina: 0,
    charm: 0,
    bomb: 0,
  };
}

export const SignInPlugin = definePlugin({
  name: 'sign-in',
  inject: {
    db: DatabaseService,
    currency: CurrencyService,
    random: RandomService,
  },
  apply(ctx) {
    const createReward = (date: Date): CurrencyBalance => {
      const shell =
        ctx.random.range(60000, 250000) +
        (isWeekendShanghai(date) ? ctx.random.range(1000, 8000) : 0);

      return {
        shell,
        stamina: ctx.random.range(200, 600),
        charm: ctx.random.range(350, 1000),
        bomb: ctx.random.range(2, 6),
      };
    };

    const signIn = async (userId: number, now = new Date()) => {
      if (!Number.isSafeInteger(userId)) {
        throw new RangeError('userId must be a safe integer');
      }

      const date = formatShanghaiDate(now);

      return ctx.db.kysely.transaction().execute(async (trx) => {
        const existing = await trx
          .selectFrom(SIGN_IN_TABLE)
          .selectAll()
          .where('user_id', '=', userId)
          .where('sign_in_date', '=', date)
          .executeTakeFirst();

        if (existing) {
          return {
            date,
            alreadySignedIn: true,
            lucky: false,
            reward: emptyReward(),
          };
        }

        const lucky = ctx.random.bool(1 / 50);
        const reward = createReward(now);

        await ctx.currency.addIn(trx, userId, reward);

        if (!lucky) {
          await trx
            .insertInto(SIGN_IN_TABLE)
            .values({
              user_id: userId,
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
    };

    ctx.db.schemas.register({
      name: 'signin',
      migrations: {
        '001_init_sign_in_records_table': {
          async up(db) {
            await db.schema
              .createTable(SIGN_IN_TABLE)
              .ifNotExists()
              .addColumn('user_id', 'integer', (column) => column.notNull())
              .addColumn('sign_in_date', 'text', (column) => column.notNull())
              .addColumn('signed_at', 'text', (column) => column.notNull())
              .addPrimaryKeyConstraint('sign_in_records_pk', [
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

      const result = await signIn(message.sender_id);

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
