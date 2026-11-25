import type * as dashboard from '@grafana/grafana-foundation-sdk/dashboard';
import { describe, expect, it } from 'vitest';
import { appDashboard, appPanels, platformDashboard, platformPanels } from './dashboards.ts';

interface Target {
  readonly expr?: string;
}

function panels(model: dashboard.Dashboard): dashboard.Panel[] {
  return (model.panels ?? []).filter((panel): panel is dashboard.Panel => panel.type !== 'row');
}

function rows(model: dashboard.Dashboard): string[] {
  return (model.panels ?? [])
    .filter((panel) => panel.type === 'row')
    .map((panel) => panel.title ?? '');
}

function queries(model: dashboard.Dashboard): string[] {
  return panels(model).flatMap((panel) =>
    (panel.targets ?? []).map((target) => (target as Target).expr ?? '')
  );
}

function question(model: dashboard.Dashboard, id: number): string {
  const target = panels(model).find((panel) => panel.id === id)?.targets?.[0] as Target | undefined;
  return target?.expr ?? '';
}

function grouped(query: string): string[] {
  return [...query.matchAll(/\bby \(([^)]*)\)/g)].flatMap((match) =>
    (match[1] ?? '').split(',').map((label) => label.trim())
  );
}

const app = appDashboard();
const platform = platformDashboard();

describe.each([
  ['app', app, appPanels],
  ['platform', platform, platformPanels],
] as const)('the %s dashboard', (uid, model, ids) => {
  it('has a fixed name in Grafana, so a link to it never breaks', () => {
    expect(model.uid).toBe(uid);
  });

  it('cannot be edited in Grafana, because the code is its source', () => {
    expect(model.editable).toBe(false);
    expect(model.tags).toEqual(['zigordev']);
    expect(model.refresh).toBe('30s');
  });

  it('gives every panel the number that the code names it by, so an alert can point at it', () => {
    const numbers = panels(model).map((panel) => panel.id);
    expect(numbers).toEqual(Object.values(ids));
    expect(new Set(numbers).size).toBe(numbers.length);
  });

  it('asks a question in every panel', () => {
    for (const panel of panels(model)) {
      expect(panel.targets?.length ?? 0, panel.title).toBeGreaterThan(0);
    }
    for (const query of queries(model)) {
      expect(query).not.toBe('');
    }
  });

  it('groups only by labels that hold a few known values, never an id, an address or a raw path', () => {
    const allowed = [
      'le',
      'service_name',
      'service_version',
      'http_route',
      'http_response_status_code',
      'level',
      'event',
      'device',
      'service',
      'compose_project',
    ];
    for (const query of queries(model)) {
      for (const label of grouped(query)) {
        expect(allowed, query).toContain(label);
      }
    }
  });
});

describe('the app dashboard', () => {
  it('lets the reader pick the app, from the apps that report requests', () => {
    expect(app.templating?.list).toHaveLength(1);
    expect(app.templating?.list?.[0]).toEqual(
      expect.objectContaining({
        name: 'app',
        label: 'App',
        type: 'query',
        query: 'label_values(http_server_request_duration_seconds_count, service_name)',
      })
    );
  });

  it('asks every question about the picked app, and about no other', () => {
    for (const query of queries(app)) {
      expect(query).toContain('service_name="$app"');
    }
  });

  it('shows what the plan asks for: whether it is up, its version, requests, failures, response times, events and errors', () => {
    expect(rows(app)).toEqual(['Now', 'Requests', 'Response times', 'Logs and events']);
    expect(panels(app).map((panel) => panel.title)).toEqual([
      'Copies reporting',
      'Version',
      'Requests per second',
      'Share of requests that fail',
      'Response time of the slowest 5%',
      'Requests by route',
      'Responses by status',
      'Response time',
      'Response time of the slowest 5%, by route',
      'Log lines by level',
      'Events',
      'Errors and warnings',
    ]);
  });

  it('counts a request as failed when the server is at fault, not the visitor', () => {
    expect(question(app, appPanels.failing)).toContain('http_response_status_code=~"5.."');
  });

  it('reads the level and the event from the log line itself', () => {
    expect(question(app, appPanels.problems)).toBe(
      '{service_name="$app"} | json | level=~"error|warn"'
    );
  });
});

describe('the platform dashboard', () => {
  it('has no list to pick from, because there is one platform', () => {
    expect(platform.templating?.list ?? []).toEqual([]);
  });

  it('shows the machine, the ingress, the telemetry itself and the backups', () => {
    expect(rows(platform)).toEqual(['The machine', 'The ingress', 'Telemetry', 'Backups']);
  });

  it("shows how old each product's newest dump and last good restore test are", () => {
    expect(question(platform, platformPanels.dumpAge)).toBe(
      'time() - max by (compose_project) (platform_backup_last_success_timestamp_seconds)'
    );
    expect(question(platform, platformPanels.restoreTestAge)).toBe(
      'time() - max by (compose_project) (platform_restore_test_last_success_timestamp_seconds)'
    );
  });

  it('counts a disk once, however many folders it is mounted at', () => {
    expect(question(platform, platformPanels.diskOverTime)).toBe(
      '1 - max by (device) (node_filesystem_avail_bytes) / max by (device) (node_filesystem_size_bytes)'
    );
  });
});
