import { definePlugin, msg, param, seg } from '@fraqjs/fraq';
import { DatabaseService } from '@fraqjs/plugin-kysely';
import { RandomService } from '@fraqjs/plugin-random';

import { formatDurationMs } from '../../util/rules';
import { CurrencyService, formatCurrencyChange } from '../currency';
import { formatBombMuteResult } from './messages';
import { BombService } from './service';
import { BombRateLimitError } from './types';

export const BombPlugin = definePlugin({
  name: 'bomb',
  provides: [BombService],
  inject: {
    db: DatabaseService,
    currency: CurrencyService,
    random: RandomService,
  },
  apply(ctx) {
    const bomb = new BombService(ctx.db, ctx.currency, ctx.random);
    ctx.provide(BombService, bomb);

    ctx.router
      .command('购买炸弹')
      .arg('amount', param.num())
      .execute(async (session, { amount }) => {
        const message = session.raw;

        if (!Number.isSafeInteger(amount) || amount <= 0) {
          await session.reply(msg`
${seg.mention(message.sender_id)}
购买数量必须是正整数
          `);
          return;
        }

        const result = await bomb.buy(message.sender_id, amount);
        if (!result.ok) {
          await session.reply(msg`
${seg.mention(message.sender_id)}
微壳不足，购买${amount}个炸弹需要${result.cost}微壳
当前微壳：${result.balance.shell}
          `);
          return;
        }

        await session.reply(msg`
${seg.mention(message.sender_id)}
购买成功
${formatCurrencyChange('微壳', result.balance.shell, -result.cost)}
${formatCurrencyChange('炸弹', result.balance.bomb, amount)}
        `);
      });

    ctx.router
      .command('炸')
      .arg('target', param.segment('mention'))
      .execute(async (session, { target }) => {
        const message = session.raw;
        const targetUserId = target.data.user_id;

        try {
          const result = await bomb.attack(message.sender_id, targetUserId);

          if (result.outcome === 'success') {
            await session.reply(msg`
${seg.mention(message.sender_id)}
轰炸成功！
目标档位：${result.tier.label}
对方损失：${result.targetStaminaLoss}体力/${result.targetCharmLoss}魅力
${formatCurrencyChange('微壳', result.actor.shell, result.shellStolen)}
${formatCurrencyChange('体力', result.actor.stamina, -result.actorStaminaLoss)}
${formatCurrencyChange('魅力', result.actor.charm, -result.actorCharmLoss)}
${formatCurrencyChange('炸弹', result.actor.bomb, -1)}
            `);
            return;
          }

          let muteOk = true;
          if (message.message_scene === 'group') {
            try {
              await ctx.client.set_group_member_mute({
                group_id: message.peer_id,
                user_id: message.sender_id,
                duration: result.muteSeconds,
              });
            } catch {
              muteOk = false;
            }
          } else {
            muteOk = false;
          }

          await session.reply(msg`
${seg.mention(message.sender_id)}
炸弹反噬！
目标档位：${result.tier.label}
反噬禁言：${formatBombMuteResult(muteOk, result.muteSeconds)}
${formatCurrencyChange('微壳', result.actor.shell, -result.shellLoss)}
${formatCurrencyChange('体力', result.actor.stamina, -result.actorStaminaLoss)}
${formatCurrencyChange('魅力', result.actor.charm, -result.actorCharmLoss)}
${formatCurrencyChange('炸弹', result.actor.bomb, -1)}
          `);
        } catch (error) {
          if (error instanceof BombRateLimitError) {
            await session.reply(msg`
${seg.mention(message.sender_id)}
你还在炸弹冷却中，剩余${formatDurationMs(error.remainingMs)}
            `);
            return;
          }

          await session.reply(msg`
${seg.mention(message.sender_id)}
${error instanceof Error ? error.message : '轰炸失败'}
          `);
        }
      });
  },
});

export * from './constants';
export * from './messages';
export * from './rules';
export { BombService } from './service';
export * from './types';

export default BombPlugin;
