import type {
  ComponentConfig,
  ChallengeThresholds,
  NodeMetrics,
  RequestTrace,
  SimulationSummary,
} from '@/types';
import { componentCostPerHour } from './components';
import type { HistoryPoint, NodeHistoryPoint, SimNode } from './store';

export const SPIKE_CHALLENGE_DURATION_MS = 9_000;
export const SPIKE_WINDOW_START_MS = 6_000;
export const SPIKE_WINDOW_END_MS = 9_000;
export const DEFAULT_CHALLENGE_THRESHOLDS: ChallengeThresholds = {
  maxP95LatencyMs: 800,
  maxErrorRate: 0.05,
};

export type ChallengePhase = 'ready' | 'running' | 'complete';

export interface ChallengeEvidence {
  nodeId: string;
  nodeName: string;
  peakQueueDepth: number;
  peakUtilization: number;
  dropped: number;
  firstFailureAt: number | null;
}

export interface ChallengeResult {
  passed: boolean;
  p95Latency: number;
  errorRate: number;
  completedRps: number;
  generatedRps: number;
  dropped: number;
  costPerHour: number;
  maxCostPerHour?: number;
  bottleneckId: string | null;
  bottleneckName: string | null;
  canScaleBottleneck: boolean;
  representativeTrace: RequestTrace | null;
  evidence: ChallengeEvidence[];
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function findBottleneck(
  nodes: SimNode[],
  metricsById: Record<string, NodeMetrics>,
  nodeHistory: Record<string, NodeHistoryPoint[]> = {}
): { id: string; name: string; canScale: boolean } | null {
  let bottleneck: { id: string; name: string; score: number; canScale: boolean } | null =
    null;

  for (const node of nodes) {
    const component = node.data.component;
    const metrics = metricsById[node.id];
    if (!metrics || component.type === 'traffic-generator') continue;

    const history = nodeHistory[node.id] ?? [];
    const peakQueueDepth =
      history.length > 0
        ? Math.max(...history.map((point) => point.queueDepth))
        : metrics.queueDepth;
    const peakUtilization =
      history.length > 0
        ? Math.max(...history.map((point) => point.utilization))
        : metrics.utilization;
    const dropped =
      history.length > 0
        ? history.reduce((sum, point) => sum + point.dropped, 0)
        : metrics.dropped;
    const errors =
      history.length > 0
        ? history.reduce((sum, point) => sum + point.errors, 0)
        : metrics.errors;

    const score =
      dropped * 10 + errors * 2 + peakQueueDepth + peakUtilization * 100;
    if (score <= 0 || (bottleneck && score <= bottleneck.score)) continue;

    bottleneck = {
      id: node.id,
      name: component.name,
      score,
      canScale:
        !metrics.down &&
        (dropped > 0 || peakQueueDepth > 0 || peakUtilization >= 0.7),
    };
  }

  return bottleneck;
}

function buildEvidence(
  nodes: SimNode[],
  metricsById: Record<string, NodeMetrics>,
  nodeHistory: Record<string, NodeHistoryPoint[]>
): ChallengeEvidence[] {
  return nodes
    .map((node) => {
      const metrics = metricsById[node.id];
      if (!metrics || node.data.component.type === 'traffic-generator') {
        return null;
      }

      const history = nodeHistory[node.id] ?? [];
      let peakQueueDepth = metrics.queueDepth;
      let peakUtilization = metrics.utilization;
      let dropped = metrics.dropped;
      let firstFailureAt: number | null = null;

      if (history.length > 0) {
        peakQueueDepth = Math.max(...history.map((point) => point.queueDepth));
        peakUtilization = Math.max(
          ...history.map((point) => point.utilization)
        );
        dropped = history.reduce((sum, point) => sum + point.dropped, 0);
        const failure = history.find(
          (point) => point.dropped > 0 || point.errors > 0
        );
        firstFailureAt = failure?.t ?? null;
      } else if (metrics.dropped > 0 || metrics.errors > 0) {
        firstFailureAt = null;
      }

      const score =
        dropped * 10 +
        peakQueueDepth * 2 +
        peakUtilization * 100 +
        (metrics.errors ?? 0) * 2;
      if (score <= 0) return null;

      return {
        nodeId: node.id,
        nodeName: node.data.component.name,
        peakQueueDepth,
        peakUtilization,
        dropped,
        firstFailureAt,
        score,
      };
    })
    .filter(
      (
        value
      ): value is ChallengeEvidence & {
        score: number;
      } => value !== null
    )
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((value) => ({
      nodeId: value.nodeId,
      nodeName: value.nodeName,
      peakQueueDepth: value.peakQueueDepth,
      peakUtilization: value.peakUtilization,
      dropped: value.dropped,
      firstFailureAt: value.firstFailureAt,
    }));
}

function scenarioCost(
  nodes: SimNode[],
  metricsById: Record<string, NodeMetrics>
): number {
  return nodes.reduce((sum, node) => {
    const instances = metricsById[node.id]?.instances;
    return (
      sum +
      componentCostPerHour(
        node.data.component,
        instances ?? node.data.component.minInstances ?? 1
      )
    );
  }, 0);
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
  requestTraces: readonly RequestTrace[] = [],
  thresholds: ChallengeThresholds = DEFAULT_CHALLENGE_THRESHOLDS,
  nodeHistory: Record<string, NodeHistoryPoint[]> = {}
): ChallengeResult {
  const spikeSamples = history.filter(
    (point) => point.t > SPIKE_WINDOW_START_MS && point.t <= SPIKE_WINDOW_END_MS
  );
  const p95Latency = average(spikeSamples.map((point) => point.p95));
  const errorRate = average(spikeSamples.map((point) => point.errorRate));
  const completedRps = average(spikeSamples.map((point) => point.rps));
  const generatedRps = average(spikeSamples.map((point) => point.generatedRps));
  const bottleneck = findBottleneck(nodes, metricsById, nodeHistory);
  const costPerHour = scenarioCost(nodes, metricsById);
  const costExceeded =
    thresholds.maxCostPerHour !== undefined &&
    costPerHour > thresholds.maxCostPerHour;
  const passed =
    generatedRps > 0 &&
    p95Latency <= thresholds.maxP95LatencyMs &&
    errorRate <= thresholds.maxErrorRate &&
    !costExceeded;
  const failedErrorBudget = errorRate > thresholds.maxErrorRate;
  const failedLatencyTarget = p95Latency > thresholds.maxP95LatencyMs;

  return {
    passed,
    p95Latency,
    errorRate,
    completedRps,
    generatedRps,
    dropped: summary?.totalDropped ?? 0,
    costPerHour,
    maxCostPerHour: thresholds.maxCostPerHour,
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
    evidence: buildEvidence(nodes, metricsById, nodeHistory),
  };
}

export function scaleComponentCapacity(component: ComponentConfig): number {
  return Math.min(100_000, Math.max(1, component.throughputLimit) * 4);
}
