import { createColoredLogHandler } from '@fraqjs/color-log';
import { Context } from '@fraqjs/fraq';
import { loadConfig } from './config';
import { WifePlugin } from './plugins/wife';

const config = await loadConfig();

const ctx = Context.fromUrl(config.milky.url, {
  accessToken: config.milky.accessToken,
  logHandler: createColoredLogHandler({
    minLevel: 'debug',
  }),
});

ctx.install(WifePlugin);

ctx.start();

process.on('SIGINT', async () => {
  await ctx.stop();
  process.exit(0);
});
