import { createLogger } from '@zigordev/otel';
import { readConfig } from '../src/config.ts';
import { provisionDatabases } from '../src/database.ts';
import { readApps } from '../src/registry.ts';

const config = readConfig();
const logger = createLogger({ service: 'platform-provision', level: config.LOG_LEVEL });
const results = await provisionDatabases(
  config.PLATFORM_DATABASE_URL,
  await readApps(config.PLATFORM_APPS_DIR)
);
for (const result of results) {
  logger.info({
    event: result.created ? 'platform.database_created' : 'platform.database_present',
    app: result.app,
    database: result.database,
  });
}
