export function createInsufficientStaminaMessage(
  label: string,
  required: number,
  current: number,
): string {
  return `${label}体力不足，需要${required}体力，当前体力：${current}`;
}
