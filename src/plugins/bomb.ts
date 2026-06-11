import { definePlugin, msg, param, seg } from '@fraqjs/fraq';
import { DatabaseService } from '@fraqjs/plugin-kysely';
import { RandomService } from '@fraqjs/plugin-random';

import {
  assertPositiveInteger,
  assertUserId,
  capLoss,
  formatDurationMs,
  formatDurationSeconds,
  type KindedWeightedRule,
  pickRange,
  type Range,
} from '../util/rules';
import {
  type CurrencyBalance,
  CurrencyService,
  formatCurrencyChange,
} from './currency';

const BOMB_PRICE = 50_000;
const MIN_TARGET_SHELL = 50_000;
const MAX_STEAL_RATIO = 0.2;
const ACTOR_COOLDOWN_MS = 60 * 1000;
const MIN_ACTOR_STAMINA = 50;
const MIN_ACTOR_CHARM = 50;

type BombTierKind = 'poor' | 'middle' | 'rich' | 'wealthy';
type BombOutcomeKind = 'success' | 'backfire';

interface BombTier {
  kind: BombTierKind;
  label: string;
  successWeight: number;
  backfireWeight: number;
  stealShell: Range;
  backfireShell: Range;
  actorSuccessStamina: Range;
  actorSuccessCharm: Range;
  targetSuccessStamina: Range;
  targetSuccessCharm: Range;
  actorBackfireStamina: Range;
  actorBackfireCharm: Range;
  muteSeconds: Range;
}

interface BombResultBase {
  tier: BombTier;
  actor: CurrencyBalance;
  target: CurrencyBalance;
  actorStaminaLoss: number;
  actorCharmLoss: number;
}

type BombResult =
  | (BombResultBase & {
      outcome: 'success';
      shellStolen: number;
      targetStaminaLoss: number;
      targetCharmLoss: number;
    })
  | (BombResultBase & {
      outcome: 'backfire';
      shellLoss: number;
      muteSeconds: number;
    });

class BombRateLimitError extends Error {
  constructor(readonly remainingMs: number) {
    super('Bomb rate limited');
  }
}

interface BombSuccessRoll {
  shellStolen: number;
  actorStaminaLoss: number;
  actorCharmLoss: number;
  targetStaminaLoss: number;
  targetCharmLoss: number;
}

interface BombBackfireRoll {
  shellLoss: number;
  actorStaminaLoss: number;
  actorCharmLoss: number;
  muteSeconds: number;
}

const poorTier: BombTier = {
  kind: 'poor',
  label: '不足25W',
  successWeight: 70,
  backfireWeight: 30,
  stealShell: { min: 15_000, max: 35_000 },
  backfireShell: { min: 10_000, max: 25_000 },
  actorSuccessStamina: { min: 15, max: 35 },
  actorSuccessCharm: { min: 20, max: 50 },
  targetSuccessStamina: { min: 50, max: 100 },
  targetSuccessCharm: { min: 60, max: 120 },
  actorBackfireStamina: { min: 70, max: 140 },
  actorBackfireCharm: { min: 80, max: 160 },
  muteSeconds: { min: 60, max: 90 },
};

const middleTier: BombTier = {
  kind: 'middle',
  label: '25W-100W',
  successWeight: 65,
  backfireWeight: 35,
  stealShell: { min: 40_000, max: 80_000 },
  backfireShell: { min: 25_000, max: 50_000 },
  actorSuccessStamina: { min: 20, max: 50 },
  actorSuccessCharm: { min: 30, max: 80 },
  targetSuccessStamina: { min: 80, max: 160 },
  targetSuccessCharm: { min: 100, max: 200 },
  actorBackfireStamina: { min: 100, max: 200 },
  actorBackfireCharm: { min: 120, max: 240 },
  muteSeconds: { min: 60, max: 120 },
};

const richTier: BombTier = {
  kind: 'rich',
  label: '100W-250W',
  successWeight: 60,
  backfireWeight: 40,
  stealShell: { min: 80_000, max: 150_000 },
  backfireShell: { min: 45_000, max: 90_000 },
  actorSuccessStamina: { min: 35, max: 80 },
  actorSuccessCharm: { min: 50, max: 120 },
  targetSuccessStamina: { min: 150, max: 300 },
  targetSuccessCharm: { min: 180, max: 360 },
  actorBackfireStamina: { min: 180, max: 360 },
  actorBackfireCharm: { min: 220, max: 440 },
  muteSeconds: { min: 120, max: 210 },
};

const xRichTier: BombTier = {
  kind: 'wealthy',
  label: '250W以上',
  successWeight: 50,
  backfireWeight: 50,
  stealShell: { min: 200_000, max: 500_000 },
  backfireShell: { min: 100_000, max: 200_000 },
  actorSuccessStamina: { min: 35, max: 80 },
  actorSuccessCharm: { min: 50, max: 120 },
  targetSuccessStamina: { min: 150, max: 300 },
  targetSuccessCharm: { min: 180, max: 360 },
  actorBackfireStamina: { min: 180, max: 360 },
  actorBackfireCharm: { min: 220, max: 440 },
  muteSeconds: { min: 120, max: 240 },
};

function pickTier(targetShell: number): BombTier {
  if (targetShell < 250_000) {
    return poorTier;
  }

  if (targetShell < 1_000_000) {
    return middleTier;
  }

  if (targetShell < 2_500_000) {
    return richTier;
  }

  return xRichTier;
}

export class BombService {
  private readonly actorCooldownByUserId = new Map<number, number>();

  constructor(
    private readonly db: DatabaseService,
    private readonly currency: CurrencyService,
    private readonly random: RandomService,
  ) {}

  async buy(userId: number, amount: number) {
    assertUserId(userId);
    assertPositiveInteger(amount, 'amount');

    return this.db.kysely.transaction().execute(async (trx) => {
      const balance = await this.currency.getIn(trx, userId);
      const cost = amount * BOMB_PRICE;

      if (balance.shell < cost) {
        return {
          ok: false as const,
          cost,
          balance,
        };
      }

      const nextBalance = await this.currency.spendIn(trx, userId, {
        shell: cost,
      });
      const finalBalance = await this.currency.addIn(trx, userId, {
        bomb: amount,
      });

      return {
        ok: true as const,
        cost,
        balance: {
          ...finalBalance,
          shell: nextBalance.shell,
        },
      };
    });
  }

  async attack(actorUserId: number, targetUserId: number): Promise<BombResult> {
    assertUserId(actorUserId);
    assertUserId(targetUserId);

    if (actorUserId === targetUserId) {
      throw new Error('不能炸自己');
    }

    this.assertCooldown(actorUserId);

    return this.db.kysely.transaction().execute(async (trx) => {
      const actor = await this.currency.getIn(trx, actorUserId);
      const target = await this.currency.getIn(trx, targetUserId);

      if (actor.bomb < 1) {
        throw new Error('炸弹不足');
      }

      if (actor.stamina < MIN_ACTOR_STAMINA) {
        throw new Error(
          `体力不足，使用炸弹至少需要${MIN_ACTOR_STAMINA}体力，当前体力：${actor.stamina}`,
        );
      }

      if (actor.charm < MIN_ACTOR_CHARM) {
        throw new Error(
          `魅力不足，使用炸弹至少需要${MIN_ACTOR_CHARM}魅力，当前魅力：${actor.charm}`,
        );
      }

      if (target.shell < MIN_TARGET_SHELL) {
        throw new Error('对方已经没什么可炸的了');
      }

      const tier = pickTier(target.shell);
      await this.currency.spendIn(trx, actorUserId, {
        bomb: 1,
      });

      const outcome = this.pickOutcome(tier);

      this.consumeCooldown(actorUserId);

      if (outcome === 'success') {
        const roll = this.rollSuccess(tier, actor, target);

        const transfer = await this.currency.transferIn(
          trx,
          targetUserId,
          actorUserId,
          {
            shell: roll.shellStolen,
          },
        );
        const nextActor = await this.currency.spendIn(trx, actorUserId, {
          stamina: roll.actorStaminaLoss,
          charm: roll.actorCharmLoss,
        });
        const nextTarget = await this.currency.spendIn(trx, targetUserId, {
          stamina: roll.targetStaminaLoss,
          charm: roll.targetCharmLoss,
        });

        return {
          outcome,
          tier,
          ...roll,
          actor: {
            ...nextActor,
            shell: transfer.to.shell,
          },
          target: {
            ...nextTarget,
            shell: transfer.from.shell,
          },
        };
      }

      const roll = this.rollBackfire(tier, actor);
      const nextActor = await this.currency.spendIn(trx, actorUserId, {
        shell: roll.shellLoss,
        stamina: roll.actorStaminaLoss,
        charm: roll.actorCharmLoss,
      });

      return {
        outcome,
        tier,
        ...roll,
        actor: nextActor,
        target,
      };
    });
  }

  private pickOutcome(tier: BombTier): BombOutcomeKind {
    const outcomes: readonly KindedWeightedRule<BombOutcomeKind>[] = [
      { kind: 'success', weight: tier.successWeight },
      { kind: 'backfire', weight: tier.backfireWeight },
    ];

    return this.random.weightedPick(outcomes, (item) => item.weight).kind;
  }

  private rollSuccess(
    tier: BombTier,
    actor: CurrencyBalance,
    target: CurrencyBalance,
  ): BombSuccessRoll {
    const requestedSteal = pickRange(this.random, tier.stealShell);
    const stealCap = Math.floor(target.shell * MAX_STEAL_RATIO);

    return {
      shellStolen: capLoss(target.shell, Math.min(requestedSteal, stealCap)),
      actorStaminaLoss: capLoss(
        actor.stamina,
        pickRange(this.random, tier.actorSuccessStamina),
      ),
      actorCharmLoss: capLoss(
        actor.charm,
        pickRange(this.random, tier.actorSuccessCharm),
      ),
      targetStaminaLoss: capLoss(
        target.stamina,
        pickRange(this.random, tier.targetSuccessStamina),
      ),
      targetCharmLoss: capLoss(
        target.charm,
        pickRange(this.random, tier.targetSuccessCharm),
      ),
    };
  }

  private rollBackfire(
    tier: BombTier,
    actor: CurrencyBalance,
  ): BombBackfireRoll {
    return {
      shellLoss: capLoss(
        actor.shell,
        pickRange(this.random, tier.backfireShell),
      ),
      actorStaminaLoss: capLoss(
        actor.stamina,
        pickRange(this.random, tier.actorBackfireStamina),
      ),
      actorCharmLoss: capLoss(
        actor.charm,
        pickRange(this.random, tier.actorBackfireCharm),
      ),
      muteSeconds: pickRange(this.random, tier.muteSeconds),
    };
  }

  private assertCooldown(actorUserId: number): void {
    const now = Date.now();
    const actorLastActionAt = this.actorCooldownByUserId.get(actorUserId);
    if (actorLastActionAt !== undefined) {
      const elapsedMs = now - actorLastActionAt;
      if (elapsedMs < ACTOR_COOLDOWN_MS) {
        throw new BombRateLimitError(ACTOR_COOLDOWN_MS - elapsedMs);
      }
    }
  }

  private consumeCooldown(actorUserId: number): void {
    const now = Date.now();
    this.actorCooldownByUserId.set(actorUserId, now);
  }
}

export const BombPlugin = definePlugin({
  name: 'bomb',
  provides: [BombService],
  inject: {
    db: DatabaseService,
    currency: CurrencyService,
    random: RandomService,
  },
  apply(ctx) {
    const bomb = new BombService(ctx.db, ctx.currency, ctx.random);
    ctx.provide(BombService, bomb);

    ctx.router.command('炸弹说明').execute(async (session) => {
      const message = session.raw;
      await session.reply(msg`
${seg.mention(message.sender_id)}
炸弹(5W微壳/个)
使用【炸弹@某人】消耗1个炸弹攻击对方
每人每1分钟可使用一次
对方越富有收益越高，但反噬也越重
对方微壳低于5W时无法攻击
抢夺的微壳不会超过对方当前财产的20%
      `);
    });

    ctx.router
      .command('购买炸弹')
      .arg('amount', param.num())
      .execute(async (session, { amount }) => {
        const message = session.raw;

        if (!Number.isSafeInteger(amount) || amount <= 0) {
          await session.reply(msg`
${seg.mention(message.sender_id)}
购买数量必须是正整数
          `);
          return;
        }

        const result = await bomb.buy(message.sender_id, amount);
        if (!result.ok) {
          await session.reply(msg`
${seg.mention(message.sender_id)}
微壳不足，购买${amount}个炸弹需要${result.cost}微壳
当前微壳：${result.balance.shell}
          `);
          return;
        }

        await session.reply(msg`
${seg.mention(message.sender_id)}
购买成功
${formatCurrencyChange('微壳', result.balance.shell, -result.cost)}
${formatCurrencyChange('炸弹', result.balance.bomb, amount)}
        `);
      });

    ctx.router
      .command('炸')
      .arg('target', param.segment('mention'))
      .execute(async (session, { target }) => {
        const message = session.raw;
        const targetUserId = target.data.user_id;

        try {
          const result = await bomb.attack(message.sender_id, targetUserId);

          if (result.outcome === 'success') {
            await session.reply(msg`
${seg.mention(message.sender_id)}
轰炸成功！
目标档位：${result.tier.label}
对方损失：${result.targetStaminaLoss}体力/${result.targetCharmLoss}魅力
${formatCurrencyChange('微壳', result.actor.shell, result.shellStolen)}
${formatCurrencyChange('体力', result.actor.stamina, -result.actorStaminaLoss)}
${formatCurrencyChange('魅力', result.actor.charm, -result.actorCharmLoss)}
${formatCurrencyChange('炸弹', result.actor.bomb, -1)}
            `);
            return;
          }

          let muteOk = true;
          if (message.message_scene === 'group') {
            try {
              await ctx.client.set_group_member_mute({
                group_id: message.peer_id,
                user_id: message.sender_id,
                duration: result.muteSeconds,
              });
            } catch {
              muteOk = false;
            }
          } else {
            muteOk = false;
          }

          await session.reply(msg`
${seg.mention(message.sender_id)}
炸弹反噬！
目标档位：${result.tier.label}
反噬禁言：${muteOk ? formatDurationSeconds(result.muteSeconds) : '未生效'}
${formatCurrencyChange('微壳', result.actor.shell, -result.shellLoss)}
${formatCurrencyChange('体力', result.actor.stamina, -result.actorStaminaLoss)}
${formatCurrencyChange('魅力', result.actor.charm, -result.actorCharmLoss)}
${formatCurrencyChange('炸弹', result.actor.bomb, -1)}
          `);
        } catch (error) {
          if (error instanceof BombRateLimitError) {
            await session.reply(msg`
${seg.mention(message.sender_id)}
你还在炸弹冷却中，剩余${formatDurationMs(error.remainingMs)}
            `);
            return;
          }

          await session.reply(msg`
${seg.mention(message.sender_id)}
${error instanceof Error ? error.message : '轰炸失败'}
          `);
        }
      });
  },
});

export default BombPlugin;
