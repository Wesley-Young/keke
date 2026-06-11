import z from 'zod';

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

export const Config = z.object({
  enabledGroups: z.array(z.number()),
  officialGroups: z.array(z.number()),
});

export type Config = z.infer<typeof Config>;

export const RootConfig = z.object({
  milky: z.object({
    url: z.url(),
    accessToken: z.string().optional(),
  }),
  instances: z.record(z.string(), Config),
});

export type RootConfig = z.infer<typeof RootConfig>;

export async function loadRootConfig(): Promise<RootConfig> {
  if (!existsSync('config.json')) {
    throw new Error('config.json not found');
  }
  const rootConfigString = await readFile('config.json', 'utf-8');
  const rootConfig = RootConfig.parse(JSON.parse(rootConfigString));
  // verify that enabledGroups contains all officialGroups
  for (const [instanceName, config] of Object.entries(rootConfig.instances)) {
    for (const groupId of config.officialGroups) {
      if (!config.enabledGroups.includes(groupId)) {
        throw new Error(
          `Instance "${instanceName}": officialGroups contains group ${groupId} which is not in enabledGroups`,
        );
      }
    }
  }
  return rootConfig;
}

export const rootConfig = await loadRootConfig();
