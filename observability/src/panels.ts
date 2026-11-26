import type * as cog from '@grafana/grafana-foundation-sdk/cog';
import * as common from '@grafana/grafana-foundation-sdk/common';
import type * as dashboard from '@grafana/grafana-foundation-sdk/dashboard';
import * as logs from '@grafana/grafana-foundation-sdk/logs';
import * as loki from '@grafana/grafana-foundation-sdk/loki';
import * as prometheus from '@grafana/grafana-foundation-sdk/prometheus';
import * as stat from '@grafana/grafana-foundation-sdk/stat';
import * as timeseries from '@grafana/grafana-foundation-sdk/timeseries';
import { lokiUid, prometheusUid, usageUid } from './resources.ts';

export type Panel = cog.Builder<dashboard.Panel>;

export interface Query {
  readonly expr: string;
  readonly legend: string;
}

export interface Source {
  readonly type: string;
  readonly uid: string;
}

export const metrics: Source = { type: 'prometheus', uid: prometheusUid };
export const usage: Source = { type: 'prometheus', uid: usageUid };
const lines: Source = { type: 'loki', uid: lokiUid };

function refId(index: number): string {
  return String.fromCharCode(65 + index);
}

export function number(
  id: number,
  title: string,
  unit: string,
  expr: string,
  source: Source = metrics
): Panel {
  return new stat.PanelBuilder()
    .id(id)
    .title(title)
    .datasource(source)
    .unit(unit)
    .height(4)
    .span(6)
    .withTarget(new prometheus.DataqueryBuilder().expr(expr).instant().refId('A'));
}

export function name(id: number, title: string, expr: string, legend: string): Panel {
  return new stat.PanelBuilder()
    .id(id)
    .title(title)
    .datasource(metrics)
    .textMode(common.BigValueTextMode.Name)
    .height(4)
    .span(6)
    .withTarget(
      new prometheus.DataqueryBuilder().expr(expr).legendFormat(legend).instant().refId('A')
    );
}

export function overTime(
  id: number,
  title: string,
  unit: string,
  queries: readonly Query[],
  source: Source = metrics
): Panel {
  const panel = new timeseries.PanelBuilder()
    .id(id)
    .title(title)
    .datasource(source)
    .unit(unit)
    .height(8)
    .span(12);
  queries.forEach((query, index) => {
    panel.withTarget(
      new prometheus.DataqueryBuilder()
        .expr(query.expr)
        .legendFormat(query.legend)
        .refId(refId(index))
    );
  });
  return panel;
}

export function linesOverTime(id: number, title: string, queries: readonly Query[]): Panel {
  const panel = new timeseries.PanelBuilder()
    .id(id)
    .title(title)
    .datasource(lines)
    .unit('short')
    .height(8)
    .span(12);
  queries.forEach((query, index) => {
    panel.withTarget(
      new loki.DataqueryBuilder().expr(query.expr).legendFormat(query.legend).refId(refId(index))
    );
  });
  return panel;
}

export function logLines(id: number, title: string, expr: string): Panel {
  return new logs.PanelBuilder()
    .id(id)
    .title(title)
    .datasource(lines)
    .height(10)
    .span(24)
    .withTarget(new loki.DataqueryBuilder().expr(expr).maxLines(200).refId('A'));
}
