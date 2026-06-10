import { createColoredLogHandler } from '@fraqjs/color-log';
import { Context } from '@fraqjs/fraq';
import { loadConfig } from './config';

const config = await loadConfig();

const ctx = Context.fromUrl(config.milky.url, {
  accessToken: config.milky.accessToken,
  logHandler: createColoredLogHandler({
    minLevel: 'debug',
  }),
});

ctx.start();
