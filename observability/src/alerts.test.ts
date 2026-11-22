import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { alerts, slowestAllowed } from './alerts.ts';
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
  it('are four, each with a name of its own', () => {
    expect(alerts.map((one) => one.uid)).toEqual([
      'app-answers-with-errors',
      'app-is-slow',
      'host-is-filling-up',
      'telemetry-went-silent',
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

describe('telemetry that went silent', () => {
  const one = alert('telemetry-went-silent');

  it('means the agent sent no heartbeat for 10 minutes, and fires at once', () => {
    expect(one.expr).toBe('absent_over_time(alloy_build_info[10m])');
    expect(one.for).toBe('0s');
  });
});
