import pg from 'pg';
import type { App } from './registry.ts';

export interface ProvisionResult {
  readonly app: string;
  readonly database: string;
  readonly created: boolean;
}

export function databaseName(appName: string): string {
  return appName.replaceAll('-', '_');
}

function identifier(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}

export async function provisionDatabases(
  adminUrl: string,
  apps: readonly Pick<App, 'name' | 'database'>[]
): Promise<ProvisionResult[]> {
  const client = new pg.Client({ connectionString: adminUrl });
  await client.connect();
  try {
    const results: ProvisionResult[] = [];
    for (const app of apps.filter((candidate) => candidate.database)) {
      const name = databaseName(app.name);
      const role = await client.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [name]);
      if (role.rowCount === 0) {
        await client.query(`CREATE ROLE ${identifier(name)} LOGIN`);
      }
      const database = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
      const created = database.rowCount === 0;
      if (created) {
        await client.query(`CREATE DATABASE ${identifier(name)} OWNER ${identifier(name)}`);
      }
      await client.query(`REVOKE ALL ON DATABASE ${identifier(name)} FROM PUBLIC`);
      results.push({ app: app.name, database: name, created });
    }
    return results;
  } finally {
    await client.end();
  }
}
