import { definePlugin, msg, param, seg } from '@fraqjs/fraq';

import { CurrencyService, formatCurrencyChange } from './currency';

export const TransferPlugin = definePlugin({
  name: 'transfer',
  inject: {
    currency: CurrencyService,
  },
  apply(ctx) {
    ctx.router
      .command('转账')
      .arg('target', param.segment('mention'))
      .arg('amount', param.num())
      .execute(async (session, { target, amount }) => {
        const message = session.raw;

        if (message.message_scene !== 'group') {
          await session.reply(msg`这个功能只能在群里使用`);
          return;
        }

        const targetUserId = target.data.user_id;
        if (message.sender_id === targetUserId) {
          await session.reply(msg`
${seg.mention(message.sender_id)}
不能给自己转账
          `);
          return;
        }

        if (!Number.isSafeInteger(amount) || amount <= 0) {
          await session.reply(msg`
${seg.mention(message.sender_id)}
转账金额必须是正整数
          `);
          return;
        }

        try {
          const result = await ctx.currency.transfer(
            message.sender_id,
            targetUserId,
            {
              shell: amount,
            },
          );

          await session.reply(msg`
${seg.mention(message.sender_id)}
转账成功，已向${seg.mention(targetUserId)} 转账${amount}微壳
${formatCurrencyChange('微壳', result.from.shell, -amount)}
          `);
        } catch {
          const balance = await ctx.currency.get(message.sender_id);

          await session.reply(msg`
${seg.mention(message.sender_id)}
微壳不足，转账${amount}微壳失败
当前微壳：${balance.shell}
          `);
        }
      });
  },
});

export default TransferPlugin;
