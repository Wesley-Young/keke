import type { RandomService } from '@fraqjs/plugin-random';

export interface Range {
  min: number;
  max: number;
}

export interface WeightedRule {
  weight: number;
}

export interface KindedWeightedRule<TKind extends string> extends WeightedRule {
  kind: TKind;
}

export type ActionResult<
  TSuccess extends object,
  TFailure extends string,
  TFailureContext extends object = object,
> =
  | ({ ok: true } & TSuccess)
  | ({ ok: false; reason: TFailure } & TFailureContext);

export function assertUserId(userId: number): void {
  if (!Number.isSafeInteger(userId)) {
    throw new RangeError('userId must be a safe integer');
  }
}

export function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${label} must be a positive integer`);
  }
}

export function pickRange(random: RandomService, range: Range): number {
  return random.range(range.min, range.max);
}

export function capLoss(current: number, loss: number): number {
  return Math.min(current, loss);
}

export function formatDurationSeconds(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes <= 0) {
    return `${totalSeconds}秒`;
  }

  if (seconds === 0) {
    return `${minutes}分钟`;
  }

  return `${minutes}分${seconds}秒`;
}

export function formatDurationMs(ms: number): string {
  return formatDurationSeconds(Math.ceil(ms / 1000));
}
