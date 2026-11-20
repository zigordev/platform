import type * as dashboard from '@grafana/grafana-foundation-sdk/dashboard';
import { describe, expect, it } from 'vitest';
import { observability as notifications } from '../../apps/notifications-api/observability.ts';
import { appDashboard, appRows, platformDashboard } from './dashboards.ts';
import { metricSeries } from './panels.ts';

interface Target {
  readonly expr?: string;
}

interface Built {
  readonly type?: string;
  readonly title?: string;
  readonly datasource?: { readonly uid?: string };
  readonly targets?: readonly Target[];
}

function panels(board: dashboard.Dashboard): Built[] {
  return (board.panels ?? []) as Built[];
}

function rowTitles(board: dashboard.Dashboard): string[] {
  return panels(board)
    .filter((panel) => panel.type === 'row')
    .map((panel) => String(panel.title));
}

function queries(board: dashboard.Dashboard, source: string): string[] {
  return panels(board)
    .filter((panel) => panel.datasource?.uid === source)
    .flatMap((panel) => (panel.targets ?? []).map((target) => String(target.expr)));
}

describe('appDashboard', () => {
  it('names the dashboard after the app and scopes every query to it', () => {
    const board = appDashboard('gpool-api');

    expect(board).toMatchObject({
      uid: 'app-gpool-api',
      title: 'gpool-api',
      tags: ['zigordev', 'app'],
    });
    expect(rowTitles(board)).toEqual(['Overview', 'Traffic', 'Latency', 'Logs']);
    expect(queries(board, 'prometheus').length).toBeGreaterThan(0);
    expect(queries(board, 'prometheus').every((expr) => expr.includes('job="gpool-api"'))).toBe(
      true
    );
    expect(queries(board, 'loki').every((expr) => expr.includes('service_name="gpool-api"'))).toBe(
      true
    );
  });

  it('adds the browser row for a web app', () => {
    expect(rowTitles(appDashboard('gpool-web'))).toEqual([
      'Overview',
      'Traffic',
      'Latency',
      'Logs',
      'Browser',
    ]);
    expect(appRows('gpool-web').at(-1)?.panels).toHaveLength(2);
  });

  it("appends an app's own rows after the standard ones", () => {
    const board = appDashboard('cv-web', {
      rows: [
        {
          title: 'Questions',
          panels: [
            metricSeries('Questions asked', 'ops', [
              { expr: 'sum(rate(cv_questions_total{job="cv-web"}[5m]))' },
            ]),
          ],
        },
      ],
    });

    expect(rowTitles(board).at(-1)).toBe('Questions');
    expect(panels(board).at(-1)?.title).toBe('Questions asked');
  });
});

describe("notifications' own rows", () => {
  it('chart email delivery from notifications-api alone', () => {
    const board = appDashboard('notifications-api', notifications);
    const delivery = queries(board, 'prometheus').filter(
      (expr) => expr.includes('notifications_') || expr.includes('pgboss_')
    );

    expect(rowTitles(board).at(-1)).toBe('Email delivery');
    expect(delivery).toHaveLength(5);
    expect(delivery.every((expr) => expr.includes('job="notifications-api"'))).toBe(true);
  });
});

describe('platformDashboard', () => {
  it('shows every app, flagd and the browsers', () => {
    const board = platformDashboard(['notifications-api', 'playground-web']);

    expect(board).toMatchObject({
      uid: 'platform',
      title: 'platform',
      tags: ['zigordev', 'platform'],
    });
    expect(rowTitles(board)).toEqual(['Apps', 'Feature flags', 'Browsers']);
    expect(queries(board, 'prometheus')).toEqual(
      expect.arrayContaining([
        'count by (job) (target_info{job=~"notifications-api|playground-web"})',
        expect.stringContaining('feature_flag_flagd_impression_total{job="platform-flagd"}'),
      ])
    );
    expect(queries(board, 'loki')).toEqual([
      'sum by (service_name) (count_over_time({source="faro"}[$__auto]))',
    ]);
  });
});
