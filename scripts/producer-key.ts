import { readConfig } from '../src/config.ts';
import { addProducer, ProducersError } from '../src/producers.ts';

const [name, ...senders] = process.argv.slice(2);
if (name === undefined || senders.length === 0) {
  process.stderr.write('Usage: pnpm local:producer-key <name> <sender> [sender ...]\n');
  process.exit(2);
}
try {
  const producer = await addProducer(readConfig().PLATFORM_LOCAL_DIR, { name, senders });
  process.stdout.write(`${JSON.stringify(producer, null, 2)}\n`);
  process.stderr.write('Run pnpm local:up to give notifications-api the new key.\n');
} catch (error) {
  if (!(error instanceof ProducersError)) {
    throw error;
  }
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}
