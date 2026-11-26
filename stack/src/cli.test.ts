import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { addresses, files, type Io, main, resources } from './cli.ts';

const folder = fileURLToPath(new URL('../', import.meta.url));
const both = '--file compose.yaml --file compose.local.yaml';
const start = `docker compose ${both} up --detach --wait --wait-timeout 300`;
const setup = `docker compose ${both} run --rm kafka-setup`;
const push = `docker compose ${both} run --rm gcx`;
const mail = `docker compose ${both} --profile notifications up --detach --wait --wait-timeout 300 notifications-api`;
const quiet = `docker compose ${both} --profile notifications stop notifications-api notifications-postgres`;

interface Trial {
  readonly io: Io;
  readonly ran: string[];
  readonly where: string[];
  readonly asked: string[];
  output(): string;
}

function trial(failing?: string, built = true): Trial {
  const ran: string[] = [];
  const where: string[] = [];
  const asked: string[] = [];
  let output = '';
  return {
    ran,
    where,
    asked,
    output: () => output,
    io: {
      folder: '/somewhere/stack',
      interact: (command, args, cwd) => {
        const call = `${command} ${args.join(' ')}`;
        ran.push(call);
        where.push(cwd);
        return failing !== undefined && call.includes(failing) ? 3 : 0;
      },
      has: (path) => {
        asked.push(path);
        return built;
      },
      write: (text) => {
        output += text;
      },
    },
  };
}

describe('zigordev-stack up', () => {
  it('starts both compose files, in the package folder, and waits for every health check', () => {
    const { io, ran, where } = trial();
    expect(main(['up'], io)).toBe(0);
    expect(ran[0]).toBe(start);
    expect(where).toEqual([
      '/somewhere/stack',
      '/somewhere/stack',
      '/somewhere/stack',
      '/somewhere/stack',
    ]);
  });

  it("then sets up Kafka's topics and users, and pushes the dashboards and the alert rules, each with a job that is removed afterwards", () => {
    const { io, ran } = trial();
    main(['up'], io);
    expect(ran.slice(0, 3)).toEqual([start, setup, push]);
  });

  it('starts notifications last, once Kafka has its topics and users, because a consumer that misses a topic never starts', () => {
    const { io, ran } = trial();
    main(['up'], io);
    expect(ran).toEqual([start, setup, push, mail]);
  });

  it('stops the shared copy of notifications instead, when told to run without it, for work on notifications itself', () => {
    const { io, ran, output } = trial();
    expect(main(['up', '--without', 'notifications'], io)).toBe(0);
    expect(ran).toEqual([start, setup, push, quiet]);
    expect(output()).toContain('The shared services are up:');
  });

  it('fails with the code Compose gave, and names no address, when notifications does not become healthy', () => {
    const { io, output } = trial('--wait-timeout 300 notifications-api');
    expect(main(['up'], io)).toBe(3);
    expect(output()).toBe(
      'zigordev-stack: the services are up, but notifications did not become healthy. The lines above say why\n'
    );
  });

  it('fails with the code Compose gave when the shared copy of notifications cannot be stopped', () => {
    const { io, output } = trial(' stop ');
    expect(main(['up', '--without', 'notifications'], io)).toBe(3);
    expect(output()).toBe(
      'zigordev-stack: the services are up, but the shared copy of notifications could not be stopped. The lines above say why\n'
    );
  });

  it('then says where each service can be opened', () => {
    const { io, output } = trial();
    main(['up'], io);
    expect(output()).toBe(
      [
        'The shared services are up:',
        '  http://grafana.localhost  Grafana: the logs, traces and metrics of every app',
        '  http://mail.localhost     Mailpit: every email sent on this laptop',
        '  http://traefik.localhost  Traefik: the routes it knows',
        '  http://alloy.localhost    Alloy: what it receives and where it sends it',
        '',
      ].join('\n')
    );
  });

  it('starts nothing while the dashboard files are not built, and says how to build them', () => {
    const { io, ran, asked, output } = trial(undefined, false);
    expect(main(['up'], io)).toBe(1);
    expect(ran).toEqual([]);
    expect(asked).toEqual(['/somewhere/stack/observability/folder.json']);
    expect(output()).toBe(
      'zigordev-stack: the dashboard files are missing from /somewhere/stack/observability. In the platform repo, `pnpm build` writes them\n'
    );
  });

  it('fails with the code Compose gave, pushes nothing and names no address, when a service is not healthy', () => {
    const { io, ran, output } = trial('up');
    expect(main(['up'], io)).toBe(3);
    expect(ran).toEqual([start]);
    expect(output()).toBe(
      'zigordev-stack: not every shared service became healthy. The lines above name the one that did not\n'
    );
  });

  it("fails with the code of Kafka's set-up, pushes nothing, and says that the services are up, when the set-up fails", () => {
    const { io, ran, output } = trial('kafka-setup');
    expect(main(['up'], io)).toBe(3);
    expect(ran).toEqual([start, setup]);
    expect(output()).toBe(
      "zigordev-stack: the services are up, but Kafka's topics and users could not be set up. The lines above say why\n"
    );
  });

  it('fails with the code of the push, and says that the services are up, when the push fails', () => {
    const { io, output } = trial('gcx');
    expect(main(['up'], io)).toBe(3);
    expect(output()).toBe(
      'zigordev-stack: the services are up, but the dashboards and the alert rules could not be pushed. The lines above say why\n'
    );
  });
});

describe('zigordev-stack down', () => {
  it('stops the services, notifications among them, and keeps their data', () => {
    const { io, ran, output } = trial();
    expect(main(['down'], io)).toBe(0);
    expect(ran).toEqual([`docker compose ${both} --profile notifications down`]);
    expect(output()).toBe('');
  });

  it('fails with the code Compose gave', () => {
    const { io } = trial('down');
    expect(main(['down'], io)).toBe(3);
  });
});

describe('zigordev-stack reset', () => {
  it("deletes the data, notifications' included, then starts the services and pushes again", () => {
    const { io, ran, output } = trial();
    expect(main(['reset'], io)).toBe(0);
    expect(ran).toEqual([
      `docker compose ${both} --profile notifications down --volumes`,
      start,
      setup,
      push,
      mail,
    ]);
    expect(output()).toContain('The shared services are up:');
  });

  it('starts nothing when the data could not be deleted', () => {
    const { io, ran } = trial('down');
    expect(main(['reset'], io)).toBe(3);
    expect(ran).toEqual([`docker compose ${both} --profile notifications down --volumes`]);
  });
});

describe('zigordev-stack with anything else', () => {
  it.each([
    [[]],
    [['start']],
    [['up', '--build']],
    [['up', '--without']],
    [['up', '--without', 'kafka']],
    [['down', '--without', 'notifications']],
    [['down', '--volumes']],
  ])('explains itself and runs nothing for %j', (args) => {
    const { io, ran, output } = trial();
    expect(main(args, io)).toBe(2);
    expect(ran).toEqual([]);
    expect(output()).toContain('Usage: zigordev-stack up');
    expect(output()).toContain('reset  Stops them, deletes their data and starts them again.');
  });
});

describe('the package', () => {
  const manifest = JSON.parse(readFileSync(`${folder}package.json`, 'utf8')) as {
    name: string;
    version: string;
    private?: boolean;
    files: string[];
    bin: Record<string, string>;
    dependencies?: Record<string, string>;
    publishConfig: Record<string, string>;
    repository: Record<string, string>;
  };

  it('is public, so the release packs it and hands it to npm', () => {
    expect(manifest.name).toBe('@zigordev/stack');
    expect(manifest.private).toBeUndefined();
    expect(manifest.publishConfig).toEqual({ access: 'public' });
  });

  it('names this repo exactly, because npm compares the name with the proof of origin', () => {
    expect(manifest.repository).toEqual({
      type: 'git',
      url: 'git+https://github.com/zigordev/platform.git',
      directory: 'stack',
    });
  });

  it('keeps version 0.0.0 in git, because the release writes the tagged version when it packs', () => {
    expect(manifest.version).toBe('0.0.0');
  });

  it('has no dependency of its own, so a product installs this one package and nothing with it', () => {
    expect(manifest.dependencies).toBeUndefined();
  });

  it('ships the command, its compiled code, every compose file the command names, and the dashboard files', () => {
    expect(manifest.files).toEqual(['bin', 'dist', ...files, resources]);
    for (const file of files) {
      expect(existsSync(`${folder}${file}`)).toBe(true);
    }
    expect(existsSync(`${folder}${manifest.bin['zigordev-stack']}`)).toBe(true);
  });

  it('mounts the dashboard files into the job from the folder the command checks', () => {
    const local = readFileSync(`${folder}compose.local.yaml`, 'utf8');
    expect(local).toContain(`      - ./${resources}:/resources:ro\n`);
  });

  it('gives an address to each service that has a page', () => {
    const local = readFileSync(`${folder}compose.local.yaml`, 'utf8');
    for (const [address] of addresses) {
      expect(local).toContain(`Host(\`${address.replace('http://', '')}\`)`);
    }
  });
});
