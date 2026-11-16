'use client';

import { useSimulationStore } from '@/lib/store';
import { componentCostPerHour, formatCost } from '@/lib/components';
import {
  formatDuration,
  formatLatency,
  formatPercent,
  formatRate,
} from '@/lib/format';
import { SPIKE_WINDOW_END_MS, SPIKE_WINDOW_START_MS } from '@/lib/challenges';
import Sparkline from './Sparkline';

function MetricChart({
  label,
  value,
  color,
  values,
  threshold,
  shade,
  note,
}: {
  label: string;
  value: string;
  color: string;
  values: number[];
  threshold?: number;
  shade?: { from: number; to: number } | null;
  note?: string;
}) {
  return (
    <div className="min-w-0 border-r border-rule px-1.5 py-1 last:border-r-0 lg:min-w-[160px] lg:flex-1 lg:px-4 lg:py-3">
      <div className="flex min-w-0 flex-col items-start gap-0.5 lg:flex-row lg:items-baseline lg:justify-between lg:gap-2">
        <span className="max-w-full truncate text-[10px] font-medium text-muted lg:text-[11px]">
          {label}
        </span>
        <span
          className="max-w-full whitespace-nowrap font-mono text-[12px] font-semibold leading-tight tabular-nums lg:text-[19px] lg:leading-normal"
          style={{ color }}
        >
          {value}
        </span>
      </div>
      <div className="hidden lg:block">
        <Sparkline
          values={values}
          color={color}
          threshold={threshold}
          shade={shade}
          label={`${label} history`}
        />
        {note ? (
          <p className="mt-0.5 font-mono text-[9px] text-faint">{note}</p>
        ) : null}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone = 'text-ink',
  className = '',
}: {
  label: string;
  value: string;
  tone?: string;
  className?: string;
}) {
  return (
    <div className={`min-w-0 ${className}`}>
      <div className="truncate text-[10px] leading-3 text-muted lg:text-[11px] lg:leading-normal">
        {label}
      </div>
      <div
        className={`whitespace-nowrap font-mono text-[12px] font-semibold leading-4 tabular-nums lg:text-[17px] lg:leading-6 ${tone}`}
      >
        {value}
      </div>
    </div>
  );
}

export default function MetricsPanel() {
  const history = useSimulationStore((state) => state.history);
  const summary = useSimulationStore((state) => state.summary);
  const running = useSimulationStore((state) => state.running);
  const nodes = useSimulationStore((state) => state.nodes);
  const metricsById = useSimulationStore((state) => state.metricsById);
  const thresholds = useSimulationStore((state) => state.challengeThresholds);

  const latest = history[history.length - 1];
  const elapsed = latest?.t ?? 0;

  // Build all three series in one pass instead of mapping history three times.
  const throughput: number[] = [];
  const p95: number[] = [];
  const errorRate: number[] = [];
  for (const point of history) {
    throughput.push(point.rps);
    p95.push(point.p95);
    errorRate.push(point.errorRate);
  }

  const firstT = history[0]?.t ?? 0;
  const lastT = latest?.t ?? 0;
  const span = Math.max(1, lastT - firstT);
  const shade =
    lastT > SPIKE_WINDOW_START_MS
      ? {
          from: Math.max(0, (SPIKE_WINDOW_START_MS - firstT) / span),
          to: Math.min(1, (SPIKE_WINDOW_END_MS - firstT) / span),
        }
      : null;

  const costPerHour = nodes.reduce(
    (sum, node) =>
      sum +
      componentCostPerHour(
        node.data.component,
        metricsById[node.id]?.instances ??
          node.data.component.minInstances ??
          1
      ),
    0
  );
  const overBudget =
    thresholds.maxCostPerHour !== undefined &&
    costPerHour > thresholds.maxCostPerHour;

  return (
    <section
      aria-label="Live simulation metrics"
      tabIndex={0}
      className="z-10 grid h-[124px] shrink-0 grid-rows-[20px_44px_auto] gap-1 overflow-hidden border-t border-rule bg-surface px-3 py-1 text-ink focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-live lg:flex lg:h-[150px] lg:gap-0 lg:overflow-x-auto lg:py-3"
    >
      <div className="contents lg:flex lg:w-[246px] lg:shrink-0 lg:flex-col lg:justify-between lg:border-r lg:border-rule lg:px-4 lg:py-2">
        <div className="flex min-w-0 items-center gap-2 text-[11px] text-muted">
          <span
            className={`h-1.5 w-1.5 rounded-[1px] ${
              running ? 'animate-pulse bg-live' : 'bg-faint'
            }`}
          />
          <span className={running ? 'font-medium text-live-ink' : ''}>
            {running ? 'Running' : 'Paused'}
          </span>
          <span className="ml-auto whitespace-nowrap font-mono text-[10px] tabular-nums text-muted">
            {formatDuration(elapsed)}
          </span>
        </div>
        <div className="grid min-w-0 grid-cols-4 gap-1 lg:grid-cols-2 lg:gap-x-3 lg:gap-y-1 lg:pt-1.5">
          <Stat
            label="Completed"
            value={Math.round(summary?.totalCompleted ?? 0).toLocaleString()}
          />
          <Stat
            label="Dropped"
            value={Math.round(summary?.totalDropped ?? 0).toLocaleString()}
            tone="text-alarm"
          />
          <Stat label="p50" value={formatLatency(summary?.p50Latency ?? 0)} />
          <Stat label="p99" value={formatLatency(summary?.p99Latency ?? 0)} />
          <Stat
            label="Run cost"
            value={formatCost(costPerHour)}
            tone={overBudget ? 'text-alarm' : 'text-ink'}
            className="hidden lg:block"
          />
          <Stat
            label="Cost cap"
            value={
              thresholds.maxCostPerHour !== undefined
                ? formatCost(thresholds.maxCostPerHour)
                : 'none'
            }
            tone={overBudget ? 'text-alarm' : 'text-muted'}
            className="hidden lg:block"
          />
        </div>
      </div>

      <div className="grid min-w-0 grid-cols-3 gap-0 lg:contents">
        <MetricChart
          label="Throughput"
          value={`${formatRate(latest?.rps ?? 0)}/s`}
          color="var(--live-ink)"
          values={throughput}
          shade={shade}
        />
        <MetricChart
          label="p95 latency"
          value={formatLatency(latest?.p95 ?? 0)}
          color="var(--warning-ink)"
          values={p95}
          threshold={thresholds.maxP95LatencyMs}
          shade={shade}
          note={`limit ${formatLatency(thresholds.maxP95LatencyMs)} · spike window shaded`}
        />
        <MetricChart
          label="Error rate"
          value={formatPercent(latest?.errorRate ?? 0)}
          color="var(--alarm-ink)"
          values={errorRate}
          threshold={thresholds.maxErrorRate}
          shade={shade}
          note={`budget ${formatPercent(thresholds.maxErrorRate)}`}
        />
      </div>
    </section>
  );
}
