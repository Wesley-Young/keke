import { Context } from '@fraqjs/fraq';
import { createMockMilkyClient, createRandomGroupMember } from '@fraqjs/mock';
import KyselyPlugin, { DatabaseService } from '@fraqjs/plugin-kysely';
import RandomPlugin from '@fraqjs/plugin-random';
import TakumiPlugin from '@fraqjs/plugin-takumi';

import ConfigProviderPlugin from '../src/plugins/config-provider';
import CurrencyPlugin, { CurrencyService } from '../src/plugins/currency';
import NickPlugin from '../src/plugins/nick';

export async function createTestContext(options?: {
  officialGroups?: number[];
  enabledGroups?: number[];
}) {
  const client = createMockMilkyClient();
  client.stubApi('get_group_member_list', (params) => ({
    members: [createRandomGroupMember(params.group_id, 10001)],
  }));
  const ctx = Context.fromClient(client);

  ctx.install(RandomPlugin, { seed: 1 });
  ctx.install(TakumiPlugin);
  ctx.install(KyselyPlugin, {
    sqliteUrl: ':memory:',
  });
  ctx.install(ConfigProviderPlugin, {
    enabledGroups: options?.enabledGroups ?? [20001],
    officialGroups: options?.officialGroups ?? [20001],
  });
  ctx.install(CurrencyPlugin);
  ctx.install(NickPlugin);

  return { client, ctx };
}

export async function startTestContext(
  setup: (ctx: Context) => void | Promise<void>,
  options?: {
    officialGroups?: number[];
    enabledGroups?: number[];
  },
) {
  const testContext = await createTestContext(options);
  await setup(testContext.ctx);
  await testContext.ctx.start();
  return testContext;
}

export async function setBalance(
  ctx: Context,
  userId: number,
  balance: {
    shell?: number;
    stamina?: number;
    charm?: number;
    bomb?: number;
  },
) {
  await ctx.resolve(CurrencyService).set(userId, balance);
}

export function getDb(ctx: Context) {
  return ctx.resolve(DatabaseService).kysely;
}

export function lastApiCall(client: { apiCalls: unknown[] }) {
  return client.apiCalls.at(-1);
}

export function lastText(client: { apiCalls: { params?: unknown }[] }) {
  const call = client.apiCalls.findLast((call) => {
    const params = call.params as { message?: unknown };
    return Array.isArray(params.message);
  });
  const params = call?.params as {
    message?: { type: string; text?: string }[];
  };
  return (
    params?.message
      ?.filter((segment) => segment.type === 'text')
      .map(
        (segment) =>
          segment.text ??
          (segment as { data?: { text?: string } }).data?.text ??
          '',
      )
      .join('') ?? ''
  );
}

export function sentMessageCount(client: { apiCalls: { endpoint: string }[] }) {
  return client.apiCalls.filter((call) => call.endpoint.startsWith('send_'))
    .length;
}

export async function flush() {
  await new Promise((resolve) => setTimeout(resolve, 20));
}
