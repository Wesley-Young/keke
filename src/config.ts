import z from 'zod';

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

export const Config = z.object({
  enabledGroups: z.array(z.number()),
  milky: z.object({
    url: z.url(),
    accessToken: z.string().optional(),
  }),
});

export type Config = z.infer<typeof Config>;

export async function loadConfig(): Promise<Config> {
  if (!existsSync('config.json')) {
    throw new Error('config.json not found');
  }
  const configString = await readFile('config.json', 'utf-8');
  return Config.parse(JSON.parse(configString));
}
