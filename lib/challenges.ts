import type {
  ComponentConfig,
  NodeMetrics,
  RequestTrace,
  SimulationSummary,
} from '@/types';
import type { HistoryPoint, SimNode } from './store';

export const SPIKE_CHALLENGE_DURATION_MS = 9_000;
export const SPIKE_WINDOW_START_MS = 6_000;
export const SPIKE_WINDOW_END_MS = 9_000;
export const CHALLENGE_MAX_P95_MS = 800;
export const CHALLENGE_MAX_ERROR_RATE = 0.05;

export type ChallengePhase = 'ready' | 'running' | 'complete';

export interface ChallengeResult {
  passed: boolean;
  p95Latency: number;
  errorRate: number;
  completedRps: number;
  generatedRps: number;
  dropped: number;
  bottleneckId: string | null;
  bottleneckName: string | null;
  canScaleBottleneck: boolean;
  representativeTrace: RequestTrace | null;
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function findBottleneck(
  nodes: SimNode[],
  metricsById: Record<string, NodeMetrics>
): { id: string; name: string; canScale: boolean } | null {
  let bottleneck: { id: string; name: string; score: number; canScale: boolean } | null =
    null;

  for (const node of nodes) {
    const component = node.data.component;
    const metrics = metricsById[node.id];
    if (!metrics || component.type === 'traffic-generator') continue;

    const score =
      metrics.dropped * 10 +
      metrics.errors * 2 +
      metrics.queueDepth +
      metrics.utilization * 100;
    if (score <= 0 || (bottleneck && score <= bottleneck.score)) continue;

    bottleneck = {
      id: node.id,
      name: component.name,
      score,
      canScale:
        !metrics.down &&
        (metrics.dropped > 0 || metrics.queueDepth > 0 || metrics.utilization >= 0.7),
    };
  }

  return bottleneck;
}

function selectSlowestTrace(traces: readonly RequestTrace[]): RequestTrace | null {
  let slowest: RequestTrace | null = null;

  for (const trace of traces) {
    if (
      !slowest ||
      trace.totalObservedLatencyMs > slowest.totalObservedLatencyMs ||
      (trace.totalObservedLatencyMs === slowest.totalObservedLatencyMs &&
        (trace.terminalAt < slowest.terminalAt ||
          (trace.terminalAt === slowest.terminalAt &&
            trace.requestId < slowest.requestId)))
    ) {
      slowest = trace;
    }
  }

  return slowest;
}

function selectFailedTrace(traces: readonly RequestTrace[]): RequestTrace | null {
  let selected: RequestTrace | null = null;

  for (const trace of traces) {
    if (trace.outcome === 'completed') continue;
    if (
      !selected ||
      (trace.outcome === 'failed' && selected.outcome === 'dropped') ||
      (trace.outcome === selected.outcome &&
        (trace.totalObservedLatencyMs > selected.totalObservedLatencyMs ||
          (trace.totalObservedLatencyMs === selected.totalObservedLatencyMs &&
            (trace.terminalAt < selected.terminalAt ||
              (trace.terminalAt === selected.terminalAt &&
                trace.requestId < selected.requestId)))))
    ) {
      selected = trace;
    }
  }

  return selected;
}

function selectRepresentativeTrace(
  traces: readonly RequestTrace[],
  bottleneckId: string | null,
  errorBudgetFailed: boolean,
  latencyTargetFailed: boolean
): RequestTrace | null {
  const eligible = traces.filter(
    (trace) =>
      trace.terminalAt > SPIKE_WINDOW_START_MS &&
      trace.terminalAt <= SPIKE_WINDOW_END_MS
  );
  if (eligible.length === 0) return null;

  const bottleneckTraces = bottleneckId
    ? eligible.filter((trace) =>
        trace.hops.some((hop) => hop.componentId === bottleneckId)
      )
    : [];

  if (bottleneckTraces.length > 0) {
    if (errorBudgetFailed) {
      return (
        selectFailedTrace(bottleneckTraces) ??
        selectSlowestTrace(bottleneckTraces)
      );
    }
    return selectSlowestTrace(bottleneckTraces);
  }

  if (errorBudgetFailed) {
    const failedTrace = selectFailedTrace(eligible);
    if (failedTrace) return failedTrace;
  }

  return latencyTargetFailed ? selectSlowestTrace(eligible) : null;
}

export function evaluateSpikeChallenge(
  history: HistoryPoint[],
  metricsById: Record<string, NodeMetrics>,
  nodes: SimNode[],
  summary: SimulationSummary | null,
  requestTraces: readonly RequestTrace[] = []
): ChallengeResult {
  const spikeSamples = history.filter(
    (point) => point.t > SPIKE_WINDOW_START_MS && point.t <= SPIKE_WINDOW_END_MS
  );
  const p95Latency = average(spikeSamples.map((point) => point.p95));
  const errorRate = average(spikeSamples.map((point) => point.errorRate));
  const completedRps = average(spikeSamples.map((point) => point.rps));
  const generatedRps = average(spikeSamples.map((point) => point.generatedRps));
  const bottleneck = findBottleneck(nodes, metricsById);
  const passed =
    generatedRps > 0 &&
    p95Latency <= CHALLENGE_MAX_P95_MS &&
    errorRate <= CHALLENGE_MAX_ERROR_RATE;
  const failedErrorBudget = errorRate > CHALLENGE_MAX_ERROR_RATE;
  const failedLatencyTarget = p95Latency > CHALLENGE_MAX_P95_MS;

  return {
    passed,
    p95Latency,
    errorRate,
    completedRps,
    generatedRps,
    dropped: summary?.totalDropped ?? 0,
    bottleneckId: bottleneck?.id ?? null,
    bottleneckName: bottleneck?.name ?? null,
    canScaleBottleneck: bottleneck?.canScale ?? false,
    representativeTrace: passed
      ? null
      : selectRepresentativeTrace(
          requestTraces,
          bottleneck?.id ?? null,
          failedErrorBudget,
          failedLatencyTarget
        ),
  };
}

export function scaleComponentCapacity(component: ComponentConfig): number {
  return Math.min(100_000, Math.max(1, component.throughputLimit) * 4);
}
