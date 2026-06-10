import { createColoredLogHandler } from '@fraqjs/color-log';
import { Context, filter } from '@fraqjs/fraq';
import KyselyPlugin from '@fraqjs/plugin-kysely';
import RandomPlugin from '@fraqjs/plugin-random';

import { config } from './config';
import CurrencyPlugin from './plugins/currency';
import DickPlugin from './plugins/dick';
import ExchangePlugin from './plugins/exchange';
import FishingPlugin from './plugins/fishing';
import NickPlugin from './plugins/nick';
import SignInPlugin from './plugins/sign-in';
import WealthRankingPlugin from './plugins/wealth-ranking';
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

const keke = ctx.fork('keke', filter.group(...config.enabledGroups));

// Base plugins
keke.install(CurrencyPlugin);
keke.install(NickPlugin);

// Functional plugins
keke.install(DickPlugin);
keke.install(ExchangePlugin);
keke.install(FishingPlugin);
keke.install(SignInPlugin);
keke.install(WealthRankingPlugin);
keke.install(WifePlugin);

ctx.start();

process.on('SIGINT', async () => {
  await ctx.stop();
  process.exit(0);
});
