import { definePlugin, msg, param, type Session, seg } from '@fraqjs/fraq';
import { DatabaseService } from '@fraqjs/plugin-kysely';
import { RandomService } from '@fraqjs/plugin-random';

import { formatDurationMs, formatDurationSeconds } from '../../util/rules';
import { ConfigProviderService } from '../config-provider';
import { CurrencyService, formatCurrencyChange } from '../currency';
import {
  formatFishPond,
  formatInventory,
  formatSellCurrencyChanges,
  formatSellEvents,
  formatThiefEvent,
} from './messages';
import {
  FISHING_INVENTORY_TABLE,
  FISHING_THIEF_WARNING_TABLE,
} from './repository';
import { parseSellFishText, ROD_PRICE, YARN_REWARD } from './rules';
import { FishingService } from './service';
import { AlreadyFishingError, FishingBombRateLimitError } from './types';

export const FishingPlugin = definePlugin({
  name: 'fishing',
  provides: [FishingService],
  inject: {
    config: ConfigProviderService,
    db: DatabaseService,
    currency: CurrencyService,
    random: RandomService,
  },
  apply(ctx) {
    const fishing = new FishingService(ctx.db, ctx.currency, ctx.random);
    const config = ctx.config.get();
    const replyError = async (
      session: Session,
      error: unknown,
      fallback: string,
    ) => {
      const message = session.raw;
      await session.reply(msg`
${seg.mention(message.sender_id)}
${error instanceof Error ? error.message : fallback}
      `);
    };

    ctx.provide(FishingService, fishing);

    ctx.db.schemas.register({
      name: 'fishing',
      migrations: {
        '001_init_fishing_inventory_table': {
          async up(db) {
            await db.schema
              .createTable(FISHING_INVENTORY_TABLE)
              .ifNotExists()
              .addColumn('user_id', 'integer', (column) => column.notNull())
              .addColumn('rod', 'integer', (column) =>
                column.notNull().defaultTo(0),
              )
              .addColumn('shoe', 'integer', (column) =>
                column.notNull().defaultTo(0),
              )
              .addColumn('underwear', 'integer', (column) =>
                column.notNull().defaultTo(0),
              )
              .addColumn('seashell', 'integer', (column) =>
                column.notNull().defaultTo(0),
              )
              .addColumn('frog', 'integer', (column) =>
                column.notNull().defaultTo(0),
              )
              .addColumn('yellowFish', 'integer', (column) =>
                column.notNull().defaultTo(0),
              )
              .addColumn('octopus', 'integer', (column) =>
                column.notNull().defaultTo(0),
              )
              .addColumn('whale', 'integer', (column) =>
                column.notNull().defaultTo(0),
              )
              .addColumn('electricEel', 'integer', (column) =>
                column.notNull().defaultTo(0),
              )
              .addColumn('diamondRing', 'integer', (column) =>
                column.notNull().defaultTo(0),
              )
              .addColumn('crown', 'integer', (column) =>
                column.notNull().defaultTo(0),
              )
              .addPrimaryKeyConstraint('fishing_inventory_pk', ['user_id'])
              .execute();
          },
        },
        '002_init_fishing_thief_warning_table': {
          async up(db) {
            await db.schema
              .createTable(FISHING_THIEF_WARNING_TABLE)
              .ifNotExists()
              .addColumn('user_id', 'integer', (column) => column.notNull())
              .addColumn('warned', 'integer', (column) =>
                column.notNull().defaultTo(0),
              )
              .addColumn('warned_at', 'integer')
              .addColumn('warned_weight', 'integer', (column) =>
                column.notNull().defaultTo(0),
              )
              .addColumn('last_weight', 'integer', (column) =>
                column.notNull().defaultTo(0),
              )
              .addColumn('last_stolen_at', 'integer')
              .addColumn('stolen_count', 'integer', (column) =>
                column.notNull().defaultTo(0),
              )
              .addColumn('stolen_weight', 'integer', (column) =>
                column.notNull().defaultTo(0),
              )
              .addPrimaryKeyConstraint('fishing_thief_warning_pk', ['user_id'])
              .execute();
          },
        },
      },
    });

    ctx.router.command('购买鱼竿').execute(async (session) => {
      const message = session.raw;

      try {
        const result = await fishing.buyRod(message.sender_id);

        await session.reply(msg`
${seg.mention(message.sender_id)}
购买成功
当前鱼竿：${result.inventory.rod}个
${formatCurrencyChange('微壳', result.balance.shell, -ROD_PRICE)}
      `);
      } catch (error) {
        await replyError(session, error, '购买鱼竿失败');
      }
    });

    ctx.router.command('钓鱼').execute(async (session) => {
      const message = session.raw;

      try {
        const result = await fishing.fish(message.sender_id, async () => {
          await ctx.client.send_group_message_reaction({
            group_id: message.peer_id,
            message_seq: message.message_seq,
            reaction: '424',
          });
        });

        if (result.outcome === 'empty') {
          await session.reply(msg`
${seg.mention(message.sender_id)}
毛线都没钓到
${formatCurrencyChange('微壳', result.balance.shell, result.shellDelta)}
${formatCurrencyChange('体力', result.balance.stamina, -result.staminaCost)}
        `);
          return;
        }

        if (result.outcome === 'yarn') {
          await session.reply(msg`
${seg.mention(message.sender_id)}
钓到了🧶毛线！自动转化为${YARN_REWARD}微壳
${formatCurrencyChange('微壳', result.balance.shell, result.shellDelta)}
${formatCurrencyChange('体力', result.balance.stamina, -result.staminaCost)}
        `);
          return;
        }

        if (result.outcome === 'interrupted') {
          await session.reply(msg`
${seg.mention(message.sender_id)}
有人炸鱼，你什么都没钓到就被迫收竿了
${formatCurrencyChange('微壳', result.balance.shell, result.shellDelta)}
${formatCurrencyChange('体力', result.balance.stamina, -result.staminaCost)}
        `);
          return;
        }

        await session.reply(msg`
${seg.mention(message.sender_id)}
${result.catchResult.text}
当前鱼竿：${result.inventory.rod}
${formatCurrencyChange('微壳', result.balance.shell, result.shellDelta)}
${formatCurrencyChange('体力', result.balance.stamina, -result.staminaCost)}
      `);

        const thiefText = formatThiefEvent(result.thiefEvent);
        if (thiefText) {
          await session.reply(msg`
${seg.mention(message.sender_id)}
${thiefText}
            `);
        }
      } catch (error) {
        if (error instanceof AlreadyFishingError) {
          return;
        }

        await replyError(session, error, '钓鱼失败');
      }
    });

    ctx.router.command('炸鱼').execute(async (session) => {
      const message = session.raw;

      if (
        message.message_scene !== 'group' ||
        !config.officialGroups.includes(message.peer_id)
      ) {
        return;
      }

      try {
        const result = await fishing.bombFish(message.sender_id);

        await ctx.client.set_group_member_mute({
          group_id: message.peer_id,
          user_id: message.sender_id,
          duration: result.muteSeconds,
        });

        await session.reply(msg`
${seg.mention(message.sender_id)}
炸鱼成功，强制结算了${result.settledCount}个人的钓鱼
抢到了${result.stolenCount}个钓鱼产物，来自${result.stolenUserCount}个人
收获：${result.stolenCount > 0 ? formatInventory(result.stolenInventory) : '无'}
禁言结果：${formatDurationSeconds(result.muteSeconds)}
${formatCurrencyChange('炸弹', result.balance.bomb, -1)}
${formatCurrencyChange('体力', result.balance.stamina, -result.staminaCost)}
${formatCurrencyChange('魅力', result.balance.charm, -result.charmCost)}
        `);
      } catch (error) {
        if (error instanceof FishingBombRateLimitError) {
          await session.reply(msg`
${seg.mention(message.sender_id)}
炸鱼冷却中，剩余${formatDurationMs(error.remainingMs)}
          `);
          return;
        }

        await replyError(session, error, '炸鱼失败');
      }
    });

    ctx.router.command('鱼库').execute(async (session) => {
      const message = session.raw;
      const inventory = await fishing.getInventory(message.sender_id);

      await session.reply(msg`
${seg.mention(message.sender_id)}
你有${inventory.rod}个🎣鱼竿
钓鱼收获：${formatInventory(inventory)}
      `);
    });

    ctx.router.command('卖鱼').execute(async (session) => {
      const message = session.raw;
      const parseResult = parseSellFishText('');

      if (!parseResult.ok) {
        await session.reply(msg`
${seg.mention(message.sender_id)}
${parseResult.reason}
        `);
      }
    });

    ctx.router
      .command('卖鱼')
      .arg('content', param.greedy())
      .execute(async (session, { content }) => {
        const message = session.raw;
        const sellText = content.trim();

        try {
          if (sellText === '全部') {
            const result = await fishing.sellAllFish(message.sender_id);

            await session.reply(msg`
${seg.mention(message.sender_id)}
成功售卖所有收获，共${result.soldCount}个
${result.soldItems}
${formatSellEvents(result.messages)}
${formatSellCurrencyChanges(
  result.balance,
  result.shellReward,
  result.charmReward,
)}
          `);
            return;
          }

          const parseResult = parseSellFishText(sellText);
          if (!parseResult.ok) {
            await session.reply(msg`
${seg.mention(message.sender_id)}
${parseResult.reason}
            `);
            return;
          }

          if (parseResult.requests.length === 1) {
            const [{ item, count }] = parseResult.requests;
            if (count === 1) {
              const result = await fishing.sellFish(message.sender_id, item);

              await session.reply(msg`
${seg.mention(message.sender_id)}
成功售卖了${item.emoji}${item.name}
${formatSellEvents(result.message ? [result.message] : [])}
${formatSellCurrencyChanges(
  result.balance,
  result.shellReward,
  result.charmReward,
)}
        `);
              return;
            }
          }

          const result = await fishing.sellFishBatch(
            message.sender_id,
            parseResult.requests,
          );

          await session.reply(msg`
${seg.mention(message.sender_id)}
成功售卖了${result.soldCount}个收获
${result.soldItems}
${formatSellEvents(result.messages)}
${formatSellCurrencyChanges(
  result.balance,
  result.shellReward,
  result.charmReward,
)}
        `);
        } catch (error) {
          await replyError(session, error, '卖鱼失败');
        }
      });

    ctx.router.command('鱼塘').execute(async (session) => {
      const message = session.raw;
      await session.reply(msg`
${seg.mention(message.sender_id)}
${formatFishPond()}
      `);
    });
  },
});

export * from './messages';
export * from './repository';
export * from './rules';
export { fishingItems } from './rules';
export { FishingService } from './service';
export * from './types';

export default FishingPlugin;
