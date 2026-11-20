import { loadConfig } from '@zigordev/config';
import * as z from 'zod';

const configSchema = z.object({
  PLATFORM_DATABASE_URL: z.url().default('postgresql://postgres@127.0.0.1:5432/postgres'),
  PLATFORM_APPS_DIR: z.string().min(1).default('apps'),
  PLATFORM_LOCAL_DIR: z.string().min(1).default('local'),
  PLATFORM_ALLOY_CONFIG: z.string().min(1).default('stack/alloy/config.alloy'),
  PLATFORM_GRAFANA_URL: z.url().default('http://127.0.0.1:3300'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export type Config = z.output<typeof configSchema>;

export function readConfig(env?: Record<string, string | undefined>): Config {
  return env === undefined ? loadConfig(configSchema) : loadConfig(configSchema, { env });
}
