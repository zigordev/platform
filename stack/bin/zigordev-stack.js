#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const source = new URL('../src/cli.ts', import.meta.url);
const entry = existsSync(fileURLToPath(source))
  ? source
  : new URL('../dist/cli.js', import.meta.url);
const { main } = await import(entry.href);

process.exitCode = main(process.argv.slice(2), {
  folder: fileURLToPath(new URL('../', import.meta.url)),
  interact: (command, args, cwd) => spawnSync(command, args, { cwd, stdio: 'inherit' }).status ?? 1,
  has: (path) => existsSync(path),
  write: (text) => {
    process.stdout.write(text);
  },
});
