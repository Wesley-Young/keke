import type { DatabaseService } from '@fraqjs/plugin-kysely';
import type { RandomService } from '@fraqjs/plugin-random';

import {
  assertPositiveInteger,
  assertUserId,
  type KindedWeightedRule,
} from '../../util/rules';
import type { CurrencyService } from '../currency';
import {
  ACTOR_COOLDOWN_MS,
  BOMB_PRICE,
  MIN_ACTOR_CHARM,
  MIN_ACTOR_STAMINA,
  MIN_TARGET_SHELL,
} from './constants';
import { pickTier, rollBombBackfire, rollBombSuccess } from './rules';
import type { BombOutcomeKind, BombResult, BombTier } from './types';
import { BombRateLimitError } from './types';

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
        throw new Error('炸弹不足\n发送【玩法 炸弹】查看玩法说明');
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
        const roll = rollBombSuccess(this.random, tier, actor, target);

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

      const roll = rollBombBackfire(this.random, tier, actor);
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
