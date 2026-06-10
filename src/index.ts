import { createColoredLogHandler } from '@fraqjs/color-log';
import { Context, filter } from '@fraqjs/fraq';
import KyselyPlugin from '@fraqjs/plugin-kysely';
import RandomPlugin from '@fraqjs/plugin-random';

import { config } from './config';
import BombPlugin from './plugins/bomb';
import CurrencyPlugin from './plugins/currency';
import CurrencyQuery from './plugins/currency-query';
import DickPlugin from './plugins/dick';
import ExchangePlugin from './plugins/exchange';
import FishingPlugin from './plugins/fishing';
import NickPlugin from './plugins/nick';
import SignInPlugin from './plugins/sign-in';
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
const official = keke.fork('official', filter.group(...config.officialGroups));

// Base plugins
keke.install(CurrencyPlugin);
keke.install(NickPlugin);

// Functional plugins
keke.install(CurrencyQuery);
keke.install(DickPlugin);
keke.install(ExchangePlugin);
keke.install(FishingPlugin);
keke.install(SignInPlugin);
keke.install(WifePlugin);

// Functions only for official groups
official.install(BombPlugin);

ctx.start();

process.on('SIGINT', async () => {
  await ctx.stop();
  process.exit(0);
});
