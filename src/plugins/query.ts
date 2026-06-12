import { definePlugin, msg, seg } from '@fraqjs/fraq';
import { DatabaseService } from '@fraqjs/plugin-kysely';
import { TakumiService } from '@fraqjs/plugin-takumi';

import InfoCard from '../templates/InfoCard';
import WealthRankingCard from '../templates/WealthRankingCard';
import { CURRENCY_TABLE, CurrencyService } from './currency';
import { DickService, formatLength } from './dick';
import { FishingService, fishingItems } from './fishing';
import { NickService } from './nick';

interface WealthRankingEntry {
  userId: number;
  amount: number;
}

const RANKING_LIMIT = 10;

export const QueryPlugin = definePlugin({
  name: 'query',
  inject: {
    db: DatabaseService,
    currency: CurrencyService,
    dick: DickService,
    fishing: FishingService,
    nick: NickService,
    takumi: TakumiService,
  },
  apply(ctx) {
    ctx.router
      .command('我的信息')
      .alias('信息', '数据', '我的数据')
      .execute(async (session) => {
        const message = session.raw;
        const userId = message.sender_id;
        const balance = await ctx.currency.get(userId);
        const dick = await ctx.dick.get(userId);
        const fishing = await ctx.fishing.getInventory(userId);

        if (!balance) {
          await session.reply(msg`你还没有使用过机器人`);
          return;
        }

        const image = await ctx.takumi.renderJsxWithEmoji(
          InfoCard({
            nickname:
              message.message_scene === 'group'
                ? (ctx.nick.resolve(message.peer_id, userId) ?? String(userId))
                : String(userId),
            userId,
            currency: balance,
            dick: {
              registered: dick !== undefined,
              lengthText: dick ? formatLength(dick.length) : undefined,
            },
            fishing: {
              rod: fishing.rod,
              items: fishingItems
                .map((item) => ({
                  emoji: item.emoji,
                  count: fishing[item.kind],
                }))
                .filter((item) => item.count > 0),
            },
          }),
          {
            devicePixelRatio: 2,
          },
        );

        await session.reply(
          msg`${seg.image(`base64://${image.toString('base64')}`)}`,
        );
      });

    ctx.router
      .command('富豪榜')
      .alias('财富榜', '财富排行榜', '富豪排行榜')
      .execute(async (session) => {
        const message = session.raw;
        const rows = await ctx.db.kysely
          .selectFrom(CURRENCY_TABLE)
          .select(['user_id', 'shell'])
          .orderBy('shell', 'desc')
          .orderBy('user_id', 'asc')
          .limit(RANKING_LIMIT)
          .execute();
        const ranking: WealthRankingEntry[] = rows.map((row) => ({
          userId: row.user_id,
          amount: row.shell,
        }));

        if (ranking.length === 0) {
          await session.reply(msg`富豪榜暂无数据`);
          return;
        }

        const image = await ctx.takumi.renderJsxWithEmoji(
          WealthRankingCard({
            entries: ranking.map((entry, index) => ({
              rank: index + 1,
              nickname:
                message.message_scene === 'group'
                  ? (ctx.nick.resolve(message.peer_id, entry.userId) ?? '')
                  : '',
              userId: entry.userId,
              amount: entry.amount,
            })),
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

export default QueryPlugin;
