import { definePlugin, msg, seg } from '@fraqjs/fraq';
import { RandomService } from '@fraqjs/plugin-random';

import {
  assertUserId,
  capLoss,
  formatDurationMs,
  formatDurationSeconds,
  pickRange,
  type WeightedRule,
} from '../util/rules';
import { CurrencyService, formatCurrencyChange } from './currency';

const COOLDOWN_MS = 30 * 60 * 1000;
const SUCCESS_REWARD = { min: 4_000_000, max: 6_000_000 } as const;
const FAILURE_LOSS = { min: 2_000_000, max: 4_000_000 } as const;
const FAILURE_MUTE_SECONDS = { min: 5 * 60, max: 10 * 60 } as const;

type BankRobberyOutcomeKind = 'success' | 'failure';

interface BankRobberyOutcomeRule extends WeightedRule {
  kind: BankRobberyOutcomeKind;
}

type BankRobberyResult =
  | {
      outcome: 'success';
      reward: number;
      shell: number;
    }
  | {
      outcome: 'failure';
      loss: number;
      muteSeconds: number;
      shell: number;
    };

const outcomeRules: readonly BankRobberyOutcomeRule[] = [
  { kind: 'success', weight: 30 },
  { kind: 'failure', weight: 70 },
];

export class BankRobberyRateLimitError extends Error {
  constructor(readonly remainingMs: number) {
    super('Bank robbery rate limited');
    this.name = 'BankRobberyRateLimitError';
  }
}

function formatWan(amount: number): string {
  return `${(amount / 10_000).toFixed(1).replace(/\.0$/, '')}W`;
}

export class BankRobberyService {
  private readonly lastRobberyAtByUserId = new Map<number, number>();

  constructor(
    private readonly currency: CurrencyService,
    private readonly random: RandomService,
  ) {}

  async rob(userId: number): Promise<BankRobberyResult> {
    assertUserId(userId);
    this.assertCooldown(userId);
    this.consumeCooldown(userId);

    const outcome = this.random.weightedPick(
      outcomeRules,
      (item) => item.weight,
    ).kind;

    if (outcome === 'success') {
      const reward = pickRange(this.random, SUCCESS_REWARD);
      const balance = await this.currency.add(userId, {
        shell: reward,
      });

      return {
        outcome,
        reward,
        shell: balance.shell,
      };
    }

    const current = await this.currency.get(userId);
    const rolledLoss = pickRange(this.random, FAILURE_LOSS);
    const loss = capLoss(current.shell, rolledLoss);
    const muteSeconds = pickRange(this.random, FAILURE_MUTE_SECONDS);
    const balance =
      loss > 0
        ? await this.currency.spend(userId, {
            shell: loss,
          })
        : await this.currency.ensure(userId);

    return {
      outcome,
      loss,
      muteSeconds,
      shell: balance.shell,
    };
  }

  private assertCooldown(userId: number): void {
    const lastRobberyAt = this.lastRobberyAtByUserId.get(userId);
    if (lastRobberyAt === undefined) {
      return;
    }

    const elapsedMs = Date.now() - lastRobberyAt;
    if (elapsedMs < COOLDOWN_MS) {
      throw new BankRobberyRateLimitError(COOLDOWN_MS - elapsedMs);
    }
  }

  private consumeCooldown(userId: number): void {
    this.lastRobberyAtByUserId.set(userId, Date.now());
  }
}

export const BankRobberyPlugin = definePlugin({
  name: 'bank-robbery',
  provides: [BankRobberyService],
  inject: {
    currency: CurrencyService,
    random: RandomService,
  },
  apply(ctx) {
    const bankRobbery = new BankRobberyService(ctx.currency, ctx.random);
    ctx.provide(BankRobberyService, bankRobbery);

    ctx.router
      .command('抢银行')
      .alias('打劫银行')
      .execute(async (session) => {
        const message = session.raw;

        if (message.message_scene !== 'group') {
          await session.reply(msg`这个功能只能在群里使用`);
          return;
        }

        try {
          const result = await bankRobbery.rob(message.sender_id);

          if (result.outcome === 'success') {
            await session.reply(msg`
${seg.mention(message.sender_id)}
抢银行成功！
你卷走了${formatWan(result.reward)}微壳
${formatCurrencyChange('微壳', result.shell, result.reward)}
            `);
            return;
          }

          let muteOk = true;
          try {
            await ctx.client.set_group_member_mute({
              group_id: message.peer_id,
              user_id: message.sender_id,
              duration: result.muteSeconds,
            });
          } catch {
            muteOk = false;
          }

          await session.reply(msg`
${seg.mention(message.sender_id)}
抢银行失败！
损失了${formatWan(result.loss)}微壳
禁言结果：${muteOk ? formatDurationSeconds(result.muteSeconds) : '未生效'}
${formatCurrencyChange('微壳', result.shell, -result.loss)}
          `);
        } catch (error) {
          if (error instanceof BankRobberyRateLimitError) {
            await session.reply(msg`
${seg.mention(message.sender_id)}
抢银行冷却中，剩余${formatDurationMs(error.remainingMs)}
            `);
            return;
          }

          await session.reply(msg`
${seg.mention(message.sender_id)}
${error instanceof Error ? error.message : '抢银行失败'}
          `);
        }
      });
  },
});

export default BankRobberyPlugin;
