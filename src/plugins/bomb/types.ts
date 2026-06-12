import type { Range } from '../../util/rules';
import type { CurrencyBalance } from '../currency';

export type BombTierKind =
  | 'poor'
  | 'middle'
  | 'rich'
  | 'wealthy'
  | 'ultra_wealthy'
  | 'super_wealthy';

export type BombOutcomeKind = 'success' | 'backfire';

export interface BombTier {
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

export type BombResult =
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

export class BombRateLimitError extends Error {
  constructor(readonly remainingMs: number) {
    super('Bomb rate limited');
  }
}

export interface BombSuccessRoll {
  shellStolen: number;
  actorStaminaLoss: number;
  actorCharmLoss: number;
  targetStaminaLoss: number;
  targetCharmLoss: number;
}

export interface BombBackfireRoll {
  shellLoss: number;
  actorStaminaLoss: number;
  actorCharmLoss: number;
  muteSeconds: number;
}
