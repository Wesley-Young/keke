import { definePlugin, msg, param, type Session, seg } from '@fraqjs/fraq';
import { DatabaseService } from '@fraqjs/plugin-kysely';
import { RandomService } from '@fraqjs/plugin-random';

import { CurrencyService } from './currency';
import { NickService } from './nick';

const DICK_PROFILE_TABLE = 'dick_profiles' as const;
const CUT_PRICE = 100_000;
const INITIAL_LENGTH_MIN = 30;
const INITIAL_LENGTH_MAX = 1600;
const SINGLE_ACTION_STAMINA_COST_MIN = 10;
const SINGLE_ACTION_STAMINA_COST_MAX = 20;
const DUEL_REQUIRED_STAMINA = 100;
const DUEL_ACTION_STAMINA_COST_MIN = 10;
const DUEL_ACTION_STAMINA_COST_MAX = 20;
const RANKING_LIMIT = 5;
const RATE_LIMIT_MS = 60_000;

type DickQueryRunner = Pick<
  DatabaseService['kysely'],
  'deleteFrom' | 'insertInto' | 'selectFrom' | 'updateTable'
>;

interface DickProfileRow {
  user_id: number;
  length: number;
  registered_at: string;
  updated_at: string;
}

interface DickProfile {
  userId: number;
  length: number;
}

interface DickRankingEntry {
  userId: number;
  length: number;
}

interface LengthChangeResult {
  profile: DickProfile;
  title: string;
  detail: string;
  staminaCost: number;
  staminaLeft: number;
}

interface DuelResult {
  actor: DickProfile;
  target: DickProfile;
  title: string;
  detail: string;
  actorStaminaCost: number;
  targetStaminaCost: number;
  actorStaminaLeft: number;
  targetStaminaLeft: number;
}

type DuelMode = 'seduce' | 'fence' | 'top';

interface DuelOutcome {
  title: string;
  weight: number;
  apply(
    actorLength: number,
    targetLength: number,
    delta: number,
  ): {
    actorLength: number;
    targetLength: number;
    detail: string;
  };
}

declare module '@fraqjs/plugin-kysely' {
  interface FraqDatabase {
    dick_profiles: DickProfileRow;
  }
}

function assertUserId(userId: number): void {
  if (!Number.isSafeInteger(userId)) {
    throw new RangeError('userId must be a safe integer');
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function toProfile(row: DickProfileRow): DickProfile {
  return {
    userId: row.user_id,
    length: row.length,
  };
}

function formatLength(length: number): string {
  const absolute = Math.trunc(Math.abs(length));
  const whole = Math.trunc(absolute / 100);
  const fraction = String(absolute % 100).padStart(2, '0');
  const sign = length < 0 ? '-' : '';

  return `${sign}${whole}.${fraction}cm`;
}

function formatDelta(delta: number): string {
  return formatLength(Math.abs(delta));
}

function formatFactor(percent: number): string {
  const whole = Math.trunc(percent / 100);
  const fraction = String(percent % 100).padStart(2, '0');

  return `${whole}.${fraction}`;
}

function ensureRegistered(
  profile: DickProfile | undefined,
  label: string,
): DickProfile {
  if (!profile) {
    throw new Error(
      `
${label}还没有注册牛牛，请先发送【注册牛牛】

注册后，发送【打搅】可以尝试增长你的牛牛
发送【扣】可以尝试改变长度为负的困境
发送【勾引/击剑/撅 @目标】可以和其他人进行对决
-【勾引】需要[你为负/对方为正]
-【击剑】需要[双方为正]
-【撅】需要[你为正/对方为负]
发送【割牛牛】可以花费10W微壳割掉你的牛牛，换取一个重新开始的机会
    `.trim(),
    );
  }

  return profile;
}

function createInsufficientStaminaMessage(
  label: string,
  required: number,
  current: number,
): string {
  return `${label}体力不足，需要${required}体力，当前体力：${current}`;
}

function multiplyByPercent(length: number, percent: number): number {
  return Math.trunc((length * percent) / 100);
}

function divideByPercent(length: number, percent: number): number {
  return Math.trunc((length * 100) / percent);
}

const duelOutcomes: readonly DuelOutcome[] = [
  {
    title: '大获成功',
    weight: 3,
    apply(actorLength, targetLength, delta) {
      return {
        actorLength: actorLength + delta,
        targetLength: targetLength - delta,
        detail: `你赢下了这回合，夺走对方${formatDelta(delta)}长度`,
      };
    },
  },
  {
    title: '大事不妙',
    weight: 3,
    apply(actorLength, targetLength, delta) {
      return {
        actorLength: actorLength - delta,
        targetLength: targetLength + delta,
        detail: `对方反手压制了你，你失去${formatDelta(delta)}长度`,
      };
    },
  },
  {
    title: '各自成长',
    weight: 2,
    apply(actorLength, targetLength, delta) {
      return {
        actorLength: actorLength + delta,
        targetLength: targetLength + delta,
        detail: `你们都很尽兴，各自增长${formatDelta(delta)}`,
      };
    },
  },
  {
    title: '两败俱伤',
    weight: 2,
    apply(actorLength, targetLength, delta) {
      return {
        actorLength: actorLength - delta,
        targetLength: targetLength - delta,
        detail: `场面一度失控，双方都缩短${formatDelta(delta)}`,
      };
    },
  },
  {
    title: '小胜一筹',
    weight: 3,
    apply(actorLength, targetLength, delta) {
      return {
        actorLength,
        targetLength: targetLength - delta,
        detail: `你略占上风，对方缩短${formatDelta(delta)}`,
      };
    },
  },
  {
    title: '没占到便宜',
    weight: 3,
    apply(actorLength, targetLength, delta) {
      return {
        actorLength: actorLength - delta,
        targetLength,
        detail: `你没发挥好，自己缩短${formatDelta(delta)}`,
      };
    },
  },
  {
    title: '没有变化',
    weight: 1,
    apply(actorLength, targetLength) {
      return {
        actorLength,
        targetLength,
        detail: '谁也没能撼动谁，长度没有变化',
      };
    },
  },
];

export class DickService {
  constructor(
    private readonly db: DatabaseService,
    private readonly currency: CurrencyService,
    private readonly random: RandomService,
  ) {}

  async get(userId: number): Promise<DickProfile | undefined> {
    return this.getIn(this.db.kysely, userId);
  }

  async getIn(
    db: DickQueryRunner,
    userId: number,
  ): Promise<DickProfile | undefined> {
    assertUserId(userId);

    const row = await db
      .selectFrom(DICK_PROFILE_TABLE)
      .selectAll()
      .where('user_id', '=', userId)
      .executeTakeFirst();

    return row ? toProfile(row as DickProfileRow) : undefined;
  }

  async register(userId: number): Promise<{
    alreadyRegistered: boolean;
    profile: DickProfile;
  }> {
    assertUserId(userId);

    return this.db.kysely.transaction().execute(async (trx) => {
      const existing = await this.getIn(trx, userId);
      if (existing) {
        return {
          alreadyRegistered: true,
          profile: existing,
        };
      }

      const timestamp = nowIso();
      const length = this.random.range(INITIAL_LENGTH_MIN, INITIAL_LENGTH_MAX);

      await trx
        .insertInto(DICK_PROFILE_TABLE)
        .values({
          user_id: userId,
          length,
          registered_at: timestamp,
          updated_at: timestamp,
        })
        .execute();

      return {
        alreadyRegistered: false,
        profile: {
          userId,
          length,
        },
      };
    });
  }

  async cut(userId: number): Promise<{
    ok: boolean;
    reason?: 'not_registered' | 'insufficient_shell';
    shell?: number;
  }> {
    assertUserId(userId);

    return this.db.kysely.transaction().execute(async (trx) => {
      const profile = await this.getIn(trx, userId);
      if (!profile) {
        return {
          ok: false,
          reason: 'not_registered' as const,
        };
      }

      const balance = await this.currency.getIn(trx, userId);
      if (balance.shell < CUT_PRICE) {
        return {
          ok: false,
          reason: 'insufficient_shell' as const,
          shell: balance.shell,
        };
      }

      const nextBalance = await this.currency.spendIn(trx, userId, {
        shell: CUT_PRICE,
      });

      await trx
        .deleteFrom(DICK_PROFILE_TABLE)
        .where('user_id', '=', userId)
        .execute();

      return {
        ok: true,
        shell: nextBalance.shell,
      };
    });
  }

  async masturbate(userId: number): Promise<LengthChangeResult> {
    return this.db.kysely.transaction().execute(async (trx) => {
      const profile = ensureRegistered(await this.getIn(trx, userId), '你');
      if (profile.length <= 0) {
        throw new Error('请问它在哪里？\n试着说【扣】');
      }

      const staminaCost = this.random.range(
        SINGLE_ACTION_STAMINA_COST_MIN,
        SINGLE_ACTION_STAMINA_COST_MAX,
      );
      const balance = await this.currency.getIn(trx, userId);
      if (balance.stamina < staminaCost) {
        throw new Error(
          createInsufficientStaminaMessage(
            '你的',
            staminaCost,
            balance.stamina,
          ),
        );
      }

      const roll = this.random.range(1, 12);
      let nextLength = profile.length;
      let title = '';
      let detail = '';

      if (roll === 1 || roll === 2 || roll === 11) {
        const delta = this.random.range(20, 480);
        nextLength += delta;
        title = '突发奇想';
        detail = `你的牛牛感觉自己能变得再长一点，增长了${formatDelta(delta)}`;
      } else if ([3, 4, 5, 7, 8, 12].includes(roll)) {
        const delta = this.random.range(10, 500);
        nextLength -= delta;
        title = '突发恶疾';
        detail = `你的牛牛觉得自己不该这么长，缩短了${formatDelta(delta)}`;
      } else if (roll === 6) {
        const percent = this.random.range(101, 300);
        nextLength = divideByPercent(profile.length, percent);
        title = '大获失败';
        detail = `长度除以${formatFactor(percent)}`;
      } else if (roll === 10) {
        const percent = this.random.range(101, 300);
        nextLength = multiplyByPercent(profile.length, percent);
        title = '大获成功';
        detail = `长度乘以${formatFactor(percent)}`;
      } else {
        title = '没有变化';
        detail = '你的牛牛失去了梦想，长度没有变化';
      }

      const nextBalance = await this.currency.spendIn(trx, userId, {
        stamina: staminaCost,
      });
      const nextProfile = await this.setLengthIn(trx, userId, nextLength);

      return {
        profile: nextProfile,
        title,
        detail,
        staminaCost,
        staminaLeft: nextBalance.stamina,
      };
    });
  }

  async tuck(userId: number): Promise<LengthChangeResult> {
    return this.db.kysely.transaction().execute(async (trx) => {
      const profile = ensureRegistered(await this.getIn(trx, userId), '你');
      if (profile.length >= 0) {
        throw new Error('不是哥们，这……\n试着说【打搅】');
      }

      const staminaCost = this.random.range(
        SINGLE_ACTION_STAMINA_COST_MIN,
        SINGLE_ACTION_STAMINA_COST_MAX,
      );
      const balance = await this.currency.getIn(trx, userId);
      if (balance.stamina < staminaCost) {
        throw new Error(
          createInsufficientStaminaMessage(
            '你的',
            staminaCost,
            balance.stamina,
          ),
        );
      }

      const roll = this.random.range(1, 10);
      let nextLength = profile.length;
      let title = '';
      let detail = '';

      if (roll === 1 || roll === 2 || roll === 6) {
        const delta = this.random.range(10, 500);
        nextLength += delta;
        title = '扣成功';
        detail = `它感觉自己能变得长一点，增长了${formatDelta(delta)}`;
      } else if (roll === 3 || roll === 4 || roll === 5) {
        const delta = this.random.range(10, 400);
        nextLength -= delta;
        title = '扣失败';
        detail = `它突发恶疾，缩短了${formatDelta(delta)}`;
      } else if (roll === 7) {
        const percent = this.random.range(101, 400);
        nextLength = divideByPercent(profile.length, percent);
        title = '扣大获成功';
        detail = `长度除以${formatFactor(percent)}`;
      } else if (roll === 8) {
        const percent = this.random.range(101, 290);
        nextLength = multiplyByPercent(profile.length, percent);
        title = '扣大获失败';
        detail = `长度乘以${formatFactor(percent)}`;
      } else {
        title = '没有变化';
        detail = '它失去了梦想，长度没有变化';
      }

      const nextBalance = await this.currency.spendIn(trx, userId, {
        stamina: staminaCost,
      });
      const nextProfile = await this.setLengthIn(trx, userId, nextLength);

      return {
        profile: nextProfile,
        title,
        detail,
        staminaCost,
        staminaLeft: nextBalance.stamina,
      };
    });
  }

  async duel(
    actorUserId: number,
    targetUserId: number,
    mode: DuelMode,
  ): Promise<DuelResult> {
    assertUserId(actorUserId);
    assertUserId(targetUserId);

    if (actorUserId === targetUserId) {
      throw new Error('不能对自己使用这个命令');
    }

    return this.db.kysely.transaction().execute(async (trx) => {
      const actor = ensureRegistered(await this.getIn(trx, actorUserId), '你');
      const target = ensureRegistered(
        await this.getIn(trx, targetUserId),
        '对方',
      );

      this.assertDuelState(actor, target, mode);

      const actorBalance = await this.currency.getIn(trx, actorUserId);
      const targetBalance = await this.currency.getIn(trx, targetUserId);
      if (actorBalance.stamina < DUEL_REQUIRED_STAMINA) {
        throw new Error(
          createInsufficientStaminaMessage(
            '你的',
            DUEL_REQUIRED_STAMINA,
            actorBalance.stamina,
          ),
        );
      }
      if (targetBalance.stamina < DUEL_REQUIRED_STAMINA) {
        throw new Error(
          createInsufficientStaminaMessage(
            '对方',
            DUEL_REQUIRED_STAMINA,
            targetBalance.stamina,
          ),
        );
      }

      const outcome = this.random.weightedPick(
        duelOutcomes,
        (item) => item.weight,
      );
      const delta = this.random.range(10, 450);
      const actorStaminaCost = this.random.range(
        DUEL_ACTION_STAMINA_COST_MIN,
        DUEL_ACTION_STAMINA_COST_MAX,
      );
      const targetStaminaCost = this.random.range(
        DUEL_ACTION_STAMINA_COST_MIN,
        DUEL_ACTION_STAMINA_COST_MAX,
      );
      const applied = outcome.apply(actor.length, target.length, delta);

      const nextActorBalance = await this.currency.spendIn(trx, actorUserId, {
        stamina: actorStaminaCost,
      });
      const nextTargetBalance = await this.currency.spendIn(trx, targetUserId, {
        stamina: targetStaminaCost,
      });
      const nextActor = await this.setLengthIn(
        trx,
        actorUserId,
        applied.actorLength,
      );
      const nextTarget = await this.setLengthIn(
        trx,
        targetUserId,
        applied.targetLength,
      );

      return {
        actor: nextActor,
        target: nextTarget,
        title: outcome.title,
        detail: applied.detail,
        actorStaminaCost,
        targetStaminaCost,
        actorStaminaLeft: nextActorBalance.stamina,
        targetStaminaLeft: nextTargetBalance.stamina,
      };
    });
  }

  private async setLengthIn(
    db: DickQueryRunner,
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

  private assertDuelState(
    actor: DickProfile,
    target: DickProfile,
    mode: DuelMode,
  ): void {
    if (mode === 'seduce' && !(actor.length < 0 && target.length > 0)) {
      throw new Error('当前状态不适合勾引：需要你为负、对方为正');
    }

    if (mode === 'fence' && !(actor.length > 0 && target.length > 0)) {
      throw new Error('当前状态不适合击剑：需要双方都为正');
    }

    if (mode === 'top' && !(actor.length > 0 && target.length < 0)) {
      throw new Error('当前状态不适合撅：需要你为正、对方为负');
    }
  }
}

export const DickPlugin = definePlugin({
  name: 'dick',
  provides: [DickService],
  inject: {
    db: DatabaseService,
    currency: CurrencyService,
    nick: NickService,
    random: RandomService,
  },
  apply(ctx) {
    const dick = new DickService(ctx.db, ctx.currency, ctx.random);
    const lastActionAtByUserId = new Map<number, number>();

    const checkRateLimit = async (session: Session): Promise<boolean> => {
      const message = session.raw;
      const now = Date.now();
      const lastActionAt = lastActionAtByUserId.get(message.sender_id);

      if (lastActionAt !== undefined && now - lastActionAt < RATE_LIMIT_MS) {
        if (message.message_scene === 'group') {
          await ctx.client.send_group_message_reaction({
            group_id: message.peer_id,
            message_seq: message.message_seq,
            reaction: '38',
          });
        }

        return false;
      }

      return true;
    };

    const recordRateLimit = (userId: number): void => {
      lastActionAtByUserId.set(userId, Date.now());
    };

    ctx.provide(DickService, dick);
    ctx.db.schemas.register({
      name: 'dick',
      migrations: {
        '001_init_dick_profiles_table': {
          async up(db) {
            await db.schema
              .createTable(DICK_PROFILE_TABLE)
              .ifNotExists()
              .addColumn('user_id', 'integer', (column) => column.notNull())
              .addColumn('length', 'integer', (column) =>
                column.notNull().defaultTo(0),
              )
              .addColumn('registered_at', 'text', (column) => column.notNull())
              .addColumn('updated_at', 'text', (column) => column.notNull())
              .addPrimaryKeyConstraint('dick_profiles_pk', ['user_id'])
              .execute();
          },
        },
      },
    });

    ctx.router.command('注册牛牛').execute(async (session) => {
      const message = session.raw;
      const result = await dick.register(message.sender_id);

      if (result.alreadyRegistered) {
        await session.reply(msg`
${seg.mention(message.sender_id)}
你已经注册过牛牛了
当前长度：${formatLength(result.profile.length)}
        `);
        return;
      }

      await session.reply(msg`
${seg.mention(message.sender_id)}
注册完成！
你的牛牛长度为：${formatLength(result.profile.length)}
      `);
    });

    ctx.router.command('我的牛牛').execute(async (session) => {
      const message = session.raw;
      const profile = await dick.get(message.sender_id);

      if (!profile) {
        await session.reply(msg`
${seg.mention(message.sender_id)}
你还没注册，请先发送【注册牛牛】
        `);
        return;
      }

      await session.reply(msg`
${seg.mention(message.sender_id)}
你的牛牛长度为：${formatLength(profile.length)}
      `);
    });

    ctx.router.command('割牛牛').execute(async (session) => {
      const message = session.raw;
      const result = await dick.cut(message.sender_id);

      if (!result.ok && result.reason === 'not_registered') {
        await session.reply(msg`
${seg.mention(message.sender_id)}
你还没注册，请先发送【注册牛牛】
        `);
        return;
      }

      if (!result.ok && result.reason === 'insufficient_shell') {
        await session.reply(msg`
${seg.mention(message.sender_id)}
微壳不足，割牛牛需要100000微壳
当前微壳：${result.shell ?? 0}
        `);
        return;
      }

      await session.reply(msg`
${seg.mention(message.sender_id)}
割牛牛成功，花费100000微壳
当前微壳：${result.shell ?? 0}
      `);
    });

    ctx.router.command('打搅').execute(async (session) => {
      if (!(await checkRateLimit(session))) {
        return;
      }

      const message = session.raw;

      try {
        recordRateLimit(message.sender_id);
        const result = await dick.masturbate(message.sender_id);

        await session.reply(msg`
${seg.mention(message.sender_id)}
【${result.title}】
${result.detail}
目前长度：${formatLength(result.profile.length)}
消耗体力：${result.staminaCost}
剩余体力：${result.staminaLeft}
        `);
      } catch (error) {
        await session.reply(msg`
${seg.mention(message.sender_id)}
${error instanceof Error ? error.message : '打搅失败'}
        `);
      }
    });

    ctx.router.command('扣').execute(async (session) => {
      if (!(await checkRateLimit(session))) {
        return;
      }

      const message = session.raw;

      try {
        recordRateLimit(message.sender_id);
        const result = await dick.tuck(message.sender_id);

        await session.reply(msg`
${seg.mention(message.sender_id)}
【${result.title}】
${result.detail}
目前长度：${formatLength(result.profile.length)}
消耗体力：${result.staminaCost}
剩余体力：${result.staminaLeft}
        `);
      } catch (error) {
        await session.reply(msg`
${seg.mention(message.sender_id)}
${error instanceof Error ? error.message : '扣失败'}
        `);
      }
    });

    const handleDuel = async (
      session: Session,
      targetUserId: number,
      mode: DuelMode,
      fallback: string,
    ) => {
      if (!(await checkRateLimit(session))) {
        return;
      }

      const message = session.raw;

      try {
        recordRateLimit(message.sender_id);
        const result = await dick.duel(message.sender_id, targetUserId, mode);

        await session.reply(msg`
${seg.mention(message.sender_id)}
【${result.title}】
${result.detail}
你的长度：${formatLength(result.actor.length)}
对方长度：${formatLength(result.target.length)}
消耗体力：你${result.actorStaminaCost}/对方${result.targetStaminaCost}
剩余体力：你${result.actorStaminaLeft}/对方${result.targetStaminaLeft}
        `);
      } catch (error) {
        await session.reply(msg`
${seg.mention(message.sender_id)}
${error instanceof Error ? error.message : fallback}
        `);
      }
    };

    ctx.router
      .command('勾引')
      .arg('target', param.segment('mention'))
      .execute((session, { target }) =>
        handleDuel(session, target.data.user_id, 'seduce', '勾引失败'),
      );

    ctx.router
      .command('击剑')
      .arg('target', param.segment('mention'))
      .execute((session, { target }) =>
        handleDuel(session, target.data.user_id, 'fence', '击剑失败'),
      );

    ctx.router
      .command('撅')
      .arg('target', param.segment('mention'))
      .execute((session, { target }) =>
        handleDuel(session, target.data.user_id, 'top', '撅失败'),
      );

    ctx.router.command('牛牛排行榜').execute(async (session) => {
      const message = session.raw;
      const positiveRows = await ctx.db.kysely
        .selectFrom(DICK_PROFILE_TABLE)
        .select(['user_id', 'length'])
        .where('length', '>', 0)
        .orderBy('length', 'desc')
        .orderBy('user_id', 'asc')
        .limit(RANKING_LIMIT)
        .execute();
      const negativeRows = await ctx.db.kysely
        .selectFrom(DICK_PROFILE_TABLE)
        .select(['user_id', 'length'])
        .where('length', '<', 0)
        .orderBy('length', 'asc')
        .orderBy('user_id', 'asc')
        .limit(RANKING_LIMIT)
        .execute();
      const positive: DickRankingEntry[] = positiveRows.map((row) => ({
        userId: row.user_id,
        length: row.length,
      }));
      const negative: DickRankingEntry[] = negativeRows.map((row) => ({
        userId: row.user_id,
        length: row.length,
      }));
      const makeLines = (
        title: string,
        entries: readonly DickRankingEntry[],
      ): string[] => {
        if (entries.length === 0) {
          return [title, '暂无数据'];
        }

        return [
          title,
          ...entries.map((entry, index) => {
            const nick =
              message.message_scene === 'group'
                ? ctx.nick.resolve(message.peer_id, entry.userId)
                : undefined;
            const user = nick
              ? `${nick}(${entry.userId})`
              : `QQ ${entry.userId}`;
            return `#${index + 1} ${user} / ${formatLength(entry.length)}`;
          }),
        ];
      };

      await session.reply(
        msg`${[
          '牛牛长度排行榜',
          ...makeLines('正长度 TOP 5', positive),
          '---',
          ...makeLines('负长度 TOP 5', negative),
        ].join('\n')}`,
      );
    });
  },
});

export default DickPlugin;
