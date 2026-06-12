import { definePlugin, msg, param, type Session, seg } from '@fraqjs/fraq';
import { DatabaseService } from '@fraqjs/plugin-kysely';
import { RandomService } from '@fraqjs/plugin-random';
import { TakumiService } from '@fraqjs/plugin-takumi';

import DickRankingCard from '../templates/DickRankingCard';
import type { QueryRunner } from '../util/kysely';
import {
  assertUserId,
  pickRange,
  type Range,
  type WeightedRule,
} from '../util/rules';
import {
  CurrencyService,
  formatCurrencyChange,
  formatCurrencyDelta,
} from './currency';
import { NickService } from './nick';

const DICK_PROFILE_TABLE = 'dick_profiles' as const;
const CUT_PRICE = 2_000_000;
const PURCHASE_PRICE_PER_UNIT = 3_000;
const INITIAL_LENGTH_MIN = 30;
const INITIAL_LENGTH_MAX = 1600;
const SINGLE_ACTION_STAMINA_COST_MIN = 10;
const SINGLE_ACTION_STAMINA_COST_MAX = 20;
const DUEL_REQUIRED_STAMINA = 100;
const DUEL_ACTION_STAMINA_COST_MIN = 10;
const DUEL_ACTION_STAMINA_COST_MAX = 20;
const RANKING_LIMIT = 5;
const RATE_LIMIT_MS = 30_000;
const RATE_LIMIT_REACTION = '38';

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

interface PurchaseLengthResult {
  ok: boolean;
  reason?: 'not_registered' | 'insufficient_shell';
  amount: number;
  lengthDelta: number;
  cost: number;
  shell: number;
  profile?: DickProfile;
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

type DuelMode = 'seduce' | 'fence' | 'top' | 'grind';

type LengthActionValueKind = 'delta' | 'percent' | 'none';

interface LengthActionRuleBase<TKind extends LengthActionValueKind>
  extends WeightedRule {
  kind: TKind;
  title: string;
}

type LengthActionRule =
  | (LengthActionRuleBase<'delta'> & {
      delta: Range;
      apply(length: number, delta: number): number;
      describe(delta: number): string;
    })
  | (LengthActionRuleBase<'percent'> & {
      percent: Range;
      apply(length: number, percent: number): number;
      describe(percent: number): string;
    })
  | (LengthActionRuleBase<'none'> & {
      apply(length: number): number;
      describe(): string;
    });

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

export class DickRateLimitError extends Error {
  constructor(
    readonly userId: number,
    readonly retryAfterMs: number,
  ) {
    super('Dick action rate limited');
    this.name = 'DickRateLimitError';
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

export function formatLength(length: number): string {
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
    throw new Error(`${label}还没有注册牛牛\n发送【玩法 牛牛】查看玩法说明`);
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

function normalizePurchaseAmount(amount: number): number | undefined {
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    return;
  }

  if (!Number.isSafeInteger(amount * PURCHASE_PRICE_PER_UNIT)) {
    return;
  }

  return amount;
}

const masturbateOutcomes: readonly LengthActionRule[] = [
  {
    kind: 'delta',
    title: '突发奇想',
    weight: 3,
    delta: { min: 20, max: 480 },
    apply: (length, delta) => length + delta,
    describe: (delta) =>
      `你的牛牛感觉自己能变得再长一点，增长了${formatDelta(delta)}`,
  },
  {
    kind: 'delta',
    title: '突发恶疾',
    weight: 6,
    delta: { min: 10, max: 500 },
    apply: (length, delta) => length - delta,
    describe: (delta) =>
      `你的牛牛觉得自己不该这么长，缩短了${formatDelta(delta)}`,
  },
  {
    kind: 'percent',
    title: '大获失败',
    weight: 1,
    percent: { min: 101, max: 300 },
    apply: (length, percent) => divideByPercent(length, percent),
    describe: (percent) => `长度除以${formatFactor(percent)}`,
  },
  {
    kind: 'percent',
    title: '大获成功',
    weight: 1,
    percent: { min: 101, max: 300 },
    apply: (length, percent) => multiplyByPercent(length, percent),
    describe: (percent) => `长度乘以${formatFactor(percent)}`,
  },
  {
    kind: 'none',
    title: '没有变化',
    weight: 1,
    apply: (length) => length,
    describe: () => '你的牛牛失去了梦想，长度没有变化',
  },
];

const tuckOutcomes: readonly LengthActionRule[] = [
  {
    kind: 'delta',
    title: '扣成功',
    weight: 3,
    delta: { min: 10, max: 500 },
    apply: (length, delta) => length + delta,
    describe: (delta) => `它感觉自己能变得长一点，增长了${formatDelta(delta)}`,
  },
  {
    kind: 'delta',
    title: '扣失败',
    weight: 3,
    delta: { min: 10, max: 400 },
    apply: (length, delta) => length - delta,
    describe: (delta) => `它突发恶疾，缩短了${formatDelta(delta)}`,
  },
  {
    kind: 'percent',
    title: '扣大获成功',
    weight: 1,
    percent: { min: 101, max: 400 },
    apply: (length, percent) => divideByPercent(length, percent),
    describe: (percent) => `长度除以${formatFactor(percent)}`,
  },
  {
    kind: 'percent',
    title: '扣大获失败',
    weight: 1,
    percent: { min: 101, max: 290 },
    apply: (length, percent) => multiplyByPercent(length, percent),
    describe: (percent) => `长度乘以${formatFactor(percent)}`,
  },
  {
    kind: 'none',
    title: '没有变化',
    weight: 2,
    apply: (length) => length,
    describe: () => '它失去了梦想，长度没有变化',
  },
];

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
  private readonly lastActionAtByUserId = new Map<number, number>();

  constructor(
    private readonly db: DatabaseService,
    private readonly currency: CurrencyService,
    private readonly random: RandomService,
  ) {}

  async get(userId: number): Promise<DickProfile | undefined> {
    return this.getIn(this.db.kysely, userId);
  }

  async getIn(
    db: QueryRunner,
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

  async purchaseLength(
    userId: number,
    amount: number,
    direction: 1 | -1,
  ): Promise<PurchaseLengthResult> {
    assertUserId(userId);

    const normalizedAmount = normalizePurchaseAmount(amount);
    if (normalizedAmount === undefined) {
      throw new RangeError('purchase amount must be a positive safe integer');
    }

    const cost = normalizedAmount * PURCHASE_PRICE_PER_UNIT;
    const lengthDelta = normalizedAmount * direction;

    return this.db.kysely.transaction().execute(async (trx) => {
      const profile = await this.getIn(trx, userId);
      if (!profile) {
        const balance = await this.currency.getIn(trx, userId);
        return {
          ok: false,
          reason: 'not_registered' as const,
          amount: normalizedAmount,
          lengthDelta,
          cost,
          shell: balance.shell,
        };
      }

      const balance = await this.currency.getIn(trx, userId);
      if (balance.shell < cost) {
        return {
          ok: false,
          reason: 'insufficient_shell' as const,
          amount: normalizedAmount,
          lengthDelta,
          cost,
          shell: balance.shell,
        };
      }

      const nextLength = profile.length + lengthDelta;
      if (!Number.isSafeInteger(nextLength)) {
        throw new RangeError('next length must be a safe integer');
      }

      const nextBalance = await this.currency.spendIn(trx, userId, {
        shell: cost,
      });
      const nextProfile = await this.setLengthIn(trx, userId, nextLength);

      return {
        ok: true,
        amount: normalizedAmount,
        lengthDelta,
        cost,
        shell: nextBalance.shell,
        profile: nextProfile,
      };
    });
  }

  async masturbate(userId: number): Promise<LengthChangeResult> {
    assertUserId(userId);

    return this.db.kysely.transaction().execute(async (trx) => {
      const profile = ensureRegistered(await this.getIn(trx, userId), '你');
      if (profile.length <= 0) {
        throw new Error('请问它在哪里？\n试着说【扣】');
      }

      this.consumeRateLimit(userId);
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

      const rolled = this.rollLengthAction(profile.length, masturbateOutcomes);

      const nextBalance = await this.currency.spendIn(trx, userId, {
        stamina: staminaCost,
      });
      const nextProfile = await this.setLengthIn(
        trx,
        userId,
        rolled.nextLength,
      );

      return {
        profile: nextProfile,
        title: rolled.title,
        detail: rolled.detail,
        staminaCost,
        staminaLeft: nextBalance.stamina,
      };
    });
  }

  async tuck(userId: number): Promise<LengthChangeResult> {
    assertUserId(userId);

    return this.db.kysely.transaction().execute(async (trx) => {
      const profile = ensureRegistered(await this.getIn(trx, userId), '你');
      if (profile.length >= 0) {
        throw new Error('不是哥们，这……\n试着说【打搅】');
      }

      this.consumeRateLimit(userId);
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

      const rolled = this.rollLengthAction(profile.length, tuckOutcomes);

      const nextBalance = await this.currency.spendIn(trx, userId, {
        stamina: staminaCost,
      });
      const nextProfile = await this.setLengthIn(
        trx,
        userId,
        rolled.nextLength,
      );

      return {
        profile: nextProfile,
        title: rolled.title,
        detail: rolled.detail,
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

      this.consumeRateLimit(actorUserId);

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

  private consumeRateLimit(userId: number): void {
    const now = Date.now();
    const lastActionAt = this.lastActionAtByUserId.get(userId);

    if (lastActionAt !== undefined) {
      const elapsedMs = now - lastActionAt;
      if (elapsedMs < RATE_LIMIT_MS) {
        throw new DickRateLimitError(userId, RATE_LIMIT_MS - elapsedMs);
      }
    }

    this.lastActionAtByUserId.set(userId, now);
  }

  private rollLengthAction(
    length: number,
    outcomes: readonly LengthActionRule[],
  ): {
    nextLength: number;
    title: string;
    detail: string;
  } {
    const outcome = this.random.weightedPick(outcomes, (item) => item.weight);

    if (outcome.kind === 'delta') {
      const delta = pickRange(this.random, outcome.delta);
      return {
        nextLength: outcome.apply(length, delta),
        title: outcome.title,
        detail: outcome.describe(delta),
      };
    }

    if (outcome.kind === 'percent') {
      const percent = pickRange(this.random, outcome.percent);
      return {
        nextLength: outcome.apply(length, percent),
        title: outcome.title,
        detail: outcome.describe(percent),
      };
    }

    return {
      nextLength: outcome.apply(length),
      title: outcome.title,
      detail: outcome.describe(),
    };
  }

  private async setLengthIn(
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

  private assertDuelState(
    actor: DickProfile,
    target: DickProfile,
    mode: DuelMode,
  ): void {
    const createInvalidStateMessage = (action: string, requirement: string) =>
      `无法[${action}]：${requirement}\n当前状态：你${formatLength(actor.length)}，对方${formatLength(target.length)}`;

    if (mode === 'seduce' && !(actor.length < 0 && target.length > 0)) {
      throw new Error(
        createInvalidStateMessage('勾引', '需要你为负、对方为正'),
      );
    }

    if (mode === 'fence' && !(actor.length > 0 && target.length > 0)) {
      throw new Error(createInvalidStateMessage('击剑', '需要双方都为正'));
    }

    if (mode === 'top' && !(actor.length > 0 && target.length < 0)) {
      throw new Error(createInvalidStateMessage('撅', '需要你为正、对方为负'));
    }

    if (mode === 'grind' && !(actor.length < 0 && target.length < 0)) {
      throw new Error(createInvalidStateMessage('磨豆腐', '需要双方都为负'));
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
    takumi: TakumiService,
  },
  apply(ctx) {
    const dick = new DickService(ctx.db, ctx.currency, ctx.random);

    const reactToRateLimit = async (
      session: Session,
      error: unknown,
    ): Promise<boolean> => {
      if (!(error instanceof DickRateLimitError)) {
        return false;
      }

      const message = session.raw;
      if (message.message_scene === 'group') {
        await ctx.client.send_group_message_reaction({
          group_id: message.peer_id,
          message_seq: message.message_seq,
          reaction: RATE_LIMIT_REACTION,
        });
      }

      return true;
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
割牛牛成功
${formatCurrencyChange('微壳', result.shell ?? 0, -CUT_PRICE)}
      `);
    });

    const handlePurchaseLength = async (
      session: Session,
      amount: number,
      direction: 1 | -1,
    ) => {
      const message = session.raw;
      const normalizedAmount = normalizePurchaseAmount(amount);
      const label = direction > 0 ? '长度' : '深度';

      if (normalizedAmount === undefined) {
        await session.reply(msg`
${seg.mention(message.sender_id)}
购买${label}数量必须是正整数
        `);
        return;
      }

      const result = await dick.purchaseLength(
        message.sender_id,
        normalizedAmount,
        direction,
      );

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
微壳不足，购买${formatLength(result.amount)}${label}需要${result.cost}微壳
当前微壳：${result.shell}
        `);
        return;
      }

      await session.reply(msg`
${seg.mention(message.sender_id)}
购买${label}成功，${direction > 0 ? '增加' : '减少'}${formatDelta(result.lengthDelta)}
目前长度：${formatLength(result.profile?.length ?? 0)}
${formatCurrencyChange('微壳', result.shell, -result.cost)}
      `);
    };

    ctx.router
      .command('购买长度')
      .arg('amount', param.num())
      .execute((session, { amount }) =>
        handlePurchaseLength(session, amount, 1),
      );

    ctx.router
      .command('购买深度')
      .arg('amount', param.num())
      .execute((session, { amount }) =>
        handlePurchaseLength(session, amount, -1),
      );

    ctx.router.command('打搅').execute(async (session) => {
      const message = session.raw;

      try {
        const result = await dick.masturbate(message.sender_id);

        await session.reply(msg`
${seg.mention(message.sender_id)}
【${result.title}】
${result.detail}
目前长度：${formatLength(result.profile.length)}
${formatCurrencyChange('体力', result.staminaLeft, -result.staminaCost)}
        `);
      } catch (error) {
        if (await reactToRateLimit(session, error)) {
          return;
        }

        await session.reply(msg`
${seg.mention(message.sender_id)}
${error instanceof Error ? error.message : '打搅失败'}
        `);
      }
    });

    ctx.router.command('扣').execute(async (session) => {
      const message = session.raw;

      try {
        const result = await dick.tuck(message.sender_id);

        await session.reply(msg`
${seg.mention(message.sender_id)}
【${result.title}】
${result.detail}
目前长度：${formatLength(result.profile.length)}
${formatCurrencyChange('体力', result.staminaLeft, -result.staminaCost)}
        `);
      } catch (error) {
        if (await reactToRateLimit(session, error)) {
          return;
        }

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
      const message = session.raw;

      try {
        const result = await dick.duel(message.sender_id, targetUserId, mode);

        await session.reply(msg`
${seg.mention(message.sender_id)}
【${result.title}】
${result.detail}
你的长度：${formatLength(result.actor.length)}
对方长度：${formatLength(result.target.length)}
当前体力：你${result.actorStaminaLeft} (${formatCurrencyDelta(
          -result.actorStaminaCost,
        )})/对方${result.targetStaminaLeft} (${formatCurrencyDelta(
          -result.targetStaminaCost,
        )})
        `);
      } catch (error) {
        if (await reactToRateLimit(session, error)) {
          return;
        }

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

    ctx.router
      .command('磨豆腐')
      .arg('target', param.segment('mention'))
      .execute((session, { target }) =>
        handleDuel(session, target.data.user_id, 'grind', '磨豆腐失败'),
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
      const positiveEntries = positive.map((entry, index) => ({
        rank: index + 1,
        nickname:
          message.message_scene === 'group'
            ? (ctx.nick.resolve(message.peer_id, entry.userId) ?? '')
            : '',
        userId: entry.userId,
        length: entry.length,
      }));
      const negativeEntries = negative.map((entry, index) => ({
        rank: index + 1,
        nickname:
          message.message_scene === 'group'
            ? (ctx.nick.resolve(message.peer_id, entry.userId) ?? '')
            : '',
        userId: entry.userId,
        length: entry.length,
      }));
      const image = await ctx.takumi.renderJsxWithEmoji(
        DickRankingCard({
          positiveEntries,
          negativeEntries,
        }),
        {
          devicePixelRatio: 2,
        },
      );

      await session.reply(
        msg`${seg.image(`base64://${image.toString('base64')}`)}`,
      );
    });
  },
});

export default DickPlugin;
