'use client';

import { useSimulationStore } from '@/lib/store';
import { formatDuration, formatLatency, formatPercent, formatRate } from '@/lib/format';

const CHART_WIDTH = 180;
const CHART_HEIGHT = 38;

function Sparkline({ values, color }: { values: number[]; color: string }) {
  const data = values.length > 1 ? values : [0, 0];
  const max = Math.max(...data, 0.0001);
  const step = CHART_WIDTH / (data.length - 1);
  const points = data
    .map((value, index) => {
      const x = index * step;
      const y = CHART_HEIGHT - (value / max) * (CHART_HEIGHT - 6) - 3;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg
      viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
      preserveAspectRatio="none"
      className="mt-1.5 h-9 w-full"
      aria-hidden
    >
      <line
        x1="0"
        y1={CHART_HEIGHT - 2}
        x2={CHART_WIDTH}
        y2={CHART_HEIGHT - 2}
        stroke="var(--rule)"
        strokeWidth="1"
        vectorEffect="non-scaling-stroke"
      />
      <line
        x1="0"
        y1={CHART_HEIGHT / 2}
        x2={CHART_WIDTH}
        y2={CHART_HEIGHT / 2}
        stroke="var(--rule)"
        strokeWidth="1"
        strokeDasharray="2 4"
        opacity="0.7"
        vectorEffect="non-scaling-stroke"
      />
      <polygon
        points={`0,${CHART_HEIGHT} ${points} ${CHART_WIDTH},${CHART_HEIGHT}`}
        fill={color}
        opacity={0.08}
      />
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function MetricChart({
  label,
  value,
  color,
  values,
}: {
  label: string;
  value: string;
  color: string;
  values: number[];
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
        <Sparkline values={values} color={color} />
      </div>
    </div>
  );
}

export default function MetricsPanel() {
  const history = useSimulationStore((state) => state.history);
  const summary = useSimulationStore((state) => state.summary);
  const running = useSimulationStore((state) => state.running);

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

  return (
    <section
      aria-label="Live simulation metrics"
      tabIndex={0}
      className="z-10 grid h-[124px] shrink-0 grid-rows-[20px_44px_auto] gap-1 overflow-hidden border-t border-rule bg-surface px-3 py-1 text-ink focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-live lg:flex lg:h-[150px] lg:gap-0 lg:overflow-x-auto lg:py-3"
    >
      <div className="contents lg:flex lg:w-[220px] lg:shrink-0 lg:flex-col lg:justify-between lg:border-r lg:border-rule lg:px-4 lg:py-2">
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
        <div className="grid min-w-0 grid-cols-4 gap-1 lg:grid-cols-2 lg:gap-x-3 lg:gap-y-1.5 lg:pt-2">
          <div className="min-w-0">
            <div className="truncate text-[10px] leading-3 text-muted lg:text-[11px] lg:leading-normal">
              Completed
            </div>
            <div className="whitespace-nowrap font-mono text-[12px] font-semibold leading-4 tabular-nums text-ink lg:text-[17px] lg:leading-6">
              {Math.round(summary?.totalCompleted ?? 0).toLocaleString()}
            </div>
          </div>
          <div className="min-w-0">
            <div className="truncate text-[10px] leading-3 text-muted lg:text-[11px] lg:leading-normal">
              Dropped
            </div>
            <div className="whitespace-nowrap font-mono text-[12px] font-semibold leading-4 tabular-nums text-alarm lg:text-[17px] lg:leading-6">
              {Math.round(summary?.totalDropped ?? 0).toLocaleString()}
            </div>
          </div>
          <div className="min-w-0">
            <div className="truncate text-[10px] leading-3 text-muted lg:text-[11px] lg:leading-normal">
              p50
            </div>
            <div className="whitespace-nowrap font-mono text-[12px] font-semibold leading-4 tabular-nums text-ink lg:text-[17px] lg:leading-6">
              {formatLatency(summary?.p50Latency ?? 0)}
            </div>
          </div>
          <div className="min-w-0">
            <div className="truncate text-[10px] leading-3 text-muted lg:text-[11px] lg:leading-normal">
              p99
            </div>
            <div className="whitespace-nowrap font-mono text-[12px] font-semibold leading-4 tabular-nums text-ink lg:text-[17px] lg:leading-6">
              {formatLatency(summary?.p99Latency ?? 0)}
            </div>
          </div>
        </div>
      </div>

      <div className="grid min-w-0 grid-cols-3 gap-0 lg:contents">
        <MetricChart
          label="Throughput"
          value={`${formatRate(latest?.rps ?? 0)}/s`}
          color="var(--live-ink)"
          values={throughput}
        />
        <MetricChart
          label="p95 latency"
          value={formatLatency(latest?.p95 ?? 0)}
          color="var(--warning-ink)"
          values={p95}
        />
        <MetricChart
          label="Error rate"
          value={formatPercent(latest?.errorRate ?? 0)}
          color="var(--alarm-ink)"
          values={errorRate}
        />
      </div>
    </section>
  );
}
