import type { RandomService } from '@fraqjs/plugin-random';

import { pickRange } from '../../util/rules';
import type {
  DickProfile,
  DuelMode,
  DuelOutcome,
  LengthActionRule,
  RolledLengthAction,
} from './types';

export const CUT_PRICE = 2_000_000;
export const PURCHASE_PRICE_PER_UNIT = 3_000;
export const INITIAL_LENGTH_MIN = 30;
export const INITIAL_LENGTH_MAX = 1600;
export const SINGLE_ACTION_STAMINA_COST_MIN = 10;
export const SINGLE_ACTION_STAMINA_COST_MAX = 20;
export const DUEL_REQUIRED_STAMINA = 100;
export const DUEL_ACTION_STAMINA_COST_MIN = 10;
export const DUEL_ACTION_STAMINA_COST_MAX = 20;
export const RATE_LIMIT_MS = 30_000;

export function formatLength(length: number): string {
  const absolute = Math.trunc(Math.abs(length));
  const whole = Math.trunc(absolute / 100);
  const fraction = String(absolute % 100).padStart(2, '0');
  const sign = length < 0 ? '-' : '';

  return `${sign}${whole}.${fraction}cm`;
}

export function formatDelta(delta: number): string {
  return formatLength(Math.abs(delta));
}

export function formatFactor(percent: number): string {
  const whole = Math.trunc(percent / 100);
  const fraction = String(percent % 100).padStart(2, '0');

  return `${whole}.${fraction}`;
}

export function ensureRegistered(
  profile: DickProfile | undefined,
  label: string,
): DickProfile {
  if (!profile) {
    throw new Error(`${label}还没有注册牛牛\n发送【玩法 牛牛】查看玩法说明`);
  }

  return profile;
}

function multiplyByPercent(length: number, percent: number): number {
  return Math.trunc((length * percent) / 100);
}

function divideByPercent(length: number, percent: number): number {
  return Math.trunc((length * 100) / percent);
}

export function normalizePurchaseAmount(amount: number): number | undefined {
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    return;
  }

  if (!Number.isSafeInteger(amount * PURCHASE_PRICE_PER_UNIT)) {
    return;
  }

  return amount;
}

export const masturbateOutcomes: readonly LengthActionRule[] = [
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

export const tuckOutcomes: readonly LengthActionRule[] = [
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

export const duelOutcomes: readonly DuelOutcome[] = [
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

export function rollLengthAction(
  random: RandomService,
  length: number,
  outcomes: readonly LengthActionRule[],
): RolledLengthAction {
  const outcome = random.weightedPick(outcomes, (item) => item.weight);

  if (outcome.kind === 'delta') {
    const delta = pickRange(random, outcome.delta);
    return {
      nextLength: outcome.apply(length, delta),
      title: outcome.title,
      detail: outcome.describe(delta),
    };
  }

  if (outcome.kind === 'percent') {
    const percent = pickRange(random, outcome.percent);
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

export function assertDuelState(
  actor: DickProfile,
  target: DickProfile,
  mode: DuelMode,
): void {
  const createInvalidStateMessage = (action: string, requirement: string) =>
    `无法[${action}]：${requirement}\n当前状态：你${formatLength(actor.length)}，对方${formatLength(target.length)}`;

  if (mode === 'seduce' && !(actor.length <= 0 && target.length >= 0)) {
    throw new Error(createInvalidStateMessage('勾引', '需要你为负、对方为正'));
  }

  if (mode === 'fence' && !(actor.length >= 0 && target.length >= 0)) {
    throw new Error(createInvalidStateMessage('击剑', '需要双方都为正'));
  }

  if (mode === 'top' && !(actor.length >= 0 && target.length <= 0)) {
    throw new Error(createInvalidStateMessage('撅', '需要你为正、对方为负'));
  }

  if (mode === 'grind' && !(actor.length <= 0 && target.length <= 0)) {
    throw new Error(createInvalidStateMessage('磨豆腐', '需要双方都为负'));
  }
}
