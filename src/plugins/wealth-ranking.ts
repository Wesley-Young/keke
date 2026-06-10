import { definePlugin, msg } from '@fraqjs/fraq';
import { DatabaseService } from '@fraqjs/plugin-kysely';

import { CURRENCY_TABLE, CurrencyService } from './currency';
import { NickService } from './nick';

interface WealthRankingEntry {
  userId: number;
  amount: number;
}

const RANKING_LIMIT = 10;

export const WealthRankingPlugin = definePlugin({
  name: 'wealth-ranking',
  inject: {
    db: DatabaseService,
    currency: CurrencyService,
    nick: NickService,
  },
  apply(ctx) {
    ctx.router.command('富豪榜').execute(async (session) => {
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

      const lines = ranking.map((entry, index) => {
        const nick =
          message.message_scene === 'group'
            ? ctx.nick.resolve(message.peer_id, entry.userId)
            : undefined;
        const user = nick ? `${nick}(${entry.userId})` : `QQ ${entry.userId}`;
        return `#${index + 1} ${user} - ${entry.amount} 微壳`;
      });

      await session.reply(msg`${['微壳富豪榜 TOP 10', ...lines].join('\n')}`);
    });
  },
});

export default WealthRankingPlugin;
