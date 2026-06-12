import { inmsg } from '@fraqjs/mock';

import DickPlugin, {
  assertDuelState,
  DickRateLimitError,
  DickService,
  formatLength,
  normalizePurchaseAmount,
} from '../src/plugins/dick';
import {
  createTestContext,
  flush,
  lastText,
  setBalance,
  startTestContext,
} from './helpers';

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

describe('dick rules', () => {
  test('formatLength formats signed centimeter values', () => {
    assert.equal(formatLength(0), '0.00cm');
    assert.equal(formatLength(1234), '12.34cm');
    assert.equal(formatLength(-5), '-0.05cm');
  });

  test('normalizePurchaseAmount accepts only positive safe amounts', () => {
    assert.equal(normalizePurchaseAmount(1), 1);
    assert.equal(normalizePurchaseAmount(0), undefined);
    assert.equal(normalizePurchaseAmount(-1), undefined);
    assert.equal(normalizePurchaseAmount(Number.MAX_SAFE_INTEGER), undefined);
  });

  test('assertDuelState enforces mode sign requirements', () => {
    assert.doesNotThrow(() =>
      assertDuelState(
        { userId: 1, length: -1 },
        { userId: 2, length: 1 },
        'seduce',
      ),
    );
    assert.doesNotThrow(() =>
      assertDuelState(
        { userId: 1, length: 1 },
        { userId: 2, length: 1 },
        'fence',
      ),
    );
    assert.doesNotThrow(() =>
      assertDuelState(
        { userId: 1, length: 1 },
        { userId: 2, length: -1 },
        'top',
      ),
    );
    assert.doesNotThrow(() =>
      assertDuelState(
        { userId: 1, length: -1 },
        { userId: 2, length: -1 },
        'grind',
      ),
    );
    assert.throws(
      () =>
        assertDuelState(
          { userId: 1, length: 1 },
          { userId: 2, length: -1 },
          'fence',
        ),
      /需要双方都为正/,
    );
  });
});

describe('DickService', () => {
  test('requires registration for actions', async () => {
    const { ctx } = await createTestContext();
    ctx.install(DickPlugin);
    await ctx.start();

    try {
      const dick = ctx.resolve(DickService);
      await assert.rejects(() => dick.masturbate(10001), /还没有注册牛牛/);
      await assert.rejects(() => dick.tuck(10001), /还没有注册牛牛/);
      await assert.rejects(
        () => dick.duel(10001, 10002, 'fence'),
        /还没有注册牛牛/,
      );
    } finally {
      await ctx.stop();
    }
  });

  test('purchaseLength updates length and consumes shell', async () => {
    const { ctx } = await createTestContext();
    ctx.install(DickPlugin);
    await ctx.start();

    try {
      const dick = ctx.resolve(DickService);
      await dick.register(10001);
      const before = await dick.get(10001);
      assert.ok(before);
      await setBalance(ctx, 10001, { shell: 10_000 });

      const result = await dick.purchaseLength(10001, 1, 1);
      assert.equal(result.ok, true);
      assert.equal(result.profile?.length, before.length + 1);
      assert.equal(result.shell, 7_000);
    } finally {
      await ctx.stop();
    }
  });

  test('rate limits repeated single actions', async () => {
    const { ctx } = await createTestContext();
    ctx.install(DickPlugin);
    await ctx.start();

    try {
      const dick = ctx.resolve(DickService);
      await dick.register(10001);
      await setBalance(ctx, 10001, { stamina: 1_000 });
      await dick.masturbate(10001);
      await assert.rejects(() => dick.masturbate(10001), DickRateLimitError);
    } finally {
      await ctx.stop();
    }
  });
});

describe('DickPlugin', () => {
  test('reports unregistered profile and then registered profile', async () => {
    const { client, ctx } = await startTestContext((ctx) =>
      ctx.install(DickPlugin),
    );

    try {
      await client.receiveGroup(
        { groupId: 20001, userId: 10001 },
        inmsg`我的牛牛`,
      );
      await flush();
      assert.match(lastText(client), /你还没注册，请先发送【注册牛牛】/);

      await client.receiveGroup(
        { groupId: 20001, userId: 10001 },
        inmsg`注册牛牛`,
      );
      await flush();
      await client.receiveGroup(
        { groupId: 20001, userId: 10001 },
        inmsg`我的牛牛`,
      );
      await flush();
      assert.match(lastText(client), /你的牛牛长度为：/);
    } finally {
      await ctx.stop();
    }
  });

  test('reports invalid purchase amount', async () => {
    const { client, ctx } = await startTestContext((ctx) =>
      ctx.install(DickPlugin),
    );

    try {
      await client.receiveGroup(
        { groupId: 20001, userId: 10001 },
        inmsg`购买长度 0`,
      );
      await flush();
      assert.match(lastText(client), /购买长度数量必须是正整数/);
    } finally {
      await ctx.stop();
    }
  });
});
