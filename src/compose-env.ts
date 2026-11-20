import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const composeEnvFile = '.env';

export class ComposeEnvError extends Error {
  override readonly name = 'ComposeEnvError';
}

export function composeEnv(variables: Readonly<Record<string, string>>): string {
  return Object.entries(variables)
    .map(([name, value]) => {
      if (value.includes("'") || value.includes('\n')) {
        throw new ComposeEnvError(
          `${name} holds a quote or a line break, which compose cannot read`
        );
      }
      return `${name}='${value}'\n`;
    })
    .join('');
}

export async function fileSha256(file: string): Promise<string> {
  return createHash('sha256')
    .update(await readFile(file))
    .digest('hex');
}

export async function writeComposeEnv(
  localDir: string,
  variables: Readonly<Record<string, string>>
): Promise<void> {
  await writeFile(join(localDir, composeEnvFile), composeEnv(variables));
}
