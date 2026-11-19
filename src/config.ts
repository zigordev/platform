import { loadConfig } from '@zigordev/config';
import * as z from 'zod';

const configSchema = z.object({
  PLATFORM_DATABASE_URL: z.url().default('postgresql://postgres@127.0.0.1:5432/postgres'),
  PLATFORM_APPS_DIR: z.string().min(1).default('apps'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export type Config = z.output<typeof configSchema>;

export function readConfig(env?: Record<string, string | undefined>): Config {
  return env === undefined ? loadConfig(configSchema) : loadConfig(configSchema, { env });
}
