import { inmsg, inseg } from '@fraqjs/mock';
import { RandomService } from '@fraqjs/plugin-random';

import BombPlugin, {
  BombRateLimitError,
  BombService,
  pickTier,
  rollBombBackfire,
  rollBombSuccess,
} from '../src/plugins/bomb';
import { CurrencyService } from '../src/plugins/currency';
import {
  createTestContext,
  flush,
  lastText,
  setBalance,
  startTestContext,
} from './helpers';

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

describe('bomb rules', () => {
  test('pickTier returns expected boundary tiers', () => {
    assert.equal(pickTier(249_999).kind, 'poor');
    assert.equal(pickTier(250_000).kind, 'middle');
    assert.equal(pickTier(999_999).kind, 'middle');
    assert.equal(pickTier(1_000_000).kind, 'rich');
    assert.equal(pickTier(2_500_000).kind, 'wealthy');
    assert.equal(pickTier(5_000_000).kind, 'ultra_wealthy');
    assert.equal(pickTier(10_000_000).kind, 'super_wealthy');
  });

  test('success and backfire rolls cap losses at balances', () => {
    const random = new RandomService({ seed: 1 });
    const tier = pickTier(100_000);
    const success = rollBombSuccess(
      random,
      tier,
      { shell: 1_000, stamina: 1, charm: 2, bomb: 1 },
      { shell: 50_000, stamina: 3, charm: 4, bomb: 0 },
    );
    assert.ok(success.shellStolen <= 10_000);
    assert.ok(success.actorStaminaLoss <= 1);
    assert.ok(success.actorCharmLoss <= 2);
    assert.ok(success.targetStaminaLoss <= 3);
    assert.ok(success.targetCharmLoss <= 4);

    const backfire = rollBombBackfire(random, tier, {
      shell: 5,
      stamina: 6,
      charm: 7,
      bomb: 1,
    });
    assert.ok(backfire.shellLoss <= 5);
    assert.ok(backfire.actorStaminaLoss <= 6);
    assert.ok(backfire.actorCharmLoss <= 7);
    assert.ok(backfire.muteSeconds > 0);
  });
});

describe('BombService', () => {
  test('rejects self attack and missing bomb', async () => {
    const { ctx } = await createTestContext();
    ctx.install(BombPlugin);
    await ctx.start();

    try {
      const bomb = ctx.resolve(BombService);
      await assert.rejects(() => bomb.attack(10001, 10001), /不能炸自己/);
      await assert.rejects(() => bomb.attack(10001, 10002), /炸弹不足/);
    } finally {
      await ctx.stop();
    }
  });

  test('successful attack spends bomb and enters cooldown', async () => {
    const { ctx } = await createTestContext();
    ctx.install(BombPlugin);
    await ctx.start();

    try {
      await setBalance(ctx, 10001, {
        shell: 100_000,
        stamina: 1_000,
        charm: 1_000,
        bomb: 1,
      });
      await setBalance(ctx, 10002, {
        shell: 100_000,
        stamina: 1_000,
        charm: 1_000,
      });

      const result = await ctx.resolve(BombService).attack(10001, 10002);
      assert.match(result.outcome, /success|backfire/);
      assert.equal((await ctx.resolve(CurrencyService).get(10001)).bomb, 0);
      await assert.rejects(
        () => ctx.resolve(BombService).attack(10001, 10002),
        BombRateLimitError,
      );
    } finally {
      await ctx.stop();
    }
  });
});

describe('BombPlugin', () => {
  test('reports invalid and unaffordable bomb purchases', async () => {
    const { client, ctx } = await startTestContext((ctx) =>
      ctx.install(BombPlugin),
    );

    try {
      await client.receiveGroup(
        { groupId: 20001, userId: 10001 },
        inmsg`购买炸弹 0`,
      );
      await flush();
      assert.match(lastText(client), /购买数量必须是正整数/);

      await client.receiveGroup(
        { groupId: 20001, userId: 10001 },
        inmsg`购买炸弹 1`,
      );
      await flush();
      assert.match(lastText(client), /微壳不足/);
    } finally {
      await ctx.stop();
    }
  });

  test('reports missing bomb on attack command', async () => {
    const { client, ctx } = await startTestContext((ctx) =>
      ctx.install(BombPlugin),
    );

    try {
      await client.receiveGroup(
        { groupId: 20001, userId: 10001 },
        inmsg`炸 ${inseg.mention(10002)}`,
      );
      await flush();
      assert.match(lastText(client), /炸弹不足/);
    } finally {
      await ctx.stop();
    }
  });
});
