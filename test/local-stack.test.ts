import { randomBytes, randomUUID } from 'node:crypto';
import { connect } from 'node:net';
import pg from 'pg';
import { describe, expect, it } from 'vitest';
import { readConfig } from '../src/config.ts';
import { databaseName } from '../src/database.ts';
import { readFlags } from '../src/flags.ts';
import { defaultProducer, readProducers } from '../src/producers.ts';
import { readApps } from '../src/registry.ts';

const grafana = 'http://127.0.0.1:3300/api/datasources/proxy/uid';
const otlp = 'http://127.0.0.1:4318';
const mailpit = 'http://127.0.0.1:8025';
const notifications = 'http://127.0.0.1:3001';
const flagd = 'http://127.0.0.1:8016/ofrep/v1/evaluate/flags';
const flagdManagement = 'http://127.0.0.1:8014';

async function eventually<T>(probe: () => Promise<T | undefined>, timeoutMs = 60_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await probe().catch(() => undefined);
    if (value !== undefined) {
      return value;
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error(`the probe did not succeed within ${timeoutMs} ms`);
}

async function query(url: string, text: string): Promise<Record<string, unknown>[]> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    return (await client.query(text)).rows;
  } finally {
    await client.end();
  }
}

async function getJson(url: string): Promise<Record<string, unknown> | undefined> {
  const response = await fetch(url);
  return response.ok ? ((await response.json()) as Record<string, unknown>) : undefined;
}

async function postOtlp(signal: 'traces' | 'metrics', body: unknown): Promise<void> {
  const response = await fetch(`${otlp}/v1/${signal}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  expect(response.status).toBe(200);
}

async function evaluateFlag(key: string, flagSetId: string): Promise<Response> {
  return fetch(`${flagd}/${key}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'flagd-selector': `flagSetId=${flagSetId}` },
    body: JSON.stringify({ context: {} }),
  });
}

function findMail(subject: string): Promise<Record<string, unknown>> {
  return eventually(async () => {
    const result = await getJson(
      `${mailpit}/api/v1/search?query=${encodeURIComponent(`subject:"${subject}"`)}`
    );
    return Number(result?.messages_count) > 0 ? result : undefined;
  });
}

async function localDevKey(): Promise<string> {
  const producers = await readProducers(readConfig().PLATFORM_LOCAL_DIR);
  const localDev = producers.find((producer) => producer.name === defaultProducer.name);
  if (localDev === undefined) {
    throw new Error('local-dev is missing from the producers file; pnpm local:up adds it');
  }
  return localDev.key;
}

async function sendThroughNotifications(subject: string): Promise<Response> {
  return fetch(`${notifications}/api/v1/emails`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${await localDevKey()}`,
      'idempotency-key': `platform-local-check:${randomUUID()}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from: { email: defaultProducer.senders[0], name: 'platform local check' },
      to: { email: 'inbox@platform.test' },
      subject,
      text: 'From the local stack check, through notifications-api.',
    }),
  });
}

function sendMail(subject: string): Promise<void> {
  const commands: [string | undefined, string][] = [
    [undefined, '220'],
    ['EHLO platform.test', '250'],
    ['MAIL FROM:<smoke@platform.test>', '250'],
    ['RCPT TO:<inbox@platform.test>', '250'],
    ['DATA', '354'],
    [
      `Subject: ${subject}\r\nFrom: smoke@platform.test\r\nTo: inbox@platform.test\r\n\r\nFrom the local stack check.\r\n.`,
      '250',
    ],
    ['QUIT', '221'],
  ];
  return new Promise((resolve, reject) => {
    const socket = connect(1025, '127.0.0.1');
    let buffer = '';
    let step = 0;
    socket.on('error', reject);
    socket.on('data', (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split('\r\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!/^\d{3} /.test(line)) {
          continue;
        }
        const expected = commands[step]?.[1];
        if (!line.startsWith(`${expected} `)) {
          socket.destroy();
          reject(new Error(`expected ${expected}, the server said ${line}`));
          return;
        }
        step += 1;
        const next = commands[step]?.[0];
        if (next === undefined) {
          socket.end();
          resolve();
          return;
        }
        socket.write(`${next}\r\n`);
      }
    });
  });
}

describe('the local platform', () => {
  it('runs PostgreSQL 18 with a database and role for every registered app', async () => {
    const [server] = await query(
      'postgresql://postgres@127.0.0.1:5432/postgres',
      'SHOW server_version'
    );
    const names = (await readApps('apps'))
      .filter((app) => app.database)
      .map((app) => databaseName(app.name));
    const found = await Promise.all(
      names.map(async (name) => {
        const [row] = await query(
          `postgresql://${name}@127.0.0.1:5432/${name}`,
          'SELECT current_user AS role, current_database() AS database'
        );
        return row;
      })
    );

    expect(String(server?.server_version)).toMatch(/^18\./);
    expect(names).toEqual(expect.arrayContaining(['platform_hello', 'playground_api']));
    expect(found).toEqual(names.map((name) => ({ role: name, database: name })));
  });

  it('catches mail sent over SMTP in Mailpit', async () => {
    const subject = `Local stack check ${randomUUID()}`;
    await sendMail(subject);

    const found = await findMail(subject);

    expect(Number(found.messages_count)).toBe(1);
  });

  it('runs notifications-api from its released image, with its database and Mailpit up', async () => {
    const health = await eventually(() => getJson(`${notifications}/health`));

    expect(health).toEqual({
      status: 'ok',
      service: 'notifications-api',
      components: { db: { status: 'up' }, provider: { status: 'up' } },
    });
  });

  it('delivers an email sent through notifications-api into Mailpit', async () => {
    const subject = `Notifications check ${randomUUID()}`;
    const response = await sendThroughNotifications(subject);

    expect(response.status).toBe(202);
    expect(Number((await findMail(subject)).messages_count)).toBe(1);
  });

  it('carries a trace sent to Alloy into Tempo', async () => {
    const traceId = randomBytes(16).toString('hex');
    const now = BigInt(Date.now()) * 1_000_000n;
    await postOtlp('traces', {
      resourceSpans: [
        {
          resource: {
            attributes: [{ key: 'service.name', value: { stringValue: 'platform-local-check' } }],
          },
          scopeSpans: [
            {
              spans: [
                {
                  traceId,
                  spanId: randomBytes(8).toString('hex'),
                  name: 'local stack check',
                  kind: 2,
                  startTimeUnixNano: String(now),
                  endTimeUnixNano: String(now + 1_000_000n),
                },
              ],
            },
          ],
        },
      ],
    });

    const trace = await eventually(() => getJson(`${grafana}/tempo/api/traces/${traceId}`));

    expect(JSON.stringify(trace)).toContain('local stack check');
  });

  it('carries a metric sent to Alloy into Prometheus', async () => {
    const probe = randomUUID();
    await postOtlp('metrics', {
      resourceMetrics: [
        {
          resource: {
            attributes: [{ key: 'service.name', value: { stringValue: 'platform-local-check' } }],
          },
          scopeMetrics: [
            {
              metrics: [
                {
                  name: 'platform.local_check.probes',
                  sum: {
                    aggregationTemporality: 2,
                    isMonotonic: true,
                    dataPoints: [
                      {
                        asInt: '1',
                        timeUnixNano: String(BigInt(Date.now()) * 1_000_000n),
                        attributes: [{ key: 'probe', value: { stringValue: probe } }],
                      },
                    ],
                  },
                },
              ],
            },
          ],
        },
      ],
    });

    const series = await eventually(async () => {
      const promql = encodeURIComponent(`platform_local_check_probes_total{probe="${probe}"}`);
      const result = await getJson(`${grafana}/prometheus/api/v1/query?query=${promql}`);
      const found = (result?.data as { result?: unknown[] } | undefined)?.result ?? [];
      return found.length > 0 ? found : undefined;
    });

    expect(series).toHaveLength(1);
  });

  it('serves each app its own flags through flagd, and no other app sees them', async () => {
    const [hello] = await readFlags('apps', await readApps('apps'));
    if (hello === undefined) {
      throw new Error('no app in apps/ has a flags.json for the check to evaluate');
    }
    const [key, flag] = Object.entries(hello.flags.flags)[0] ?? [];
    if (key === undefined || flag === undefined) {
      throw new Error(`${hello.file} has no flags`);
    }

    const own = await eventually(async () => {
      const response = await evaluateFlag(key, hello.app);
      return response.ok ? ((await response.json()) as Record<string, unknown>) : undefined;
    });
    const other = await evaluateFlag(key, 'platform-local-check');

    expect(own).toMatchObject({
      key,
      variant: flag.defaultVariant,
      value: flag.variants[flag.defaultVariant],
      metadata: { flagSetId: hello.app },
    });
    expect(other.status).toBe(404);
    expect(await other.json()).toMatchObject({ errorCode: 'FLAG_NOT_FOUND' });
  });

  it('reports flagd healthy and ready on its management port', async () => {
    const statuses = await Promise.all(
      ['/healthz', '/readyz'].map(async (path) => (await fetch(`${flagdManagement}${path}`)).status)
    );

    expect(statuses).toEqual([200, 200]);
  });

  it("carries flagd's own metrics to Prometheus", async () => {
    const series = await eventually(async () => {
      const promql = encodeURIComponent('count by (__name__) ({job="platform-flagd"})');
      const result = await getJson(`${grafana}/prometheus/api/v1/query?query=${promql}`);
      const found = (result?.data as { result?: unknown[] } | undefined)?.result ?? [];
      return found.length > 0 ? found : undefined;
    }, 120_000);

    expect(series.length).toBeGreaterThan(0);
  });

  it('ships the logs of containers on the zigordev network to Loki', async () => {
    const expected = [
      'platform-alloy',
      'platform-flagd',
      'platform-lgtm',
      'platform-mailpit',
      'platform-notifications-api',
      'platform-postgres',
    ];
    const containers = await eventually(async () => {
      const result = await getJson(`${grafana}/loki/loki/api/v1/label/container/values?since=720h`);
      const values = (result?.data as string[] | undefined) ?? [];
      return expected.every((name) => values.includes(name)) ? values : undefined;
    }, 120_000);

    expect(containers).toEqual(expect.arrayContaining(expected));
  });

  it('ships the lines notifications-api writes now to Loki', async () => {
    const response = await sendThroughNotifications(`Log check ${randomUUID()}`);
    const { id } = (await response.json()) as { id: string };

    const line = await eventually(async () => {
      const logql = encodeURIComponent(
        `{container="platform-notifications-api"} |= "email.accepted" |= "${id}"`
      );
      const result = await getJson(
        `${grafana}/loki/loki/api/v1/query_range?query=${logql}&since=10m&limit=1`
      );
      const streams =
        (result?.data as { result?: { values: [string, string][] }[] } | undefined)?.result ?? [];
      return streams[0]?.values[0]?.[1];
    }, 120_000);

    expect(JSON.parse(line)).toMatchObject({
      event: 'email.accepted',
      emailId: id,
      service: 'notifications-api',
    });
  });
});
