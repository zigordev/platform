import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { load } from 'js-yaml';
import * as z from 'zod';

export const appSchema = z.strictObject({
  name: z.string().regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)+$/, 'must be <repo>-<app> in kebab-case'),
  database: z.boolean().default(false),
  connections: z.int().min(1).max(100).default(25),
  local: z.boolean().default(false),
});

export type App = z.output<typeof appSchema>;

export type Environment = 'local' | 'production';

export class RegistryError extends Error {
  override readonly name = 'RegistryError';
}

async function readText(file: string): Promise<string> {
  try {
    return await readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new RegistryError(`${file} is missing`);
    }
    throw error;
  }
}

async function folders(appsDir: string): Promise<string[]> {
  try {
    const entries = await readdir(appsDir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

export function appsFor<T extends Pick<App, 'local'>>(
  environment: Environment,
  apps: readonly T[]
): T[] {
  return environment === 'local' ? [...apps] : apps.filter((app) => !app.local);
}

export async function readApps(appsDir: string): Promise<App[]> {
  const apps: App[] = [];
  for (const folder of await folders(appsDir)) {
    const file = join(appsDir, folder, 'app.yaml');
    const parsed = appSchema.safeParse(load(await readText(file)));
    if (!parsed.success) {
      throw new RegistryError(`${file} is invalid: ${z.prettifyError(parsed.error)}`);
    }
    if (parsed.data.name !== folder) {
      throw new RegistryError(`${file} names ${parsed.data.name}, but its folder is ${folder}`);
    }
    apps.push(parsed.data);
  }
  return apps;
}
