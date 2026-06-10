import { createColoredLogHandler } from '@fraqjs/color-log';
import { Context, filter } from '@fraqjs/fraq';
import KyselyPlugin from '@fraqjs/plugin-kysely';

import { loadConfig } from './config';
import CurrencyPlugin from './plugins/currency';
import FishingPlugin from './plugins/fishing';
import SignInPlugin from './plugins/sign-in';
import WifePlugin from './plugins/wife';

const config = await loadConfig();

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

const keke = ctx.fork('keke', filter.group(...config.enabledGroups));

// Base plugins
keke.install(CurrencyPlugin);

// Functional plugins
keke.install(FishingPlugin);
keke.install(SignInPlugin);
keke.install(WifePlugin);

ctx.start();

process.on('SIGINT', async () => {
  await ctx.stop();
  process.exit(0);
});
