'use client';

import { Handle, NodeProps, Position } from '@xyflow/react';
import {
  COMPONENT_META,
  SimNode,
  useSimulationStore,
  type NodeHistoryPoint,
} from '@/lib/store';
import { injectOutage } from '@/lib/simulationClient';
import { formatLatency, formatPercent, formatRate } from '@/lib/format';
import type { ComponentConfig } from '@/types';
import ComponentIcon from './ComponentIcon';

function statusColor(utilization: number, errors: number, down = false): string {
  if (down) return 'var(--alarm)';
  if (errors > 0) return 'var(--alarm)';
  if (utilization > 0.9) return 'var(--alarm)';
  if (utilization > 0.7) return 'var(--warning)';
  return 'var(--live)';
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="truncate text-[9px] leading-3 text-muted">{label}</div>
      <div className="mt-0.5 truncate font-mono text-[11px] font-semibold leading-4 tabular-nums text-ink">
        {value}
      </div>
    </div>
  );
}

function semantics(component: ComponentConfig): string | null {
  if (component.type === 'cache') {
    return `hit ${formatPercent(component.cacheHitRate ?? 0, 0)}`;
  }
  if (component.type === 'database' && (component.replicas ?? 1) > 1) {
    return `${component.replicas} replicas`;
  }
  if (component.type === 'service' && component.autoscaling) {
    return `auto ${component.minInstances ?? 1}–${component.maxInstances ?? 4}`;
  }
  if (component.type === 'load-balancer') {
    return component.lbStrategy === 'least-load'
      ? 'least-load'
      : component.lbStrategy === 'round-robin'
        ? 'round-robin'
        : 'random';
  }
  return null;
}

export default function BaseNode({ id, data, selected }: NodeProps<SimNode>) {
  const metrics = useSimulationStore((state) => state.metricsById[id]);
  const history = useSimulationStore(
    (state) => state.nodeHistory[id] as NodeHistoryPoint[] | undefined
  );

  const component: ComponentConfig = data.component;
  const meta = COMPONENT_META[component.type];
  const isGenerator = component.type === 'traffic-generator';
  const isCache = component.type === 'cache';

  const utilization = metrics?.utilization ?? 0;
  const down = metrics?.down ?? false;
  const status = statusColor(utilization, metrics?.errors ?? 0, down);
  const peakQueue = history
    ? Math.max(...history.map((point) => point.queueDepth))
    : (metrics?.queueDepth ?? 0);
  const instanceCount = metrics?.instances ?? component.minInstances ?? 1;
  const note = semantics(component);

  return (
    <div
      className={`sim-node relative w-[208px] transition-shadow ${
        selected ? 'sim-node-selected' : ''
      }`}
    >
      <div className="flex items-center gap-2 border-b border-rule px-2.5 py-2">
        <span
          className="grid h-6 w-6 shrink-0 place-items-center rounded-[2px] border bg-surface"
          style={{ borderColor: `${meta.color}66`, color: meta.color }}
          aria-hidden="true"
        >
          <ComponentIcon type={component.type} size={14} />
        </span>
        <span
          className="min-w-0 flex-1 truncate text-[12px] font-semibold leading-tight tracking-[0.01em] text-ink"
          title={component.name}
        >
          {component.name}
        </span>
        {down ? (
          <span className="shrink-0 animate-pulse rounded-[2px] bg-alarm/10 px-1 py-0.5 font-mono text-[8px] font-bold uppercase tracking-[0.06em] text-alarm-ink">
            Down
          </span>
        ) : (
          <span
            className="h-2 w-2 shrink-0 rounded-[1px]"
            style={{ background: status }}
            title={`Utilization ${formatPercent(utilization)}`}
            aria-hidden="true"
          />
        )}
      </div>

      <div className="grid grid-cols-2 gap-x-2.5 gap-y-2 px-2.5 py-2.5">
        {isGenerator ? (
          <>
            <Detail label="Target" value={`${formatRate(component.throughputLimit)}/s`} />
            <Detail
              label="Delivered"
              value={`${formatRate(metrics?.requestsOut ?? 0)}/s`}
            />
          </>
        ) : (
          <>
            <Detail
              label="Capacity"
              value={`${formatRate(
                component.throughputLimit *
                  (component.replicas ?? 1) *
                  (component.autoscaling ? instanceCount : 1)
              )}/s`}
            />
            <Detail
              label="Queue"
              value={`${metrics?.queueDepth ?? 0}/${component.queueCapacity}`}
            />
          </>
        )}
      </div>

      {!isGenerator ? (
        <div className="px-2.5 pb-2">
          <div className="flex items-baseline justify-between text-[9px] text-muted">
            <span>
              util{' '}
              <span className="font-mono tabular-nums text-ink">
                {formatPercent(utilization, 0)}
              </span>
            </span>
            {isCache ? (
              <span className="font-mono tabular-nums text-ink">
                {formatPercent(metrics?.cacheHitRate ?? 0, 0)} hit
              </span>
            ) : component.type === 'service' && component.autoscaling ? (
              <span className="font-mono tabular-nums text-ink">
                ×{instanceCount} inst
              </span>
            ) : (
              <span className="font-mono tabular-nums text-muted">
                p95 {formatLatency(metrics?.p95Latency ?? 0)}
              </span>
            )}
          </div>
          <div className="mt-1 h-1 overflow-hidden rounded-[1px] bg-rule">
            <div
              className="sim-utilization-fill h-full rounded-[1px]"
              style={{
                width: `${Math.min(100, utilization * 100)}%`,
                background: status,
              }}
            />
          </div>
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-2 border-t border-rule px-2.5 py-1.5 font-mono text-[9px] tabular-nums text-muted">
        <span className="truncate">
          {note ?? (isGenerator ? `peak queue ${peakQueue}` : `peak q ${peakQueue}`)}
        </span>
        <button
          type="button"
          aria-label={`Inject a 5 second outage on ${component.name}`}
          onClick={(event) => {
            event.stopPropagation();
            injectOutage(id, 5000);
          }}
          className="nodrag shrink-0 rounded-[2px] border border-alarm/30 px-1.5 py-0.5 font-mono text-[8px] font-semibold uppercase tracking-[0.04em] text-alarm-ink transition-colors hover:bg-alarm/[0.08] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-alarm"
          title="Inject a 5 second outage"
        >
          Kill
        </button>
      </div>

      {!isGenerator ? <Handle type="target" position={Position.Top} /> : null}
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
