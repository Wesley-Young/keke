import { type Context, definePlugin } from '@fraqjs/fraq';

import { config } from '../config';

export class NickService {
  private readonly nickCache = new Map<`${number}:${number}`, string>();

  constructor(private readonly ctx: Context) {
    ctx.on('message_receive', ({ data: message }) => {
      if (message.message_scene !== 'group') {
        return;
      }
      if (!config.enabledGroups.includes(message.peer_id)) {
        return;
      }
      const key = `${message.peer_id}:${message.sender_id}` as const;
      const displayName =
        message.group_member.card || message.group_member.nickname;
      if (displayName) {
        this.nickCache.set(key, displayName);
      }
    });

    // 10 min 主动刷新一次昵称缓存
    ctx.interval(600_000, async () => {
      await this.refreshGroups();
    });
    this.refreshGroups().catch((err) => {
      ctx.logger.error('Failed to refresh group members', err);
    });
  }

  resolve(groupId: number, userId: number): string | undefined {
    return this.nickCache.get(`${groupId}:${userId}`);
  }

  private async refreshGroups() {
    for (const groupId of config.enabledGroups) {
      const { members } = await this.ctx.client.get_group_member_list({
        group_id: groupId,
        no_cache: true,
      });
      for (const member of members) {
        const key = `${groupId}:${member.user_id}` as const;
        const displayName = member.card || member.nickname;
        if (displayName) {
          this.nickCache.set(key, displayName);
        }
      }
    }
  }
}

export const NickPlugin = definePlugin({
  name: 'nick',
  provides: [NickService],
  apply(ctx) {
    ctx.provide(NickService, new NickService(ctx));
  },
});

export default NickPlugin;
