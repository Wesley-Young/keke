import { definePlugin } from '@fraqjs/fraq';

import type { Config } from '../config';

export class ConfigProviderService {
  constructor(private readonly config: Config) {}

  get() {
    return this.config;
  }
}

export const ConfigProviderPlugin = definePlugin({
  name: 'config-provider',
  provides: [ConfigProviderService],
  apply(ctx, config: Config) {
    ctx.provide(ConfigProviderService, new ConfigProviderService(config));
  },
});

export default ConfigProviderPlugin;
