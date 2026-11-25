import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { alerts, oldestDumpAllowed, oldestRestoreTestAllowed, slowestAllowed } from './alerts.ts';
import { appPanels, platformPanels } from './dashboards.ts';

const runbookFolder = fileURLToPath(new URL('../../docs/runbooks/', import.meta.url));

function alert(uid: string) {
  const found = alerts.find((candidate) => candidate.uid === uid);
  if (found === undefined) {
    throw new Error(`no alert named ${uid}`);
  }
  return found;
}

describe('the alerts', () => {
  it('are nine, each with a name of its own', () => {
    expect(alerts.map((one) => one.uid)).toEqual([
      'app-answers-with-errors',
      'app-is-slow',
      'host-is-filling-up',
      'backup-is-too-old',
      'restore-test-is-too-old',
      'telemetry-went-silent',
      'kafka-broker-is-down',
      'messages-are-stuck',
      'message-reached-dead-letter-topic',
    ]);
    expect(new Set(alerts.map((one) => one.title)).size).toBe(alerts.length);
  });

  it.each(alerts)('$uid has a runbook that exists', (one) => {
    expect(one.runbook).toBe(`${one.uid}.md`);
    expect(existsSync(`${runbookFolder}${one.runbook}`)).toBe(true);
  });

  it.each(alerts)('$uid opens a panel that exists on its dashboard', (one) => {
    const panelsOf = { app: appPanels, platform: platformPanels } as const;
    expect(Object.keys(panelsOf)).toContain(one.dashboard);
    const known: readonly number[] = Object.values(
      panelsOf[one.dashboard as keyof typeof panelsOf]
    );
    expect(known).toContain(one.panel);
  });

  it.each(alerts)('$uid says in a sentence what is wrong, and whom it reaches', (one) => {
    expect(one.summary.length).toBeGreaterThan(30);
    expect(one.summary.endsWith('.')).toBe(false);
    expect(['phone', 'email']).toContain(one.reaches);
  });
});

describe('an app that answers with errors', () => {
  const one = alert('app-answers-with-errors');

  it('means more than 5% of its requests failed at the server, for 5 minutes', () => {
    expect(one.expr).toContain('http_response_status_code=~"5.."');
    expect(one.expr.endsWith('> 0.05')).toBe(true);
    expect(one.for).toBe('5m');
  });

  it('is one rule for every app, and names the app that fails', () => {
    expect(one.expr).toContain('sum by (service_name)');
    expect(one.summary).toContain('{{ $labels.service_name }}');
  });

  it('leaves the ingress out, which would repeat the failure of the app behind it', () => {
    expect(one.expr.match(/service_name!="traefik"/g)).toHaveLength(2);
  });
});

describe('an app that is slow', () => {
  const one = alert('app-is-slow');

  it('means its slowest 5% of requests took longer than the limit, for 10 minutes', () => {
    expect(slowestAllowed).toBe(1);
    expect(one.expr).toBe(
      'histogram_quantile(0.95, sum by (service_name, le) (rate(http_server_request_duration_seconds_bucket{service_name!="traefik"}[5m]))) > 1'
    );
    expect(one.for).toBe('10m');
  });
});

describe('a host that is filling up', () => {
  const one = alert('host-is-filling-up');

  it('means its memory is above 85%, or one disk above 80%', () => {
    expect(one.expr).toContain(
      '(1 - sum(node_memory_MemAvailable_bytes) / sum(node_memory_MemTotal_bytes)) > 0.85'
    );
    expect(one.expr).toContain(' or ');
    expect(one.expr.endsWith('> 0.8')).toBe(true);
  });
});

describe('a backup that is too old', () => {
  const one = alert('backup-is-too-old');

  it("means a product's newest dump has been older than 2 hours for 5 minutes, as toolkit's record 0023 says", () => {
    expect(oldestDumpAllowed).toBe(7200);
    expect(one.expr).toBe(
      '(time() - max by (compose_project) (platform_backup_last_success_timestamp_seconds)) > 7200'
    );
    expect(one.for).toBe('5m');
  });

  it('names the product, and stays quiet through one dump that failed and the next that passed', () => {
    expect(one.summary).toContain('{{ $labels.compose_project }}');
    expect(one.for).not.toBe('0s');
  });
});

describe('a restore test that is too old', () => {
  const one = alert('restore-test-is-too-old');

  it("means a product's last good restore test is older than 35 days, as toolkit's record 0023 says", () => {
    expect(oldestRestoreTestAllowed).toBe(3024000);
    expect(one.expr).toBe(
      '(time() - max by (compose_project) (platform_restore_test_last_success_timestamp_seconds)) > 3024000'
    );
  });

  it('fires at once, also for a product whose dumps never restored, which the host reports as 0', () => {
    expect(one.for).toBe('0s');
    expect(one.summary).toContain('{{ $labels.compose_project }}');
  });
});

describe('telemetry that went silent', () => {
  const one = alert('telemetry-went-silent');

  it('means the agent sent no heartbeat for 10 minutes, and fires at once', () => {
    expect(one.expr).toBe('absent_over_time(alloy_build_info[10m])');
    expect(one.for).toBe('0s');
  });
});

describe('a Kafka broker that is down', () => {
  const one = alert('kafka-broker-is-down');

  it("means the agent's check of the broker's port has failed for 5 minutes", () => {
    expect(one.expr).toBe('(max(probe_success{job="kafka"})) < 1');
    expect(one.for).toBe('5m');
  });

  it('reads a check that needs no sign-in, so the broker needs no user for the agent', () => {
    expect(one.expr).not.toContain('kafka_');
  });
});

describe('messages that are stuck', () => {
  const one = alert('messages-are-stuck');

  it("means a consumer group has had messages waiting and has handled none for 10 minutes, then 5 more, by the app's own numbers", () => {
    expect(one.expr).toContain(
      'max by (service_name, messaging_destination_name, messaging_consumer_group_name) (zigordev_events_consumer_lag) > 0'
    );
    expect(one.expr).toContain(
      'unless on (service_name, messaging_destination_name, messaging_consumer_group_name)'
    );
    expect(one.expr).toContain('increase(messaging_client_consumed_messages_total[10m])');
    expect(one.for).toBe('5m');
  });

  it('names the app and the topic', () => {
    expect(one.summary).toContain('{{ $labels.service_name }}');
    expect(one.summary).toContain('{{ $labels.messaging_destination_name }}');
  });
});

describe('a message that reached a dead-letter topic', () => {
  const one = alert('message-reached-dead-letter-topic');

  it('fires at once for every message an app set aside, with the reason', () => {
    expect(one.expr).toBe(
      'sum by (service_name, messaging_destination_name, zigordev_events_reason) (increase(zigordev_events_dead_letters_total[10m])) > 0'
    );
    expect(one.for).toBe('0s');
    expect(one.summary).toContain('{{ $labels.zigordev_events_reason }}');
  });
});
