import { definePlugin, msg, param, type Session, seg } from '@fraqjs/fraq';
import { DatabaseService } from '@fraqjs/plugin-kysely';

import { type CurrencyBalance, CurrencyService } from './currency';

type ExchangeTarget = 'stamina' | 'charm';

interface ExchangeRate {
  label: string;
  shellCost: number;
  minimumAmount: number;
}

interface ExchangeResult {
  ok: boolean;
  amount: number;
  cost: number;
  balance: CurrencyBalance;
}

const exchangeRates: Record<ExchangeTarget, ExchangeRate> = {
  stamina: {
    label: '体力',
    shellCost: 50,
    minimumAmount: 5,
  },
  charm: {
    label: '魅力',
    shellCost: 20,
    minimumAmount: 10,
  },
};

function normalizeAmount(amount: number): number | undefined {
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    return;
  }

  return amount;
}

export const ExchangePlugin = definePlugin({
  name: 'exchange',
  inject: {
    db: DatabaseService,
    currency: CurrencyService,
  },
  apply(ctx) {
    const exchange = async (
      userId: number,
      target: ExchangeTarget,
      amount: number,
    ): Promise<ExchangeResult> => {
      const rate = exchangeRates[target];
      const cost = amount * rate.shellCost;

      return ctx.db.kysely.transaction().execute(async (trx) => {
        const balance = await ctx.currency.getIn(trx, userId);
        if (balance.shell < cost) {
          return {
            ok: false,
            amount,
            cost,
            balance,
          };
        }

        const nextBalance = await ctx.currency.adjustIn(trx, userId, {
          shell: -cost,
          [target]: amount,
        });

        return {
          ok: true,
          amount,
          cost,
          balance: nextBalance,
        };
      });
    };

    const handleExchange = async (
      session: Session,
      target: ExchangeTarget,
      amount: number,
    ) => {
      const message = session.raw;
      const rate = exchangeRates[target];
      const normalizedAmount = normalizeAmount(amount);

      if (message.message_scene !== 'group') {
        await session.reply(msg`这个功能只能在群里使用`);
        return;
      }

      if (normalizedAmount === undefined) {
        await session.reply(msg`
${seg.mention(message.sender_id)}
请输入正整数数量
        `);
        return;
      }

      if (normalizedAmount < rate.minimumAmount) {
        await session.reply(msg`
${seg.mention(message.sender_id)}
不支持购买，${rate.label}至少购买${rate.minimumAmount}
        `);
        return;
      }

      const result = await exchange(
        message.sender_id,
        target,
        normalizedAmount,
      );

      if (!result.ok) {
        await session.reply(msg`
${seg.mention(message.sender_id)}
微壳不足，购买${result.amount}${rate.label}需要${result.cost}微壳
当前微壳：${result.balance.shell}
        `);
        return;
      }

      await session.reply(msg`
${seg.mention(message.sender_id)}
成功购买${result.amount}${rate.label}
花费微壳：${result.cost}
当前微壳：${result.balance.shell}
当前${rate.label}：${result.balance[target]}
      `);
    };

    ctx.router
      .command('购买体力')
      .arg('amount', param.num())
      .execute((session, { amount }) =>
        handleExchange(session, 'stamina', amount),
      );

    ctx.router
      .command('购买魅力')
      .arg('amount', param.num())
      .execute((session, { amount }) =>
        handleExchange(session, 'charm', amount),
      );

    ctx.router.command('货币声明').execute(async (session) => {
      const message = session.raw;

      await session.reply(msg`
${seg.mention(message.sender_id)}
100微壳=5魅力=2体力
微壳是日常生活中最通用的货币
小壳已经退出货币舞台，一切功能都被微壳代替
      `);
    });
  },
});

export default ExchangePlugin;
