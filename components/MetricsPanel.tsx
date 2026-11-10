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
      className="mt-1 h-9 w-full"
      aria-hidden
    >
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
    <div className="min-w-0 border-r border-[#D8D4C9] px-1.5 py-1 last:border-r-0 md:min-w-[204px] md:flex-1 md:px-4 md:py-3">
      <div className="flex min-w-0 flex-col items-start gap-0.5 md:flex-row md:items-baseline md:justify-between md:gap-2">
        <span className="max-w-full truncate text-[8px] font-medium uppercase tracking-[0.08em] text-[#65706B] md:text-[11px] md:tracking-[0.1em]">
          {label}
        </span>
        <span
          className="max-w-full whitespace-nowrap text-[12px] font-semibold leading-tight tabular-nums text-[#202B29] md:text-[20px] md:leading-normal"
          style={{ color }}
        >
          {value}
        </span>
      </div>
      <div className="hidden md:block">
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
      className="sim-panel-enter z-10 grid h-[150px] shrink-0 grid-rows-[20px_44px_1fr] gap-1 overflow-hidden border-t border-[#D8D4C9] bg-[#FBFAF5] px-3 py-1 text-[#202B29] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#267A68] md:flex md:gap-0 md:overflow-x-auto md:py-3"
    >
      <div className="contents md:flex md:w-[240px] md:shrink-0 md:flex-col md:justify-between md:border-r md:border-[#D8D4C9] md:px-4 md:py-2">
        <div className="flex min-w-0 items-center gap-2 text-[10px] font-medium uppercase tracking-[0.1em] text-[#65706B] md:text-[11px]">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              running ? 'animate-pulse bg-[#267A68]' : 'bg-[#A7AAA1]'
            }`}
          />
          <span className={running ? 'font-semibold text-[#267A68]' : ''}>
            {running ? 'Simulating' : 'Paused'}
          </span>
          <span className="ml-auto whitespace-nowrap font-mono tabular-nums text-[#65706B]">
            {formatDuration(elapsed)}
          </span>
        </div>
        <div className="grid min-w-0 grid-cols-4 gap-1 md:grid-cols-2 md:gap-x-3 md:gap-y-1.5 md:pt-2">
          <div className="min-w-0">
            <div className="truncate text-[8px] uppercase leading-3 tracking-[0.04em] text-[#65706B] md:text-[11px] md:leading-normal md:tracking-[0.08em]">
              Completed
            </div>
            <div className="whitespace-nowrap text-[12px] font-semibold leading-4 tabular-nums text-[#202B29] md:text-[18px] md:leading-6">
              {Math.round(summary?.totalCompleted ?? 0).toLocaleString()}
            </div>
          </div>
          <div className="min-w-0">
            <div className="truncate text-[8px] uppercase leading-3 tracking-[0.04em] text-[#65706B] md:text-[11px] md:leading-normal md:tracking-[0.08em]">
              Dropped
            </div>
            <div className="whitespace-nowrap text-[12px] font-semibold leading-4 tabular-nums text-[#B63E35] md:text-[18px] md:leading-6">
              {Math.round(summary?.totalDropped ?? 0).toLocaleString()}
            </div>
          </div>
          <div className="min-w-0">
            <div className="truncate text-[8px] uppercase leading-3 tracking-[0.04em] text-[#65706B] md:text-[11px] md:leading-normal md:tracking-[0.08em]">
              p50
            </div>
            <div className="whitespace-nowrap text-[12px] font-semibold leading-4 tabular-nums text-[#202B29] md:text-[18px] md:leading-6">
              {formatLatency(summary?.p50Latency ?? 0)}
            </div>
          </div>
          <div className="min-w-0">
            <div className="truncate text-[8px] uppercase leading-3 tracking-[0.04em] text-[#65706B] md:text-[11px] md:leading-normal md:tracking-[0.08em]">
              p99
            </div>
            <div className="whitespace-nowrap text-[12px] font-semibold leading-4 tabular-nums text-[#202B29] md:text-[18px] md:leading-6">
              {formatLatency(summary?.p99Latency ?? 0)}
            </div>
          </div>
        </div>
      </div>

      <div className="grid min-w-0 grid-cols-3 gap-0 md:contents">
        <MetricChart
          label="Throughput"
          value={`${formatRate(latest?.rps ?? 0)}/s`}
          color="#267A68"
          values={throughput}
        />
        <MetricChart
          label="p95 latency"
          value={formatLatency(latest?.p95 ?? 0)}
          color="#9A6A16"
          values={p95}
        />
        <MetricChart
          label="Error rate"
          value={formatPercent(latest?.errorRate ?? 0)}
          color="#B63E35"
          values={errorRate}
        />
      </div>
    </section>
  );
}
