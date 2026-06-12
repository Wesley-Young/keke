import { inmsg } from '@fraqjs/mock';

import FishingPlugin, {
  AlreadyFishingError,
  adjustInventoryIn,
  calculateInventoryCount,
  calculateInventoryWeight,
  createEmptyInventory,
  FishingService,
  formatFishPond,
  formatInventory,
  parseSellFishText,
} from '../src/plugins/fishing';
import {
  createTestContext,
  flush,
  getDb,
  lastText,
  sentMessageCount,
  setBalance,
  startTestContext,
} from './helpers';

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

describe('fishing rules', () => {
  test('createEmptyInventory returns all zero fields', () => {
    assert.deepEqual(createEmptyInventory(), {
      rod: 0,
      shoe: 0,
      underwear: 0,
      seashell: 0,
      frog: 0,
      yellowFish: 0,
      octopus: 0,
      whale: 0,
      electricEel: 0,
      diamondRing: 0,
      crown: 0,
    });
  });

  test('parseSellFishText parses batches and failures', () => {
    const parsed = parseSellFishText('青蛙1 电鳗2 青蛙3');
    assert.equal(parsed.ok, true);
    assert.deepEqual(
      parsed.ok
        ? parsed.requests.map(({ item, count }) => [item.kind, count])
        : [],
      [
        ['frog', 4],
        ['electricEel', 2],
      ],
    );

    assert.equal(parseSellFishText('').ok, false);
    assert.equal(parseSellFishText('不存在').ok, false);
    assert.equal(parseSellFishText('青蛙0').ok, false);
  });

  test('inventory count, weight, and display remain stable', () => {
    const inventory = createEmptyInventory();
    inventory.frog = 2;
    inventory.crown = 1;
    assert.equal(calculateInventoryCount(inventory), 3);
    assert.equal(calculateInventoryWeight(inventory), 14);
    assert.equal(formatInventory(inventory), '🐸🐸👑');
    assert.match(formatFishPond(), /🐸青蛙/);
  });
});

describe('FishingService', () => {
  test('prevents duplicate active fishing for one user', async () => {
    const { ctx } = await createTestContext();
    ctx.install(FishingPlugin);
    await ctx.start();

    try {
      const fishing = ctx.resolve(FishingService);
      await setBalance(ctx, 10001, {
        shell: 100_000,
        stamina: 100,
        charm: 0,
      });
      await adjustInventoryIn(getDb(ctx), 10001, {
        rod: 1,
      });
      const first = fishing.fish(10001);
      await assert.rejects(() => fishing.fish(10001), AlreadyFishingError);
      fishing.forfeitAllWaitingFish();
      await first;
    } finally {
      await ctx.stop();
    }
  });

  test('sellFishBatch rejects insufficient inventory', async () => {
    const { ctx } = await createTestContext();
    ctx.install(FishingPlugin);
    await ctx.start();

    try {
      const fishing = ctx.resolve(FishingService);
      const parseResult = parseSellFishText('青蛙2');
      assert.equal(parseResult.ok, true);
      await assert.rejects(
        () =>
          fishing.sellFishBatch(
            10001,
            parseResult.ok ? parseResult.requests : [],
          ),
        /青蛙不足/,
      );
    } finally {
      await ctx.stop();
    }
  });
});

describe('FishingPlugin', () => {
  test('reports inventory and buy rod failure', async () => {
    const { client, ctx } = await startTestContext((ctx) =>
      ctx.install(FishingPlugin),
    );

    try {
      await client.receiveGroup({ groupId: 20001, userId: 10001 }, inmsg`鱼库`);
      await flush();
      assert.match(lastText(client), /你有0个🎣鱼竿/);

      await client.receiveGroup(
        { groupId: 20001, userId: 10001 },
        inmsg`购买鱼竿`,
      );
      await flush();
      assert.match(lastText(client), /购买鱼竿需要50000微壳/);
    } finally {
      await ctx.stop();
    }
  });

  test('reports sell parsing failures', async () => {
    const { client, ctx } = await startTestContext((ctx) =>
      ctx.install(FishingPlugin),
    );

    try {
      await client.receiveGroup({ groupId: 20001, userId: 10001 }, inmsg`卖鱼`);
      await flush();
      assert.match(lastText(client), /请告诉我要卖什么/);

      await client.receiveGroup(
        { groupId: 20001, userId: 10001 },
        inmsg`卖鱼 未知物品`,
      );
      await flush();
      assert.match(lastText(client), /没有找到这个种类/);
    } finally {
      await ctx.stop();
    }
  });

  test('ignores non-official bomb fishing and reports no active fishing in official group', async () => {
    const { client, ctx } = await startTestContext(
      (ctx) => ctx.install(FishingPlugin),
      { enabledGroups: [20001, 20002], officialGroups: [20001] },
    );

    try {
      const beforeSendCount = sentMessageCount(client);
      await client.receiveGroup({ groupId: 20002, userId: 10001 }, inmsg`炸鱼`);
      await flush();
      assert.equal(sentMessageCount(client), beforeSendCount);

      await client.receiveGroup({ groupId: 20001, userId: 10001 }, inmsg`炸鱼`);
      await flush();
      assert.match(lastText(client), /现在没有人在钓鱼/);
    } finally {
      await ctx.stop();
    }
  });
});
