import { describe, expect, it } from 'vitest';
import { logLines, logSeries, metricSeries, metricStat } from './panels.ts';

describe('panels', () => {
  it('reads metrics from Prometheus, with letters for each query and a default legend', () => {
    expect(
      metricSeries('Requests', 'reqps', [{ expr: 'a' }, { expr: 'b', legend: 'B' }]).build()
    ).toMatchObject({
      type: 'timeseries',
      title: 'Requests',
      datasource: { type: 'prometheus', uid: 'prometheus' },
      fieldConfig: { defaults: { unit: 'reqps' } },
      targets: [
        { expr: 'a', legendFormat: '__auto', refId: 'A' },
        { expr: 'b', legendFormat: 'B', refId: 'B' },
      ],
    });
  });

  it('shows a single current value as a stat', () => {
    expect(metricStat('Reporting', 'short', 'up').build()).toMatchObject({
      type: 'stat',
      targets: [{ expr: 'up', instant: true, refId: 'A' }],
    });
  });

  it('counts log lines from Loki, with an empty legend unless one is given', () => {
    expect(logSeries('Lines', [{ expr: 'count_over_time({a="b"}[1m])' }]).build()).toMatchObject({
      type: 'timeseries',
      datasource: { type: 'loki', uid: 'loki' },
      targets: [{ expr: 'count_over_time({a="b"}[1m])', legendFormat: '', refId: 'A' }],
    });
  });

  it('lists log lines from Loki', () => {
    expect(logLines('Errors', '{a="b"}').build()).toMatchObject({
      type: 'logs',
      datasource: { type: 'loki', uid: 'loki' },
      targets: [{ expr: '{a="b"}', maxLines: 200 }],
    });
  });
});
