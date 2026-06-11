import { definePlugin, msg, param, seg } from '@fraqjs/fraq';
import { TakumiService } from '@fraqjs/plugin-takumi';

import BombUsageCard from '../templates/usage/BombUsageCard';
import DickUsageCard from '../templates/usage/DickUsageCard';
import FishingUsageCard from '../templates/usage/FishingUsageCard';

const usage = {
  炸弹: BombUsageCard(),
  牛牛: DickUsageCard(),
  钓鱼: FishingUsageCard(),
};

export const UsagePlugin = definePlugin({
  name: 'usage',
  inject: {
    takumi: TakumiService,
  },
  apply(ctx) {
    ctx.router
      .command('玩法')
      .arg('game', param.union('炸弹', '牛牛', '钓鱼'))
      .execute(async (session, { game }) => {
        const image = await ctx.takumi.renderJsx(usage[game], {
          devicePixelRatio: 2,
        });
        await session.reply(
          msg`${seg.image(`base64://${image.toString('base64')}`)}`,
        );
      });
  },
});

export default UsagePlugin;
