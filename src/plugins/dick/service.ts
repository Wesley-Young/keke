import type { DatabaseService } from '@fraqjs/plugin-kysely';
import type { RandomService } from '@fraqjs/plugin-random';

import { assertUserId } from '../../util/rules';
import type { CurrencyService } from '../currency';
import { createInsufficientStaminaMessage } from './messages';
import {
  deleteProfileIn,
  getProfileIn,
  getRankingIn,
  insertProfileIn,
  setLengthIn,
} from './repository';
import {
  assertDuelState,
  CUT_PRICE,
  DUEL_ACTION_STAMINA_COST_MAX,
  DUEL_ACTION_STAMINA_COST_MIN,
  DUEL_REQUIRED_STAMINA,
  duelOutcomes,
  ensureRegistered,
  INITIAL_LENGTH_MAX,
  INITIAL_LENGTH_MIN,
  masturbateOutcomes,
  normalizePurchaseAmount,
  PURCHASE_PRICE_PER_UNIT,
  RATE_LIMIT_MS,
  rollLengthAction,
  SINGLE_ACTION_STAMINA_COST_MAX,
  SINGLE_ACTION_STAMINA_COST_MIN,
  tuckOutcomes,
} from './rules';
import type {
  DickProfile,
  DickRanking,
  DuelMode,
  DuelResult,
  LengthChangeResult,
  PurchaseLengthResult,
} from './types';
import { DickRateLimitError } from './types';

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

  async getIn(db: Parameters<typeof getProfileIn>[0], userId: number) {
    assertUserId(userId);
    return getProfileIn(db, userId);
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

      const length = this.random.range(INITIAL_LENGTH_MIN, INITIAL_LENGTH_MAX);
      const profile = await insertProfileIn(trx, userId, length);

      return {
        alreadyRegistered: false,
        profile,
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

      await deleteProfileIn(trx, userId);

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
      const nextProfile = await setLengthIn(trx, userId, nextLength);

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

      const rolled = rollLengthAction(
        this.random,
        profile.length,
        masturbateOutcomes,
      );

      const nextBalance = await this.currency.spendIn(trx, userId, {
        stamina: staminaCost,
      });
      const nextProfile = await setLengthIn(trx, userId, rolled.nextLength);

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

      const rolled = rollLengthAction(
        this.random,
        profile.length,
        tuckOutcomes,
      );

      const nextBalance = await this.currency.spendIn(trx, userId, {
        stamina: staminaCost,
      });
      const nextProfile = await setLengthIn(trx, userId, rolled.nextLength);

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

      assertDuelState(actor, target, mode);

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
      const nextActor = await setLengthIn(
        trx,
        actorUserId,
        applied.actorLength,
      );
      const nextTarget = await setLengthIn(
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

  async getRanking(): Promise<DickRanking> {
    return getRankingIn(this.db.kysely);
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
}
