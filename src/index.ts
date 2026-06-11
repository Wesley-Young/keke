import { createColoredLogHandler } from '@fraqjs/color-log';
import { Context, filter } from '@fraqjs/fraq';
import KyselyPlugin from '@fraqjs/plugin-kysely';
import RandomPlugin from '@fraqjs/plugin-random';
import TakumiPlugin from '@fraqjs/plugin-takumi';

import { config } from './config';
import BombPlugin from './plugins/bomb';
import CurrencyPlugin from './plugins/currency';
import DickPlugin from './plugins/dick';
import ExchangePlugin from './plugins/exchange';
import FishingPlugin from './plugins/fishing';
import NickPlugin from './plugins/nick';
import QueryPlugin from './plugins/query';
import SignInPlugin from './plugins/sign-in';
import TransferPlugin from './plugins/transfer';
import UsagePlugin from './plugins/usage';
import WifePlugin from './plugins/wife';

const ctx = Context.fromUrl(config.milky.url, {
  accessToken: config.milky.accessToken,
  logHandler: createColoredLogHandler({
    minLevel: 'debug',
  }),
});

// Official plugins
ctx.install(KyselyPlugin, {
  sqliteUrl: './fraq.db',
});
ctx.install(RandomPlugin);
ctx.install(TakumiPlugin);

const keke = ctx.fork('keke', filter.group(...config.enabledGroups));
const official = keke.fork('official', filter.group(...config.officialGroups));

// Base plugins
keke.install(CurrencyPlugin);
keke.install(NickPlugin);

// Functional plugins
keke.install(DickPlugin);
keke.install(ExchangePlugin);
keke.install(FishingPlugin);
keke.install(QueryPlugin);
keke.install(SignInPlugin);
keke.install(TransferPlugin);
keke.install(UsagePlugin);
keke.install(WifePlugin);

// Functions only for official groups
official.install(BombPlugin);

ctx.start();

process.on('SIGINT', async () => {
  await ctx.stop();
  process.exit(0);
});
