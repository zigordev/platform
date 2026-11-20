import type * as cog from '@grafana/grafana-foundation-sdk/cog';
import type * as dashboard from '@grafana/grafana-foundation-sdk/dashboard';
import * as logs from '@grafana/grafana-foundation-sdk/logs';
import * as loki from '@grafana/grafana-foundation-sdk/loki';
import * as prometheus from '@grafana/grafana-foundation-sdk/prometheus';
import * as stat from '@grafana/grafana-foundation-sdk/stat';
import * as timeseries from '@grafana/grafana-foundation-sdk/timeseries';

export type Panel = cog.Builder<dashboard.Panel>;

export interface Query {
  readonly expr: string;
  readonly legend?: string;
}

export const prometheusSource = { type: 'prometheus', uid: 'prometheus' };
export const lokiSource = { type: 'loki', uid: 'loki' };

function refId(index: number): string {
  return String.fromCharCode(65 + index);
}

export function metricSeries(title: string, unit: string, queries: readonly Query[]): Panel {
  const panel = new timeseries.PanelBuilder()
    .title(title)
    .datasource(prometheusSource)
    .unit(unit)
    .height(8)
    .span(12);
  queries.forEach((query, index) => {
    panel.withTarget(
      new prometheus.DataqueryBuilder()
        .expr(query.expr)
        .legendFormat(query.legend ?? '__auto')
        .refId(refId(index))
    );
  });
  return panel;
}

export function metricStat(title: string, unit: string, expr: string): Panel {
  return new stat.PanelBuilder()
    .title(title)
    .datasource(prometheusSource)
    .unit(unit)
    .height(4)
    .span(6)
    .withTarget(new prometheus.DataqueryBuilder().expr(expr).instant().refId('A'));
}

export function logSeries(title: string, queries: readonly Query[]): Panel {
  const panel = new timeseries.PanelBuilder()
    .title(title)
    .datasource(lokiSource)
    .unit('short')
    .height(8)
    .span(12);
  queries.forEach((query, index) => {
    panel.withTarget(
      new loki.DataqueryBuilder()
        .expr(query.expr)
        .legendFormat(query.legend ?? '')
        .refId(refId(index))
    );
  });
  return panel;
}

export function logLines(title: string, expr: string): Panel {
  return new logs.PanelBuilder()
    .title(title)
    .datasource(lokiSource)
    .height(10)
    .span(24)
    .withTarget(new loki.DataqueryBuilder().expr(expr).maxLines(200).refId('A'));
}
