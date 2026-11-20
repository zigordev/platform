import { createLogger } from '@zigordev/otel';
import { readConfig } from '../src/config.ts';
import { provisionDatabases } from '../src/database.ts';
import { provisionFlags } from '../src/flags.ts';
import { provisionProducers } from '../src/producers.ts';
import { appsFor, readApps } from '../src/registry.ts';

const config = readConfig();
const logger = createLogger({ service: 'platform-provision', level: config.LOG_LEVEL });
const apps = appsFor('local', await readApps(config.PLATFORM_APPS_DIR));
const results = await provisionDatabases(config.PLATFORM_DATABASE_URL, apps);
for (const result of results) {
  logger.info({
    event: result.created ? 'platform.database_created' : 'platform.database_present',
    app: result.app,
    database: result.database,
  });
}
const producers = await provisionProducers(config.PLATFORM_LOCAL_DIR);
logger.info({
  event: producers.created ? 'platform.producer_created' : 'platform.producers_present',
  producers: producers.names,
});
const flags = await provisionFlags(config.PLATFORM_APPS_DIR, config.PLATFORM_LOCAL_DIR, apps);
logger.info({ event: 'platform.flags_served', apps: flags.apps });
for (const expired of flags.expired) {
  logger.warn({
    event: 'platform.flag_expired',
    app: expired.app,
    flag: expired.flag,
    removeBy: expired.removeBy,
  });
}
