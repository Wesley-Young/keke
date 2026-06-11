import { type Context, type Disposable, definePlugin, msg } from '@fraqjs/fraq';

import type { Config } from '../config';
import { ConfigProviderService } from './config-provider';

export class LifecycleNoticeService implements Disposable {
  constructor(
    private readonly ctx: Context,
    private readonly config: Config,
  ) {}

  async noticeStart(): Promise<void> {
    for (const group of this.config.enabledGroups) {
      await this.ctx.client.send_group_message({
        group_id: group,
        message: msg`壳壳机器人已开启！`,
      });
    }
  }

  async dispose(): Promise<void> {
    for (const group of this.config.enabledGroups) {
      await this.ctx.client.send_group_message({
        group_id: group,
        message: msg`壳壳机器人正在关闭维护，请稍候……`,
      });
    }
  }
}

export const LifecycleNoticePlugin = definePlugin({
  name: 'lifecycle-notice',
  provides: [LifecycleNoticeService],
  inject: {
    config: ConfigProviderService,
  },
  apply(ctx) {
    ctx.provide(
      LifecycleNoticeService,
      new LifecycleNoticeService(ctx, ctx.config.get()),
    );
  },
  async start(ctx) {
    await ctx.resolve(LifecycleNoticeService).noticeStart();
  },
});

export default LifecycleNoticePlugin;
