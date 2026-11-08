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

function ChartCard({
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
    <div className="min-w-[150px] flex-1 rounded-lg border border-slate-800/80 bg-slate-900/40 px-3 py-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
          {label}
        </span>
        <span className="text-sm font-semibold tabular-nums" style={{ color }}>
          {value}
        </span>
      </div>
      <Sparkline values={values} color={color} />
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
    <div className="sim-panel-enter pointer-events-auto absolute bottom-4 left-4 right-4 z-10 flex gap-2 overflow-x-auto rounded-xl border border-slate-800/80 bg-[#0a111a]/90 p-2 shadow-2xl shadow-black/40 backdrop-blur">
      <div className="flex w-52 shrink-0 flex-col justify-between rounded-lg border border-slate-800/80 bg-slate-900/40 px-3 py-2">
        <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-wider text-slate-500">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              running ? 'animate-pulse bg-emerald-400' : 'bg-slate-600'
            }`}
          />
          <span>{running ? 'Simulating' : 'Paused'}</span>
          <span className="ml-auto tabular-nums text-slate-400">
            {formatDuration(elapsed)}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2 pt-2">
          <div>
            <div className="text-[9px] uppercase tracking-wider text-slate-500">
              Completed
            </div>
            <div className="text-sm font-semibold tabular-nums text-slate-200">
              {Math.round(summary?.totalCompleted ?? 0).toLocaleString()}
            </div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-slate-500">
              Dropped
            </div>
            <div className="text-sm font-semibold tabular-nums text-rose-400">
              {Math.round(summary?.totalDropped ?? 0).toLocaleString()}
            </div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-slate-500">
              p50
            </div>
            <div className="text-[11px] font-semibold tabular-nums text-slate-300">
              {formatLatency(summary?.p50Latency ?? 0)}
            </div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-slate-500">
              p99
            </div>
            <div className="text-[11px] font-semibold tabular-nums text-slate-300">
              {formatLatency(summary?.p99Latency ?? 0)}
            </div>
          </div>
        </div>
      </div>

      <ChartCard
        label="Throughput"
        value={`${formatRate(latest?.rps ?? 0)}/s`}
        color="#38bdf8"
        values={throughput}
      />
      <ChartCard
        label="p95 latency"
        value={formatLatency(latest?.p95 ?? 0)}
        color="#fbbf24"
        values={p95}
      />
      <ChartCard
        label="Error rate"
        value={formatPercent(latest?.errorRate ?? 0)}
        color="#fb7185"
        values={errorRate}
      />
    </div>
  );
}
