import { join } from 'node:path';

export type Interact = (command: string, args: readonly string[], cwd: string) => number;

export interface Io {
  readonly folder: string;
  readonly interact: Interact;
  readonly has: (path: string) => boolean;
  readonly write: (text: string) => void;
}

export const files = ['compose.yaml', 'compose.local.yaml'] as const;
export const resources = 'observability';

const mail = ['--profile', 'notifications'] as const;
const mailServices = ['notifications-api', 'notifications-postgres'] as const;

export const addresses = [
  ['http://grafana.localhost', 'Grafana: the logs, traces and metrics of every app'],
  ['http://mail.localhost', 'Mailpit: every email sent on this laptop'],
  ['http://traefik.localhost', 'Traefik: the routes it knows'],
  ['http://alloy.localhost', 'Alloy: what it receives and where it sends it'],
] as const;

const usage = [
  'Usage: zigordev-stack up [--without notifications]',
  '       zigordev-stack down',
  '       zigordev-stack reset',
  '',
  'up     Starts the shared services and waits until each one is healthy.',
  "       It then sets up Kafka's topics and users, pushes the dashboards",
  '       and the alert rules to the local Grafana, and starts notifications,',
  "       which delivers every app's email to Mailpit.",
  '       When the services are running already, it changes nothing.',
  '       --without notifications stops the shared copy of notifications',
  '       instead, for work on notifications itself.',
  'down   Stops them and keeps their data.',
  'reset  Stops them, deletes their data and starts them again.',
  '',
].join('\n');

function compose(io: Io, ...args: readonly string[]): number {
  return io.interact(
    'docker',
    ['compose', ...files.flatMap((file) => ['--file', file]), ...args],
    io.folder
  );
}

function up(io: Io, withMail: boolean): number {
  if (!io.has(join(io.folder, resources, 'folder.json'))) {
    io.write(
      `zigordev-stack: the dashboard files are missing from ${join(io.folder, resources)}. In the platform repo, \`pnpm build\` writes them\n`
    );
    return 1;
  }
  const started = compose(io, 'up', '--detach', '--wait', '--wait-timeout', '300');
  if (started !== 0) {
    io.write(
      'zigordev-stack: not every shared service became healthy. The lines above name the one that did not\n'
    );
    return started;
  }
  const setUp = compose(io, 'run', '--rm', 'kafka-setup');
  if (setUp !== 0) {
    io.write(
      "zigordev-stack: the services are up, but Kafka's topics and users could not be set up. The lines above say why\n"
    );
    return setUp;
  }
  const pushed = compose(io, 'run', '--rm', 'gcx');
  if (pushed !== 0) {
    io.write(
      'zigordev-stack: the services are up, but the dashboards and the alert rules could not be pushed. The lines above say why\n'
    );
    return pushed;
  }
  if (withMail) {
    const mailing = compose(
      io,
      ...mail,
      'up',
      '--detach',
      '--wait',
      '--wait-timeout',
      '300',
      'notifications-api'
    );
    if (mailing !== 0) {
      io.write(
        'zigordev-stack: the services are up, but notifications did not become healthy. The lines above say why\n'
      );
      return mailing;
    }
  } else {
    const stopped = compose(io, ...mail, 'stop', ...mailServices);
    if (stopped !== 0) {
      io.write(
        'zigordev-stack: the services are up, but the shared copy of notifications could not be stopped. The lines above say why\n'
      );
      return stopped;
    }
  }
  const width = Math.max(...addresses.map(([address]) => address.length)) + 2;
  io.write(
    [
      'The shared services are up:',
      ...addresses.map(([address, what]) => `  ${address.padEnd(width)}${what}`),
      '',
    ].join('\n')
  );
  return 0;
}

function reset(io: Io): number {
  const code = compose(io, ...mail, 'down', '--volumes');
  return code === 0 ? up(io, true) : code;
}

export function main(args: readonly string[], io: Io): number {
  const [command, ...rest] = args;
  if (
    command === 'up' &&
    rest.length === 2 &&
    rest[0] === '--without' &&
    rest[1] === 'notifications'
  ) {
    return up(io, false);
  }
  if (rest.length === 0) {
    if (command === 'up') {
      return up(io, true);
    }
    if (command === 'down') {
      return compose(io, ...mail, 'down');
    }
    if (command === 'reset') {
      return reset(io);
    }
  }
  io.write(usage);
  return 2;
}
