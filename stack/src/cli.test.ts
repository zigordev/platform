import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { addresses, files, type Io, main } from './cli.ts';

const folder = fileURLToPath(new URL('../', import.meta.url));
const both = '--file compose.yaml --file compose.local.yaml';

interface Trial {
  readonly io: Io;
  readonly ran: string[];
  readonly where: string[];
  output(): string;
}

function trial(failing?: string): Trial {
  const ran: string[] = [];
  const where: string[] = [];
  let output = '';
  return {
    ran,
    where,
    output: () => output,
    io: {
      folder: '/somewhere/stack',
      interact: (command, args, cwd) => {
        const call = `${command} ${args.join(' ')}`;
        ran.push(call);
        where.push(cwd);
        return failing !== undefined && call.includes(failing) ? 3 : 0;
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
    expect(ran).toEqual([`docker compose ${both} up --detach --wait --wait-timeout 300`]);
    expect(where).toEqual(['/somewhere/stack']);
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

  it('fails with the code Compose gave, and names no address, when a service is not healthy', () => {
    const { io, output } = trial('up');
    expect(main(['up'], io)).toBe(3);
    expect(output()).toBe(
      'zigordev-stack: not every shared service became healthy. The lines above name the one that did not\n'
    );
  });
});

describe('zigordev-stack down', () => {
  it('stops the services and keeps their data', () => {
    const { io, ran, output } = trial();
    expect(main(['down'], io)).toBe(0);
    expect(ran).toEqual([`docker compose ${both} down`]);
    expect(output()).toBe('');
  });

  it('fails with the code Compose gave', () => {
    const { io } = trial('down');
    expect(main(['down'], io)).toBe(3);
  });
});

describe('zigordev-stack reset', () => {
  it('deletes the data, then starts the services again', () => {
    const { io, ran, output } = trial();
    expect(main(['reset'], io)).toBe(0);
    expect(ran).toEqual([
      `docker compose ${both} down --volumes`,
      `docker compose ${both} up --detach --wait --wait-timeout 300`,
    ]);
    expect(output()).toContain('The shared services are up:');
  });

  it('starts nothing when the data could not be deleted', () => {
    const { io, ran } = trial('down');
    expect(main(['reset'], io)).toBe(3);
    expect(ran).toEqual([`docker compose ${both} down --volumes`]);
  });
});

describe('zigordev-stack with anything else', () => {
  it.each([[[]], [['start']], [['up', '--build']], [['down', '--volumes']]])(
    'explains itself and runs nothing for %j',
    (args) => {
      const { io, ran, output } = trial();
      expect(main(args, io)).toBe(2);
      expect(ran).toEqual([]);
      expect(output()).toContain('Usage: zigordev-stack up');
      expect(output()).toContain('reset  Stops them, deletes their data and starts them again.');
    }
  );
});

describe('the package', () => {
  const manifest = JSON.parse(readFileSync(`${folder}package.json`, 'utf8')) as {
    files: string[];
    bin: Record<string, string>;
  };

  it('ships the command, its compiled code and every compose file the command names', () => {
    expect(manifest.files).toEqual(['bin', 'dist', ...files]);
    for (const file of files) {
      expect(existsSync(`${folder}${file}`)).toBe(true);
    }
    expect(existsSync(`${folder}${manifest.bin['zigordev-stack']}`)).toBe(true);
  });

  it('gives an address to each service that has a page', () => {
    const local = readFileSync(`${folder}compose.local.yaml`, 'utf8');
    for (const [address] of addresses) {
      expect(local).toContain(`Host(\`${address.replace('http://', '')}\`)`);
    }
  });
});
