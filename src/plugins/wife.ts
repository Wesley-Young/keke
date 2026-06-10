import { definePlugin, type milky, msg, seg } from '@fraqjs/fraq';

function formatShanghaiDate(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function stableIndex(seed: string, length: number, delta: number): number {
  return (fnv1a32(seed) + delta) % length;
}

function fnv1a32(input: string): number {
  let hash = 0x811c9dc5;

  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }

  return hash >>> 0;
}

function displayName(member: milky.GroupMemberEntity): string {
  return member.card || member.nickname || String(member.user_id);
}

function avatarUrl(userId: number): string {
  return `http://q2.qlogo.cn/headimg_dl?dst_uin=${userId}&spec=5`;
}

export interface WifePluginOptions {
  delta?: number;
}

export const WifePlugin = definePlugin({
  name: 'wife',
  apply(ctx, options?: WifePluginOptions) {
    ctx.router.command('今日老婆').execute(async (session) => {
      const message = session.raw;

      if (message.message_scene !== 'group') {
        await session.reply(msg`这个功能只能在群里使用`);
        return;
      }

      const groupId = message.peer_id;
      const userId = message.sender_id;
      const today = formatShanghaiDate(new Date(message.time * 1000));
      const { members } = await ctx.client.get_group_member_list({
        group_id: groupId,
        no_cache: false,
      });

      const seed = `${today}:${groupId}:${userId}`;
      const wife =
        members[stableIndex(seed, members.length, options?.delta ?? 0)];
      const wifeName = displayName(wife);

      await session.reply(msg`
${seg.mention(userId)}
你今天的群友老婆是:
${seg.image(avatarUrl(wife.user_id))}
${wifeName}(${wife.user_id})
      `);
    });
  },
});
