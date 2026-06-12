import { definePlugin, msg, param, type Session, seg } from '@fraqjs/fraq';
import { DatabaseService } from '@fraqjs/plugin-kysely';
import { RandomService } from '@fraqjs/plugin-random';
import { TakumiService } from '@fraqjs/plugin-takumi';

import DickRankingCard from '../../templates/DickRankingCard';
import {
  CurrencyService,
  formatCurrencyChange,
  formatCurrencyDelta,
} from '../currency';
import { NickService } from '../nick';
import { DICK_PROFILE_TABLE } from './repository';
import {
  CUT_PRICE,
  formatDelta,
  formatLength,
  normalizePurchaseAmount,
} from './rules';
import { DickService } from './service';
import type { DuelMode } from './types';
import { DickRateLimitError } from './types';

const RATE_LIMIT_REACTION = '38';

export const DickPlugin = definePlugin({
  name: 'dick',
  provides: [DickService],
  inject: {
    db: DatabaseService,
    currency: CurrencyService,
    nick: NickService,
    random: RandomService,
    takumi: TakumiService,
  },
  apply(ctx) {
    const dick = new DickService(ctx.db, ctx.currency, ctx.random);

    const reactToRateLimit = async (
      session: Session,
      error: unknown,
    ): Promise<boolean> => {
      if (!(error instanceof DickRateLimitError)) {
        return false;
      }

      const message = session.raw;
      if (message.message_scene === 'group') {
        await ctx.client.send_group_message_reaction({
          group_id: message.peer_id,
          message_seq: message.message_seq,
          reaction: RATE_LIMIT_REACTION,
        });
      }

      return true;
    };

    ctx.provide(DickService, dick);
    ctx.db.schemas.register({
      name: 'dick',
      migrations: {
        '001_init_dick_profiles_table': {
          async up(db) {
            await db.schema
              .createTable(DICK_PROFILE_TABLE)
              .ifNotExists()
              .addColumn('user_id', 'integer', (column) => column.notNull())
              .addColumn('length', 'integer', (column) =>
                column.notNull().defaultTo(0),
              )
              .addColumn('registered_at', 'text', (column) => column.notNull())
              .addColumn('updated_at', 'text', (column) => column.notNull())
              .addPrimaryKeyConstraint('dick_profiles_pk', ['user_id'])
              .execute();
          },
        },
      },
    });

    ctx.router.command('注册牛牛').execute(async (session) => {
      const message = session.raw;
      const result = await dick.register(message.sender_id);

      if (result.alreadyRegistered) {
        await session.reply(msg`
${seg.mention(message.sender_id)}
你已经注册过牛牛了
当前长度：${formatLength(result.profile.length)}
        `);
        return;
      }

      await session.reply(msg`
${seg.mention(message.sender_id)}
注册完成！
你的牛牛长度为：${formatLength(result.profile.length)}
      `);
    });

    ctx.router.command('我的牛牛').execute(async (session) => {
      const message = session.raw;
      const profile = await dick.get(message.sender_id);

      if (!profile) {
        await session.reply(msg`
${seg.mention(message.sender_id)}
你还没注册，请先发送【注册牛牛】
        `);
        return;
      }

      await session.reply(msg`
${seg.mention(message.sender_id)}
你的牛牛长度为：${formatLength(profile.length)}
      `);
    });

    ctx.router.command('割牛牛').execute(async (session) => {
      const message = session.raw;
      const result = await dick.cut(message.sender_id);

      if (!result.ok && result.reason === 'not_registered') {
        await session.reply(msg`
${seg.mention(message.sender_id)}
你还没注册，请先发送【注册牛牛】
        `);
        return;
      }

      if (!result.ok && result.reason === 'insufficient_shell') {
        await session.reply(msg`
${seg.mention(message.sender_id)}
微壳不足，割牛牛需要100000微壳
当前微壳：${result.shell ?? 0}
        `);
        return;
      }

      await session.reply(msg`
${seg.mention(message.sender_id)}
割牛牛成功
${formatCurrencyChange('微壳', result.shell ?? 0, -CUT_PRICE)}
      `);
    });

    const handlePurchaseLength = async (
      session: Session,
      amount: number,
      direction: 1 | -1,
    ) => {
      const message = session.raw;
      const normalizedAmount = normalizePurchaseAmount(amount);
      const label = direction > 0 ? '长度' : '深度';

      if (normalizedAmount === undefined) {
        await session.reply(msg`
${seg.mention(message.sender_id)}
购买${label}数量必须是正整数
        `);
        return;
      }

      const result = await dick.purchaseLength(
        message.sender_id,
        normalizedAmount,
        direction,
      );

      if (!result.ok && result.reason === 'not_registered') {
        await session.reply(msg`
${seg.mention(message.sender_id)}
你还没注册，请先发送【注册牛牛】
        `);
        return;
      }

      if (!result.ok && result.reason === 'insufficient_shell') {
        await session.reply(msg`
${seg.mention(message.sender_id)}
微壳不足，购买${formatLength(result.amount)}${label}需要${result.cost}微壳
当前微壳：${result.shell}
        `);
        return;
      }

      await session.reply(msg`
${seg.mention(message.sender_id)}
购买${label}成功，${direction > 0 ? '增加' : '减少'}${formatDelta(result.lengthDelta)}
目前长度：${formatLength(result.profile?.length ?? 0)}
${formatCurrencyChange('微壳', result.shell, -result.cost)}
      `);
    };

    ctx.router
      .command('购买长度')
      .arg('amount', param.num())
      .execute((session, { amount }) =>
        handlePurchaseLength(session, amount, 1),
      );

    ctx.router
      .command('购买深度')
      .arg('amount', param.num())
      .execute((session, { amount }) =>
        handlePurchaseLength(session, amount, -1),
      );

    ctx.router.command('打搅').execute(async (session) => {
      const message = session.raw;

      try {
        const result = await dick.masturbate(message.sender_id);

        await session.reply(msg`
${seg.mention(message.sender_id)}
【${result.title}】
${result.detail}
目前长度：${formatLength(result.profile.length)}
${formatCurrencyChange('体力', result.staminaLeft, -result.staminaCost)}
        `);
      } catch (error) {
        if (await reactToRateLimit(session, error)) {
          return;
        }

        await session.reply(msg`
${seg.mention(message.sender_id)}
${error instanceof Error ? error.message : '打搅失败'}
        `);
      }
    });

    ctx.router.command('扣').execute(async (session) => {
      const message = session.raw;

      try {
        const result = await dick.tuck(message.sender_id);

        await session.reply(msg`
${seg.mention(message.sender_id)}
【${result.title}】
${result.detail}
目前长度：${formatLength(result.profile.length)}
${formatCurrencyChange('体力', result.staminaLeft, -result.staminaCost)}
        `);
      } catch (error) {
        if (await reactToRateLimit(session, error)) {
          return;
        }

        await session.reply(msg`
${seg.mention(message.sender_id)}
${error instanceof Error ? error.message : '扣失败'}
        `);
      }
    });

    const handleDuel = async (
      session: Session,
      targetUserId: number,
      mode: DuelMode,
      fallback: string,
    ) => {
      const message = session.raw;

      try {
        const result = await dick.duel(message.sender_id, targetUserId, mode);

        await session.reply(msg`
${seg.mention(message.sender_id)}
【${result.title}】
${result.detail}
你的长度：${formatLength(result.actor.length)}
对方长度：${formatLength(result.target.length)}
当前体力：你${result.actorStaminaLeft} (${formatCurrencyDelta(
          -result.actorStaminaCost,
        )})/对方${result.targetStaminaLeft} (${formatCurrencyDelta(
          -result.targetStaminaCost,
        )})
        `);
      } catch (error) {
        if (await reactToRateLimit(session, error)) {
          return;
        }

        await session.reply(msg`
${seg.mention(message.sender_id)}
${error instanceof Error ? error.message : fallback}
        `);
      }
    };

    ctx.router
      .command('勾引')
      .arg('target', param.segment('mention'))
      .execute((session, { target }) =>
        handleDuel(session, target.data.user_id, 'seduce', '勾引失败'),
      );

    ctx.router
      .command('击剑')
      .arg('target', param.segment('mention'))
      .execute((session, { target }) =>
        handleDuel(session, target.data.user_id, 'fence', '击剑失败'),
      );

    ctx.router
      .command('撅')
      .arg('target', param.segment('mention'))
      .execute((session, { target }) =>
        handleDuel(session, target.data.user_id, 'top', '撅失败'),
      );

    ctx.router
      .command('磨豆腐')
      .arg('target', param.segment('mention'))
      .execute((session, { target }) =>
        handleDuel(session, target.data.user_id, 'grind', '磨豆腐失败'),
      );

    ctx.router.command('牛牛排行榜').execute(async (session) => {
      const message = session.raw;
      const ranking = await dick.getRanking();
      const positiveEntries = ranking.positive.map((entry, index) => ({
        rank: index + 1,
        nickname:
          message.message_scene === 'group'
            ? (ctx.nick.resolve(message.peer_id, entry.userId) ?? '')
            : '',
        userId: entry.userId,
        length: entry.length,
      }));
      const negativeEntries = ranking.negative.map((entry, index) => ({
        rank: index + 1,
        nickname:
          message.message_scene === 'group'
            ? (ctx.nick.resolve(message.peer_id, entry.userId) ?? '')
            : '',
        userId: entry.userId,
        length: entry.length,
      }));
      const image = await ctx.takumi.renderJsxWithEmoji(
        DickRankingCard({
          positiveEntries,
          negativeEntries,
        }),
        {
          devicePixelRatio: 2,
        },
      );

      await session.reply(
        msg`${seg.image(`base64://${image.toString('base64')}`)}`,
      );
    });
  },
});

export * from './messages';
export * from './repository';
export * from './rules';
export { DickService } from './service';
export * from './types';

export default DickPlugin;
