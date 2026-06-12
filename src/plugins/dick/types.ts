import type { Range, WeightedRule } from '../../util/rules';

export interface DickProfileRow {
  user_id: number;
  length: number;
  registered_at: string;
  updated_at: string;
}

export interface DickProfile {
  userId: number;
  length: number;
}

export interface DickRankingEntry {
  userId: number;
  length: number;
}

export interface DickRanking {
  positive: DickRankingEntry[];
  negative: DickRankingEntry[];
}

export interface LengthChangeResult {
  profile: DickProfile;
  title: string;
  detail: string;
  staminaCost: number;
  staminaLeft: number;
}

export interface PurchaseLengthResult {
  ok: boolean;
  reason?: 'not_registered' | 'insufficient_shell';
  amount: number;
  lengthDelta: number;
  cost: number;
  shell: number;
  profile?: DickProfile;
}

export interface DuelResult {
  actor: DickProfile;
  target: DickProfile;
  title: string;
  detail: string;
  actorStaminaCost: number;
  targetStaminaCost: number;
  actorStaminaLeft: number;
  targetStaminaLeft: number;
}

export type DuelMode = 'seduce' | 'fence' | 'top' | 'grind';

type LengthActionValueKind = 'delta' | 'percent' | 'none';

interface LengthActionRuleBase<TKind extends LengthActionValueKind>
  extends WeightedRule {
  kind: TKind;
  title: string;
}

export type LengthActionRule =
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

export interface DuelOutcome {
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

export interface RolledLengthAction {
  nextLength: number;
  title: string;
  detail: string;
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
