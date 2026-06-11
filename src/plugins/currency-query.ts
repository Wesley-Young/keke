import { definePlugin, msg, seg } from '@fraqjs/fraq';
import { DatabaseService } from '@fraqjs/plugin-kysely';

import { CURRENCY_TABLE, CurrencyService } from './currency';
import { NickService } from './nick';

interface WealthRankingEntry {
  userId: number;
  amount: number;
}

const RANKING_LIMIT = 10;

export const CurrencyQueryPlugin = definePlugin({
  name: 'currency-query',
  inject: {
    db: DatabaseService,
    currency: CurrencyService,
    nick: NickService,
  },
  apply(ctx) {
    ctx.router.command('钱包').execute(async (session) => {
      const message = session.raw;
      const userId = message.sender_id;
      const balance = await ctx.currency.get(userId);

      if (!balance) {
        await session.reply(msg`你还没有使用过机器人`);
        return;
      }

      await session.reply(
        msg`
${seg.mention(userId)}
微壳: ${balance.shell}
体力: ${balance.stamina}
魅力: ${balance.charm}
炸弹: ${balance.bomb}
        `,
      );
    });

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

export default CurrencyQueryPlugin;
