'use client';

import { Handle, NodeProps, Position } from '@xyflow/react';
import { memo, useCallback } from 'react';
import { COMPONENT_META, SimNode, useSimulationStore } from '@/lib/store';
import { injectOutage } from '@/lib/simulationClient';
import { formatLatency, formatPercent, formatRate } from '@/lib/format';
import { ComponentConfig } from '@/types';

function statusColor(utilization: number, errors: number, down = false): string {
  if (down) return '#fb7185';
  if (errors > 0) return '#fb7185';
  if (utilization > 0.9) return '#fb7185';
  if (utilization > 0.7) return '#fbbf24';
  return '#34d399';
}

function NumberField({
  label,
  value,
  suffix,
  step = 1,
  min = 0,
  max,
  onChange,
}: {
  label: string;
  value: number;
  suffix: string;
  step?: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-[#65706b]">
        {label}
      </span>
      <span className="flex min-h-8 items-center gap-1 rounded border border-[#d8d4c9] bg-white/70 px-2 focus-within:border-[#267a68]">
        <input
          type="number"
          className="nodrag w-full min-w-0 bg-transparent py-1 text-[12px] font-medium text-[#202b29] outline-none"
          value={Number.isFinite(value) ? value : 0}
          step={step}
          min={min}
          max={max}
          onChange={(event) => {
            const next = Number(event.target.value);
            onChange(Number.isFinite(next) ? next : 0);
          }}
        />
        <span className="shrink-0 text-[10px] text-[#65706b]">{suffix}</span>
      </span>
    </label>
  );
}

function Metric({
  label,
  value,
  tone = 'text-[#303b37]',
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-1 border-t border-[#e4e0d6] py-1.5">
      <span className="text-[10px] uppercase tracking-[0.08em] text-[#65706b]">{label}</span>
      <span className={`text-[11px] font-semibold tabular-nums ${tone}`}>{value}</span>
    </div>
  );
}

/**
 * Memoized so live metrics ticks re-render the readout without touching the
 * controlled inputs. `component` only changes when the user edits the config.
 */
const NodeConfigForm = memo(function NodeConfigForm({
  component,
  isGenerator,
  onChange,
}: {
  component: ComponentConfig;
  isGenerator: boolean;
  onChange: (patch: Partial<ComponentConfig>) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-x-2 gap-y-2.5 px-3 pt-3">
      {isGenerator ? (
        <div className="col-span-2">
          <NumberField
            label="Target rate"
            value={component.throughputLimit}
            suffix="rps"
            step={10}
            max={100_000}
            onChange={(value) => onChange({ throughputLimit: value })}
          />
        </div>
      ) : (
        <>
          <NumberField
            label="Capacity"
            value={component.throughputLimit}
            suffix="rps"
            step={10}
            max={100_000}
            onChange={(value) => onChange({ throughputLimit: value })}
          />
          <NumberField
            label="Latency"
            value={component.latency}
            suffix="ms"
            step={1}
            max={60_000}
            onChange={(value) => onChange({ latency: value })}
          />
          <NumberField
            label="Failures"
            value={Math.round(component.failureRate * 100)}
            suffix="%"
            max={100}
            onChange={(value) => onChange({ failureRate: value / 100 })}
          />
          <NumberField
            label="Queue"
            value={component.queueCapacity}
            suffix="req"
            step={10}
            max={1_000_000}
            onChange={(value) => onChange({ queueCapacity: Math.round(value) })}
          />
        </>
      )}
    </div>
  );
});

export default function BaseNode({ id, data, selected }: NodeProps<SimNode>) {
  const updateNodeData = useSimulationStore((state) => state.updateNodeData);
  const metrics = useSimulationStore((state) => state.metricsById[id]);

  const component: ComponentConfig = data.component;
  const meta = COMPONENT_META[component.type];
  const isGenerator = component.type === 'traffic-generator';

  const utilization = metrics?.utilization ?? 0;
  const status = statusColor(utilization, metrics?.errors ?? 0, metrics?.down);

  const set = useCallback(
    (patch: Partial<ComponentConfig>) => updateNodeData(id, patch),
    [id, updateNodeData]
  );

  return (
    <div
      className={`sim-node-enter w-[260px] rounded-md border bg-[#fbfaf5] shadow-[0_8px_24px_rgba(32,43,41,0.12)] transition-shadow ${
        selected ? 'ring-2 ring-[#267a68]/70' : ''
      }`}
      style={{ borderColor: `${meta.color}55` }}
    >
      <div
        className="flex items-center gap-2 rounded-t-md border-b border-[#e4e0d6] px-3 py-2.5"
        style={{ background: `linear-gradient(90deg, ${meta.color}16, transparent)` }}
      >
        <span className="h-2 w-2 rounded-full" style={{ background: meta.color }} />
        <span className="min-w-0 truncate text-[12px] font-semibold tracking-[0.02em] text-[#202b29]">
          {component.name}
        </span>
        {metrics?.down ? (
          <span className="ml-auto animate-pulse rounded bg-[#b63e35]/10 px-1.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[#9c3029]">
            Down
          </span>
        ) : (
          <button
            type="button"
            aria-label="Inject a 5 second outage"
            onClick={() => injectOutage(id, 5000)}
            className="nodrag ml-auto min-h-7 rounded border border-[#b63e35]/30 px-2 text-[10px] font-semibold uppercase tracking-[0.06em] text-[#9c3029] transition-colors hover:bg-[#b63e35]/[0.08] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b63e35]"
            title="Inject a 5 second outage"
          >
            Kill 5s
          </button>
        )}
        <span
          className="ml-2 h-2 w-2 rounded-full"
          style={{ background: status, color: status }}
          title={`Utilization ${formatPercent(utilization)}`}
          aria-label={`Utilization ${formatPercent(utilization)}`}
        />
      </div>

      <NodeConfigForm component={component} isGenerator={isGenerator} onChange={set} />

      <div className="mt-2.5 grid grid-cols-2 gap-x-3 px-3">
        <Metric label="in" value={`${formatRate(metrics?.requestsIn ?? 0)}/s`} />
        <Metric label="out" value={`${formatRate(metrics?.requestsOut ?? 0)}/s`} />
        <Metric label="p95" value={formatLatency(metrics?.p95Latency ?? 0)} />
        <Metric
          label="errors"
          value={`${formatRate(metrics?.errors ?? 0)}/s`}
          tone={metrics && metrics.errors > 0 ? 'text-[#b63e35]' : 'text-[#303b37]'}
        />
      </div>

      {!isGenerator ? (
        <div className="px-3 pt-2.5">
          <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.08em] text-[#65706b]">
            <span>Utilization</span>
            <span className="tabular-nums">{formatPercent(utilization)}</span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#e4e0d6]">
            <div
              className="sim-utilization-fill h-full rounded-full transition-[width] duration-500"
              style={{ width: `${Math.min(100, utilization * 100)}%`, background: status }}
            />
          </div>
        </div>
      ) : null}

      <div className="flex items-center justify-between px-3 pb-3 pt-2 text-[10px] tabular-nums text-[#65706b]">
        {isGenerator ? (
          <span>dropped {formatRate(metrics?.dropped ?? 0)}</span>
        ) : (
          <span>
            queue {metrics?.queueDepth ?? 0}/{component.queueCapacity}
          </span>
        )}
        <span>p99 {formatLatency(metrics?.p99Latency ?? 0)}</span>
      </div>

      {!isGenerator ? (
        <Handle
          type="target"
          position={Position.Top}
          style={{ width: 10, height: 10, background: meta.color, border: '2px solid #fbfaf5' }}
        />
      ) : null}
      <Handle
        type="source"
        position={Position.Bottom}
        style={{ width: 10, height: 10, background: meta.color, border: '2px solid #fbfaf5' }}
      />
    </div>
  );
}
