import type { RandomService } from '@fraqjs/plugin-random';

import { capLoss, pickRange } from '../../util/rules';
import type { CurrencyBalance } from '../currency';
import type { BombBackfireRoll, BombSuccessRoll, BombTier } from './types';

export const BOMB_PRICE = 50_000;
export const MIN_TARGET_SHELL = 50_000;
export const MAX_STEAL_RATIO = 0.2;
export const ACTOR_COOLDOWN_MS = 60 * 1000;
export const MIN_ACTOR_STAMINA = 50;
export const MIN_ACTOR_CHARM = 50;

export const poorTier: BombTier = {
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

export const middleTier: BombTier = {
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

export const richTier: BombTier = {
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

export const xRichTier: BombTier = {
  kind: 'wealthy',
  label: '250W-500W',
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

export const ultraRichTier: BombTier = {
  kind: 'ultra_wealthy',
  label: '500W-1000W',
  successWeight: 45,
  backfireWeight: 55,
  stealShell: { min: 400_000, max: 1_000_000 },
  backfireShell: { min: 200_000, max: 500_000 },
  actorSuccessStamina: { min: 50, max: 120 },
  actorSuccessCharm: { min: 80, max: 200 },
  targetSuccessStamina: { min: 300, max: 600 },
  targetSuccessCharm: { min: 360, max: 720 },
  actorBackfireStamina: { min: 300, max: 600 },
  actorBackfireCharm: { min: 400, max: 800 },
  muteSeconds: { min: 180, max: 300 },
};

export const superRichTier: BombTier = {
  kind: 'super_wealthy',
  label: '1000W以上',
  successWeight: 40,
  backfireWeight: 60,
  stealShell: { min: 1_000_000, max: 2_000_000 },
  backfireShell: { min: 200_000, max: 1_000_000 },
  actorSuccessStamina: { min: 50, max: 120 },
  actorSuccessCharm: { min: 80, max: 200 },
  targetSuccessStamina: { min: 300, max: 600 },
  targetSuccessCharm: { min: 360, max: 720 },
  actorBackfireStamina: { min: 300, max: 600 },
  actorBackfireCharm: { min: 400, max: 800 },
  muteSeconds: { min: 180, max: 300 },
};

export function pickTier(targetShell: number): BombTier {
  if (targetShell < 250_000) {
    return poorTier;
  }

  if (targetShell < 1_000_000) {
    return middleTier;
  }

  if (targetShell < 2_500_000) {
    return richTier;
  }

  if (targetShell < 5_000_000) {
    return xRichTier;
  }

  if (targetShell < 10_000_000) {
    return ultraRichTier;
  }

  return superRichTier;
}

export function rollBombSuccess(
  random: RandomService,
  tier: BombTier,
  actor: CurrencyBalance,
  target: CurrencyBalance,
): BombSuccessRoll {
  const requestedSteal = pickRange(random, tier.stealShell);
  const stealCap = Math.floor(target.shell * MAX_STEAL_RATIO);

  return {
    shellStolen: capLoss(target.shell, Math.min(requestedSteal, stealCap)),
    actorStaminaLoss: capLoss(
      actor.stamina,
      pickRange(random, tier.actorSuccessStamina),
    ),
    actorCharmLoss: capLoss(
      actor.charm,
      pickRange(random, tier.actorSuccessCharm),
    ),
    targetStaminaLoss: capLoss(
      target.stamina,
      pickRange(random, tier.targetSuccessStamina),
    ),
    targetCharmLoss: capLoss(
      target.charm,
      pickRange(random, tier.targetSuccessCharm),
    ),
  };
}

export function rollBombBackfire(
  random: RandomService,
  tier: BombTier,
  actor: CurrencyBalance,
): BombBackfireRoll {
  return {
    shellLoss: capLoss(actor.shell, pickRange(random, tier.backfireShell)),
    actorStaminaLoss: capLoss(
      actor.stamina,
      pickRange(random, tier.actorBackfireStamina),
    ),
    actorCharmLoss: capLoss(
      actor.charm,
      pickRange(random, tier.actorBackfireCharm),
    ),
    muteSeconds: pickRange(random, tier.muteSeconds),
  };
}
