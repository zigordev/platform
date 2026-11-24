import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { dockerGcx, gcxImage, run } from './push.ts';

const image = gcxImage(
  readFileSync(new URL('../../stack/compose.local.yaml', import.meta.url), 'utf8')
);

process.exitCode = run(
  process.argv.slice(2),
  process.env,
  {
    out: process.stdout.write.bind(process.stdout),
    err: process.stderr.write.bind(process.stderr),
  },
  (folder) => dockerGcx(image, resolve(folder))
);
