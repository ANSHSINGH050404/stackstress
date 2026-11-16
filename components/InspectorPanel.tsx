'use client';

import { useSimulationStore, COMPONENT_META, type SimNode } from '@/lib/store';
import { injectOutage } from '@/lib/simulationClient';
import { componentCostPerHour, formatCost } from '@/lib/components';
import { formatLatency, formatPercent, formatRate } from '@/lib/format';
import type {
  ComponentConfig,
  LoadBalancerStrategy,
} from '@/types';
import ComponentIcon from './nodes/ComponentIcon';
import Sparkline from './Sparkline';

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
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-[10px] text-muted">{label}</span>
      <span className="flex min-h-8 items-center gap-1 rounded-[2px] border border-control bg-surface px-2 focus-within:border-live focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-live">
        <input
          type="number"
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          className="w-full min-w-0 bg-transparent py-1 font-mono text-[12px] font-medium text-ink outline-none"
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

function Toggle({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  hint?: string;
}) {
  return (
    <label className="flex min-h-9 cursor-pointer items-center justify-between gap-3 rounded-[2px] border border-rule bg-paper px-2.5 py-1.5">
      <span className="min-w-0">
        <span className="block text-[11px] font-medium text-ink">{label}</span>
        {hint ? (
          <span className="block text-[9px] leading-3 text-muted">{hint}</span>
        ) : null}
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 shrink-0 accent-[var(--live)]"
      />
    </label>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 border-t border-rule py-1.5">
      <div className="truncate text-[9px] text-muted">{label}</div>
      <div className="mt-0.5 truncate font-mono text-[12px] font-semibold tabular-nums text-ink">
        {value}
      </div>
    </div>
  );
}

function NameField({ node }: { node: SimNode }) {
  const updateNodeData = useSimulationStore((state) => state.updateNodeData);

  const commit = (raw: string) => {
    const trimmed = raw.trim();
    if (trimmed && trimmed !== node.data.component.name) {
      updateNodeData(node.id, { name: trimmed });
    }
  };

  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] text-muted">Name</span>
      <input
        key={`${node.id}:${node.data.component.name}`}
        type="text"
        defaultValue={node.data.component.name}
        maxLength={80}
        onBlur={(event) => commit(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.currentTarget.blur();
          }
        }}
        className="min-h-8 rounded-[2px] border border-control bg-surface px-2 text-[12px] font-semibold text-ink focus:border-live focus:outline-2 focus:outline-offset-1 focus:outline-live"
      />
    </label>
  );
}

const LB_OPTIONS: Array<{ value: LoadBalancerStrategy; label: string }> = [
  { value: 'least-load', label: 'Least load' },
  { value: 'round-robin', label: 'Round robin' },
  { value: 'random', label: 'Random' },
];

export default function InspectorPanel() {
  const selectedNodeId = useSimulationStore((state) => state.selectedNodeId);
  const node = useSimulationStore((state) =>
    state.nodes.find((candidate) => candidate.id === state.selectedNodeId)
  );
  const metrics = useSimulationStore((state) =>
    selectedNodeId ? state.metricsById[selectedNodeId] : undefined
  );
  const history = useSimulationStore((state) =>
    selectedNodeId ? state.nodeHistory[selectedNodeId] : undefined
  );
  const updateNodeData = useSimulationStore((state) => state.updateNodeData);
  const selectNode = useSimulationStore((state) => state.selectNode);
  const duplicateNode = useSimulationStore((state) => state.duplicateNode);
  const removeNode = useSimulationStore((state) => state.removeNode);

  if (!node) return null;

  const component: ComponentConfig = node.data.component;
  const meta = COMPONENT_META[component.type];
  const isGenerator = component.type === 'traffic-generator';
  const isCache = component.type === 'cache';
  const isBalancer = component.type === 'load-balancer';
  const isDatabase = component.type === 'database';
  const isService = component.type === 'service';
  const set = (patch: Partial<ComponentConfig>) =>
    updateNodeData(node.id, patch);

  return (
    <aside
      aria-labelledby="inspector-title"
      className="absolute right-3 top-3 z-20 flex max-h-[calc(100%-1.5rem)] w-[min(318px,calc(100%-1.5rem))] flex-col overflow-hidden border border-rule-strong bg-surface shadow-[3px_3px_0_rgba(21,34,44,0.09)]"
    >
      <header className="flex shrink-0 items-center gap-2 border-b border-rule bg-paper px-3 py-2.5">
        <span
          className="grid h-7 w-7 shrink-0 place-items-center rounded-[2px] border bg-surface"
          style={{ borderColor: `${meta.color}66`, color: meta.color }}
          aria-hidden="true"
        >
          <ComponentIcon type={component.type} size={16} />
        </span>
        <span className="min-w-0 flex-1">
          <span
            id="inspector-title"
            className="block font-mono text-[9px] uppercase tracking-[0.08em] text-muted"
          >
            Inspector · {meta.label}
          </span>
          <span className="block truncate text-[12px] font-semibold text-ink">
            {component.name}
          </span>
        </span>
        <button
          type="button"
          onClick={() => selectNode(null)}
          aria-label="Close inspector"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-[2px] border border-rule text-[14px] leading-none text-muted transition-colors hover:bg-surface hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-live"
        >
          ×
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3">
        <NameField node={node} />

        <div className="mt-2.5 grid grid-cols-2 gap-x-2 gap-y-2.5">
          {isGenerator ? (
            <div className="col-span-2">
              <NumberField
                label="Target rate"
                value={component.throughputLimit}
                suffix="rps"
                step={10}
                max={100_000}
                onChange={(value) => set({ throughputLimit: value })}
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
                onChange={(value) => set({ throughputLimit: value })}
              />
              <NumberField
                label="Latency"
                value={component.latency}
                suffix="ms"
                step={1}
                max={60_000}
                onChange={(value) => set({ latency: value })}
              />
              <NumberField
                label="Failures"
                value={Math.round(component.failureRate * 100)}
                suffix="%"
                max={100}
                onChange={(value) => set({ failureRate: value / 100 })}
              />
              <NumberField
                label="Queue"
                value={component.queueCapacity}
                suffix="req"
                step={10}
                max={1_000_000}
                onChange={(value) =>
                  set({ queueCapacity: Math.round(value) })
                }
              />
            </>
          )}

          {isCache ? (
            <NumberField
              label="Hit rate"
              value={Math.round((component.cacheHitRate ?? 0) * 100)}
              suffix="%"
              max={100}
              onChange={(value) => set({ cacheHitRate: value / 100 })}
            />
          ) : null}

          {isDatabase ? (
            <NumberField
              label="Replicas"
              value={component.replicas ?? 1}
              suffix="db"
              min={1}
              max={10}
              onChange={(value) => set({ replicas: Math.round(value) })}
            />
          ) : null}

          {isService ? (
            <NumberField
              label="Retries"
              value={component.retries ?? 0}
              suffix="×"
              min={0}
              max={3}
              onChange={(value) => set({ retries: Math.round(value) })}
            />
          ) : null}
        </div>

        {isBalancer ? (
          <div className="mt-3 space-y-2">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] text-muted">Balancing</span>
              <select
                value={component.lbStrategy ?? 'least-load'}
                onChange={(event) =>
                  set({
                    lbStrategy: event.target.value as LoadBalancerStrategy,
                  })
                }
                className="min-h-8 rounded-[2px] border border-control bg-surface px-2 text-[12px] text-ink focus:border-live focus:outline-2 focus:outline-offset-1 focus:outline-live"
              >
                {LB_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <Toggle
              label="Health checks"
              hint="Skip targets that are down"
              checked={component.healthChecks ?? true}
              onChange={(checked) => set({ healthChecks: checked })}
            />
          </div>
        ) : null}

        {isService ? (
          <div className="mt-3 space-y-2">
            <Toggle
              label="Autoscaling"
              hint="Scale up above 82% utilization"
              checked={component.autoscaling ?? false}
              onChange={(checked) => set({ autoscaling: checked })}
            />
            {component.autoscaling ? (
              <div className="grid grid-cols-2 gap-2">
                <NumberField
                  label="Min instances"
                  value={component.minInstances ?? 1}
                  suffix="×"
                  min={1}
                  max={10}
                  onChange={(value) =>
                    set({ minInstances: Math.round(value) })
                  }
                />
                <NumberField
                  label="Max instances"
                  value={component.maxInstances ?? 4}
                  suffix="×"
                  min={1}
                  max={10}
                  onChange={(value) =>
                    set({ maxInstances: Math.round(value) })
                  }
                />
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="mt-3 grid grid-cols-3 gap-x-2">
          <Metric
            label={isGenerator ? 'delivered' : 'in'}
            value={`${formatRate(
              isGenerator ? (metrics?.requestsOut ?? 0) : (metrics?.requestsIn ?? 0)
            )}/s`}
          />
          <Metric
            label="p95"
            value={formatLatency(metrics?.p95Latency ?? 0)}
          />
          <Metric
            label="errors"
            value={`${formatRate(metrics?.errors ?? 0)}/s`}
          />
          <Metric
            label="queue"
            value={`${metrics?.queueDepth ?? 0}/${component.queueCapacity}`}
          />
          <Metric
            label="util"
            value={formatPercent(metrics?.utilization ?? 0, 0)}
          />
          <Metric label="cost" value={formatCost(componentCostPerHour(component))} />
        </div>

        {isCache ? (
          <p className="mt-2 border-t border-rule pt-2 text-[10px] leading-relaxed text-muted">
            {formatPercent(metrics?.cacheHitRate ?? 0)} of requests served from
            cache ({metrics?.cacheHits ?? 0} hits / {metrics?.cacheMisses ?? 0}{' '}
            misses last tick).
          </p>
        ) : null}

        {isService && component.autoscaling ? (
          <p className="mt-2 border-t border-rule pt-2 text-[10px] leading-relaxed text-muted">
            Running {metrics?.instances ?? component.minInstances ?? 1} of{' '}
            {component.maxInstances ?? 4} instances. Scaling has a 2.5s cooldown.
          </p>
        ) : null}

        {history && history.length > 1 ? (
          <div className="mt-2 border-t border-rule pt-2">
            <div className="flex items-baseline justify-between text-[9px] text-muted">
              <span>Queue depth · last {history.length}s</span>
              <span className="font-mono text-ink">
                peak {Math.max(...history.map((point) => point.queueDepth))}
              </span>
            </div>
            <Sparkline
              values={history.map((point) => point.queueDepth)}
              color="var(--data)"
              height={28}
              className="mt-1 h-7 w-full"
              label={`Queue depth history for ${component.name}`}
            />
          </div>
        ) : null}
      </div>

      <footer className="grid shrink-0 grid-cols-3 divide-x divide-rule border-t border-rule">
        <button
          type="button"
          onClick={() => duplicateNode(node.id)}
          className="min-h-10 px-2 py-2 text-[10px] font-medium text-muted transition-colors hover:bg-paper hover:text-ink focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-live"
        >
          Duplicate
        </button>
        <button
          type="button"
          onClick={() => injectOutage(node.id, 5000)}
          className="min-h-10 px-2 py-2 text-[10px] font-medium text-alarm-ink transition-colors hover:bg-alarm/[0.06] focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-alarm"
        >
          Kill 5s
        </button>
        <button
          type="button"
          onClick={() => removeNode(node.id)}
          className="min-h-10 px-2 py-2 text-[10px] font-medium text-muted transition-colors hover:bg-alarm/[0.06] hover:text-alarm-ink focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-live"
        >
          Delete
        </button>
      </footer>
    </aside>
  );
}
