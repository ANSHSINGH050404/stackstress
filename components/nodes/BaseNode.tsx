'use client';

import { Handle, NodeProps, Position } from '@xyflow/react';
import { memo, useCallback } from 'react';
import { COMPONENT_META, SimNode, useSimulationStore } from '@/lib/store';
import { injectOutage } from '@/lib/simulationClient';
import { formatLatency, formatPercent, formatRate } from '@/lib/format';
import { ComponentConfig } from '@/types';
import ComponentIcon from './ComponentIcon';

function statusColor(utilization: number, errors: number, down = false): string {
  if (down) return 'var(--alarm)';
  if (errors > 0) return 'var(--alarm)';
  if (utilization > 0.9) return 'var(--alarm)';
  if (utilization > 0.7) return 'var(--warning)';
  return 'var(--live)';
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
      <span className="text-[10px] text-muted">{label}</span>
      <span className="flex min-h-8 items-center gap-1 rounded-[2px] border border-control bg-surface px-2 focus-within:border-live focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-live">
        <input
          type="number"
          name={label.toLowerCase().replace(/\s+/g, '-')}
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          className="nodrag w-full min-w-0 bg-transparent py-1 font-mono text-[12px] font-medium text-ink outline-none"
          value={Number.isFinite(value) ? value : 0}
          step={step}
          min={min}
          max={max}
          onChange={(event) => {
            const next = Number(event.target.value);
            onChange(Number.isFinite(next) ? next : 0);
          }}
        />
        <span className="shrink-0 font-mono text-[10px] text-faint">{suffix}</span>
      </span>
    </label>
  );
}

function Metric({
  label,
  value,
  tone = 'text-ink',
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-1 border-t border-rule py-1.5">
      <span className="text-[10px] text-muted">{label}</span>
      <span className={`font-mono text-[11px] font-semibold tabular-nums ${tone}`}>
        {value}
      </span>
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
      className={`sim-node relative w-[260px] transition-shadow ${
        selected ? 'sim-node-selected' : ''
      }`}
    >
      <div className="flex items-center gap-2 rounded-t-[2px] border-b border-rule bg-paper px-3 py-2">
        <span
          className="grid h-6 w-6 shrink-0 place-items-center rounded-[2px] border bg-surface"
          style={{ borderColor: `${meta.color}66`, color: meta.color }}
          aria-hidden="true"
        >
          <ComponentIcon type={component.type} size={15} />
        </span>
        <span
          className="min-w-0 flex-1 truncate text-[12px] font-semibold tracking-[0.01em] text-ink"
          title={component.name}
        >
          {component.name}
        </span>
        {metrics?.down ? (
          <span className="animate-pulse rounded-[2px] bg-alarm/10 px-1.5 py-1 font-mono text-[9px] font-bold uppercase tracking-[0.06em] text-alarm-ink">
            Down
          </span>
        ) : (
          <button
            type="button"
            aria-label="Inject a 5 second outage"
            onClick={() => injectOutage(id, 5000)}
            className="nodrag min-h-8 rounded-[2px] border border-alarm/30 px-2 font-mono text-[9px] font-semibold tracking-[0.02em] text-alarm-ink transition-colors hover:bg-alarm/[0.08] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-alarm"
            title="Inject a 5 second outage"
          >
            Kill 5s
          </button>
        )}
        <span
          className="ml-1 h-2 w-2 shrink-0 rounded-[1px]"
          style={{ background: status }}
          title={`Utilization ${formatPercent(utilization)}`}
          aria-hidden="true"
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
          tone={metrics && metrics.errors > 0 ? 'text-alarm' : 'text-ink'}
        />
      </div>

      {!isGenerator ? (
        <div className="px-3 pt-2.5">
          <div className="flex items-baseline justify-between text-[10px] text-muted">
            <span>Utilization</span>
            <span className="font-mono tabular-nums text-ink">
              {formatPercent(utilization)}
            </span>
          </div>
          <div className="mt-1.5 h-1 overflow-hidden rounded-[1px] bg-rule">
            <div
              className="sim-utilization-fill h-full rounded-[1px]"
              style={{ width: `${Math.min(100, utilization * 100)}%`, background: status }}
            />
          </div>
        </div>
      ) : null}

      <div className="flex items-center justify-between px-3 pb-3 pt-2 font-mono text-[10px] tabular-nums text-muted">
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
        <Handle type="target" position={Position.Top} />
      ) : null}
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
