import type { ComponentConfig, NodeMetrics, SimulationSummary } from '@/types';
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

export function evaluateSpikeChallenge(
  history: HistoryPoint[],
  metricsById: Record<string, NodeMetrics>,
  nodes: SimNode[],
  summary: SimulationSummary | null
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
  };
}

export function scaleComponentCapacity(component: ComponentConfig): number {
  return Math.min(100_000, Math.max(1, component.throughputLimit) * 4);
}
