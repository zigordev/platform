import { describe, expect, it } from 'vitest';
import { observability as notifications } from '../../apps/notifications-api/observability.ts';
import {
  type AlertSpec,
  alertAddress,
  alertingProvisioning,
  alertRule,
  alertUid,
  appAlerts,
  contactPoint,
  platformAlerts,
  platformRunbooks,
} from './alerts.ts';

const spec: AlertSpec = {
  name: 'CvWebQuestionsFailing',
  summary: 'Questions fail',
  expr: 'sum(rate(cv_questions_failed_total[5m])) > 0',
  for: '5m',
  severity: 'ticket',
  runbook: 'https://example.test/runbook.md',
  dashboard: 'app-cv-web',
};

describe('alertUid', () => {
  it('turns the alert name into kebab-case, at most 40 characters', () => {
    expect(alertUid('NotificationsDeadLetters')).toBe('notifications-dead-letters');
    expect(alertUid('A'.repeat(50))).toHaveLength(40);
  });
});

describe('appAlerts', () => {
  it("gives every app an error ratio alert on its own requests, with the platform's runbook", () => {
    const [ratio] = appAlerts('playground-api');

    expect(ratio).toMatchObject({
      name: 'PlaygroundApiErrorRatio',
      for: '5m',
      severity: 'page',
      runbook: `${platformRunbooks}/app-error-ratio.md`,
      dashboard: 'app-playground-api',
    });
    expect(ratio?.expr).toBe(
      '(sum(rate(http_server_request_duration_seconds_count{job="playground-api", http_response_status_code=~"5.."}[5m])) / sum(rate(http_server_request_duration_seconds_count{job="playground-api"}[5m]))) > 0.05'
    );
  });
});

describe('platformAlerts', () => {
  it('watch flagd, with the platform dashboard and runbook', () => {
    expect(platformAlerts).toEqual([
      expect.objectContaining({
        name: 'PlatformFlagdDown',
        expr: 'absent_over_time(target_info{job="platform-flagd"}[5m])',
        runbook: `${platformRunbooks}/flagd-down.md`,
        dashboard: 'platform',
      }),
    ]);
  });
});

describe("notifications' own alerts", () => {
  it('are the two its runbooks define that metrics can measure', () => {
    expect(notifications.alerts?.map((alert) => alert.name)).toEqual([
      'NotificationsDeliveryObjective',
      'NotificationsDeadLetters',
    ]);
    expect(
      notifications.alerts?.every(
        (alert) =>
          alert.expr.includes('job="notifications-api"') &&
          alert.runbook.startsWith(
            'https://github.com/zigordev/notifications/blob/main/docs/runbooks/'
          )
      )
    ).toBe(true);
  });
});

describe('alertRule', () => {
  it('fires while its query returns a value, linking the runbook and the dashboard', () => {
    const rule = alertRule(spec, 'http://grafana.test');

    expect(rule).toMatchObject({
      uid: 'cv-web-questions-failing',
      title: 'CvWebQuestionsFailing',
      condition: 'B',
      for: '5m',
      noDataState: 'OK',
      execErrState: 'Error',
      labels: { severity: 'ticket' },
      annotations: {
        summary: 'Questions fail',
        runbook_url: 'https://example.test/runbook.md',
        dashboard_url: 'http://grafana.test/d/app-cv-web',
      },
    });
    expect(rule.data).toMatchObject([
      {
        refId: 'A',
        datasourceUid: 'prometheus',
        relativeTimeRange: { from: 3600, to: 0 },
        model: { expr: spec.expr, instant: true },
      },
      {
        refId: 'B',
        datasourceUid: '__expr__',
        model: {
          type: 'threshold',
          expression: 'A',
          conditions: [{ evaluator: { type: 'gt', params: [0] } }],
        },
      },
    ]);
  });

  it('looks back only as far as the alert asks', () => {
    expect(
      alertRule({ ...spec, windowSeconds: 600 }, 'http://grafana.test').data[0]?.relativeTimeRange
    ).toEqual({
      from: 600,
      to: 0,
    });
  });
});

describe('alertingProvisioning', () => {
  it('emails every alert to Mailpit and keeps one group per app with alerts', () => {
    const document = alertingProvisioning(
      [
        { name: 'platform', alerts: platformAlerts },
        { name: 'cv-web', alerts: [spec] },
        { name: 'quiet-app', alerts: [] },
      ],
      'http://grafana.test'
    ) as {
      contactPoints: unknown[];
      policies: unknown[];
      groups: { name: string; folder: string; rules: Record<string, unknown>[] }[];
    };

    expect(document).toMatchObject({ apiVersion: 1 });
    expect(document.contactPoints).toEqual([
      {
        orgId: 1,
        name: contactPoint,
        receivers: [
          {
            uid: contactPoint,
            type: 'email',
            settings: { addresses: alertAddress, singleEmail: true },
          },
        ],
      },
    ]);
    expect(document.policies).toEqual([expect.objectContaining({ receiver: contactPoint })]);
    expect(document.groups.map((group) => group.name)).toEqual(['platform', 'cv-web']);
    expect(document.groups[1]).toMatchObject({ folder: 'zigordev', interval: '1m' });
    expect(document.groups[1]?.rules[0]).toMatchObject({
      uid: 'cv-web-questions-failing',
      title: 'CvWebQuestionsFailing',
      isPaused: false,
      data: [
        { refId: 'A', relativeTimeRange: { from: 3600, to: 0 } },
        { refId: 'B', relativeTimeRange: { from: 0, to: 0 } },
      ],
    });
  });
});
