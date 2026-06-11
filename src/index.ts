import { createColoredLogHandler } from '@fraqjs/color-log';
import { Context, filter } from '@fraqjs/fraq';
import KyselyPlugin from '@fraqjs/plugin-kysely';
import RandomPlugin from '@fraqjs/plugin-random';
import TakumiPlugin from '@fraqjs/plugin-takumi';

import { type Config, rootConfig } from './config';
import BombPlugin from './plugins/bomb';
import ConfigProviderPlugin from './plugins/config-provider';
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

const ctx = Context.fromUrl(rootConfig.milky.url, {
  accessToken: rootConfig.milky.accessToken,
  logHandler: createColoredLogHandler({
    minLevel: 'debug',
  }),
});

// Official plugins
ctx.install(RandomPlugin);
ctx.install(TakumiPlugin);

function openKekeInstance(name: string, config: Config) {
  const keke = ctx.fork(name, filter.group(...config.enabledGroups));
  const official = keke.fork(
    `${name}-official`,
    filter.group(...config.officialGroups),
  );

  // Base plugins
  keke.install(KyselyPlugin, {
    sqliteUrl: `./${name}.db`,
  });
  keke.install(ConfigProviderPlugin, config);
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
}

for (const [instanceName, config] of Object.entries(rootConfig.instances)) {
  openKekeInstance(instanceName, config);
}

ctx.start();

process.on('SIGINT', async () => {
  await ctx.stop();
  process.exit(0);
});
