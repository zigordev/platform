import pg from 'pg';
import type { App } from './registry.ts';

export interface ProvisionResult {
  readonly app: string;
  readonly database: string;
  readonly created: boolean;
  readonly connections: number;
}

export const defaultConnections = 25;
export const statementTimeout = '60s';
export const idleInTransactionTimeout = '60s';

type DatabaseApp = Pick<App, 'name' | 'database'> & { readonly connections?: number };

export function databaseName(appName: string): string {
  return appName.replaceAll('-', '_');
}

function identifier(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}

export async function provisionDatabases(
  adminUrl: string,
  apps: readonly DatabaseApp[]
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
      const connections = app.connections ?? defaultConnections;
      await client.query(`ALTER ROLE ${identifier(name)} CONNECTION LIMIT ${connections}`);
      await client.query(
        `ALTER ROLE ${identifier(name)} SET statement_timeout = '${statementTimeout}'`
      );
      await client.query(
        `ALTER ROLE ${identifier(name)} SET idle_in_transaction_session_timeout = '${idleInTransactionTimeout}'`
      );
      results.push({ app: app.name, database: name, created, connections });
    }
    return results;
  } finally {
    await client.end();
  }
}
