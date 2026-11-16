import type { Edge } from '@xyflow/react';
import type {
  ChallengeThresholds,
  ComponentConfig,
  GraphPayload,
  LoadProfile,
  NodeMetrics,
  ScheduledFault,
  SimulationUpdate,
} from '@/types';
import {
  evaluateSpikeChallenge,
  findBottleneck,
  type ChallengeResult,
} from './challenges';
import { SimulationEngine } from './engine';
import type { HistoryPoint, NodeHistoryPoint, SimNode } from './store';

export interface BenchmarkResult {
  breakpointRps: number;
  searchedMaxRps: number;
  capped: boolean;
  bottleneckName: string | null;
  p95AtBreak: number;
  errorRateAtBreak: number;
}

export interface FixCandidate {
  id: string;
  label: string;
  description: string;
  projected: ChallengeResult;
  nodes: SimNode[];
  edges: Edge[];
}

interface RunWindow {
  p95: number;
  errorRate: number;
  completedRps: number;
  generatedRps: number;
}

export function graphFromNodes(nodes: SimNode[], edges: Edge[]): GraphPayload {
  return {
    components: nodes.map((node) => ({ ...node.data.component })),
    edges: edges.map((edge) => ({ source: edge.source, target: edge.target })),
  };
}

export function runGraph(
  graph: GraphPayload,
  seed: number,
  profile: LoadProfile,
  ticks: number,
  faults: ScheduledFault[] = []
): SimulationUpdate[] {
  const engine = new SimulationEngine(graph, { seed, faults });
  engine.setLoadProfile(profile);
  return Array.from({ length: ticks }, () => engine.tick(1_000));
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function evaluateWindow(
  updates: SimulationUpdate[],
  startMs: number,
  endMs: number
): RunWindow {
  const samples = updates.filter(
    (update) => update.time > startMs && update.time <= endMs
  );
  return {
    p95: average(samples.map((update) => update.summary.p95Latency)),
    errorRate: average(samples.map((update) => update.summary.errorRate)),
    completedRps: average(samples.map((update) => update.summary.completedRps)),
    generatedRps: average(samples.map((update) => update.summary.generatedRps)),
  };
}

function withTargetRate(graph: GraphPayload, totalRps: number): GraphPayload {
  const generators = graph.components.filter(
    (component) => component.type === 'traffic-generator'
  );
  if (generators.length === 0) return graph;
  const perGenerator = totalRps / generators.length;
  return {
    ...graph,
    components: graph.components.map((component) =>
      component.type === 'traffic-generator'
        ? { ...component, throughputLimit: perGenerator }
        : component
    ),
  };
}

function passedWindow(window: RunWindow, thresholds: ChallengeThresholds): boolean {
  return (
    window.generatedRps > 0 &&
    window.p95 <= thresholds.maxP95LatencyMs &&
    window.errorRate <= thresholds.maxErrorRate
  );
}

/**
 * Binary-search the sustained rate where the architecture stops meeting its
 * latency and error targets. Runs are short and deterministic, so this stays
 * responsive enough to run from a click.
 */
export function findBreakingPoint(
  nodes: SimNode[],
  edges: Edge[],
  seed: number,
  thresholds: ChallengeThresholds,
  options: {
    minRps?: number;
    maxRps?: number;
    ticks?: number;
    faults?: ScheduledFault[];
  } = {}
): BenchmarkResult | null {
  const baseGraph = graphFromNodes(nodes, edges);
  if (
    baseGraph.components.every(
      (component) => component.type !== 'traffic-generator'
    )
  ) {
    return null;
  }

  const minRps = Math.max(5, options.minRps ?? 10);
  const maxRps = Math.max(minRps + 10, options.maxRps ?? 2_000);
  const ticks = Math.max(4, options.ticks ?? 6);
  const windowStart = (ticks - 3) * 1_000;
  const windowEnd = ticks * 1_000;

  let low = minRps;
  let high = maxRps;
  let firstFailure:
    | {
        rps: number;
        window: RunWindow;
        metrics: Record<string, NodeMetrics>;
        nodeHistory: Record<string, NodeHistoryPoint[]>;
      }
    | null = null;

  for (let iteration = 0; iteration < 9; iteration += 1) {
    const mid = Math.round((low + high) / 2);
    const updates = runGraph(
      withTargetRate(baseGraph, mid),
      seed,
      'steady',
      ticks,
      options.faults
    );
    const window = evaluateWindow(updates, windowStart, windowEnd);
    if (passedWindow(window, thresholds)) {
      low = mid;
    } else {
      high = mid;
      firstFailure = {
        rps: mid,
        window,
        metrics: updates[updates.length - 1]?.nodes ?? {},
        nodeHistory: nodeHistoryFromUpdates(updates),
      };
    }
  }

  const capped = low >= maxRps;
  const bottleneck =
    firstFailure !== null
      ? findBottleneck(nodes, firstFailure.metrics, firstFailure.nodeHistory)
      : null;

  return {
    breakpointRps: Math.floor(low / 5) * 5,
    searchedMaxRps: maxRps,
    capped,
    bottleneckName: bottleneck?.name ?? null,
    p95AtBreak: firstFailure?.window.p95 ?? 0,
    errorRateAtBreak: firstFailure?.window.errorRate ?? 0,
  };
}

function historyFromUpdates(updates: SimulationUpdate[]): HistoryPoint[] {
  return updates.map((update) => ({
    t: update.time,
    rps: update.summary.completedRps,
    generatedRps: update.summary.generatedRps,
    p50: update.summary.p50Latency,
    p95: update.summary.p95Latency,
    p99: update.summary.p99Latency,
    errorRate: update.summary.errorRate,
    avgLatency: update.summary.avgLatency,
  }));
}

function nodeHistoryFromUpdates(
  updates: SimulationUpdate[]
): Record<string, NodeHistoryPoint[]> {
  const result: Record<string, NodeHistoryPoint[]> = {};
  for (const update of updates) {
    for (const [id, metric] of Object.entries(update.nodes)) {
      const history = result[id] ?? [];
      result[id] = [
        ...history,
        {
          t: update.time,
          queueDepth: metric.queueDepth,
          utilization: metric.utilization,
          errors: metric.errors,
          dropped: metric.dropped,
          p95Latency: metric.p95Latency,
          cacheHitRate: metric.cacheHitRate,
          instances: metric.instances,
        },
      ];
    }
  }
  return result;
}

function evaluateGraph(
  nodes: SimNode[],
  edges: Edge[],
  seed: number,
  thresholds: ChallengeThresholds,
  faults: ScheduledFault[] = []
): ChallengeResult {
  const updates = runGraph(
    graphFromNodes(nodes, edges),
    seed,
    'spike',
    9,
    faults
  );
  const last = updates[updates.length - 1];
  return evaluateSpikeChallenge(
    historyFromUpdates(updates),
    last?.nodes ?? {},
    nodes,
    last?.summary ?? null,
    [],
    thresholds,
    nodeHistoryFromUpdates(updates)
  );
}

function cloneNodes(nodes: SimNode[]): SimNode[] {
  return nodes.map((node) => ({
    ...node,
    data: {
      ...node.data,
      component: { ...node.data.component },
    },
  }));
}

function nextNodeId(nodes: SimNode[], type: string): string {
  let index = 1;
  const existing = new Set(nodes.map((node) => node.id));
  while (existing.has(`fix-${type}-${index}`)) index += 1;
  return `fix-${type}-${index}`;
}

function insertCacheBefore(
  nodes: SimNode[],
  edges: Edge[],
  bottleneckId: string
): { nodes: SimNode[]; edges: Edge[] } | null {
  const incoming = edges.find((edge) => edge.target === bottleneckId);
  if (!incoming) return null;
  const source = nodes.find((node) => node.id === incoming.source);
  const target = nodes.find((node) => node.id === bottleneckId);
  if (!source || !target) return null;

  const cacheId = nextNodeId(nodes, 'cache');
  const cacheConfig: ComponentConfig = {
    id: cacheId,
    type: 'cache',
    name: 'Proposed Cache',
    throughputLimit: 2_000,
    latency: 0.5,
    failureRate: 0,
    queueCapacity: 2_000,
    cacheHitRate: 0.85,
  };
  const cacheNode: SimNode = {
    id: cacheId,
    type: 'cache',
    position: {
      x: (source.position.x + target.position.x) / 2,
      y: (source.position.y + target.position.y) / 2 - 90,
    },
    data: { component: cacheConfig },
  };

  const nextEdges = edges.filter((edge) => edge.id !== incoming.id);
  nextEdges.push(
    {
      id: `${incoming.source}-${cacheId}`,
      source: incoming.source,
      target: cacheId,
    },
    {
      id: `${cacheId}-${bottleneckId}`,
      source: cacheId,
      target: bottleneckId,
    }
  );

  return { nodes: [...nodes, cacheNode], edges: nextEdges };
}

/**
 * Headless counterfactuals: same graph shape, same seed, same traffic shape.
 * The projected metrics are estimates, but the ranking is consistent.
 */
export function buildFixCandidates(
  nodes: SimNode[],
  edges: Edge[],
  seed: number,
  thresholds: ChallengeThresholds,
  bottleneckId: string | null,
  faults: ScheduledFault[] = []
): FixCandidate[] {
  if (!bottleneckId) return [];
  const bottleneck = nodes.find((node) => node.id === bottleneckId);
  if (!bottleneck || bottleneck.data.component.type === 'traffic-generator') {
    return [];
  }

  const candidates: FixCandidate[] = [];

  const scale: SimNode[] = cloneNodes(nodes).map((node) =>
    node.id === bottleneckId
      ? {
          ...node,
          data: {
            ...node.data,
            component: {
              ...node.data.component,
              throughputLimit: node.data.component.throughputLimit * 2,
            },
          },
        }
      : node
  );
  candidates.push({
    id: 'scale-2x',
    label: 'Scale capacity 2×',
    description: `${bottleneck.data.component.name} gets double the capacity.`,
    projected: evaluateGraph(scale, edges, seed, thresholds, faults),
    nodes: scale,
    edges,
  });

  const queue: SimNode[] = cloneNodes(nodes).map((node) =>
    node.id === bottleneckId
      ? {
          ...node,
          data: {
            ...node.data,
            component: {
              ...node.data.component,
              queueCapacity: Math.max(
                10,
                Math.round(node.data.component.queueCapacity * 2)
              ),
            },
          },
        }
      : node
  );
  candidates.push({
    id: 'queue-2x',
    label: 'Double the queue',
    description: 'Absorb bursts for longer before dropping requests.',
    projected: evaluateGraph(queue, edges, seed, thresholds, faults),
    nodes: queue,
    edges,
  });

  if (bottleneck.data.component.type === 'database') {
    const replicas: SimNode[] = cloneNodes(nodes).map((node) =>
      node.id === bottleneckId
        ? {
            ...node,
            data: {
              ...node.data,
              component: {
                ...node.data.component,
                replicas: Math.min(
                  10,
                  (node.data.component.replicas ?? 1) + 1
                ),
              },
            },
          }
        : node
    );
    candidates.push({
      id: 'add-replica',
      label: 'Add a database replica',
      description: 'Spread reads across one more replica.',
      projected: evaluateGraph(replicas, edges, seed, thresholds, faults),
      nodes: replicas,
      edges,
    });
  } else if (bottleneck.data.component.type === 'service') {
    const autoscale: SimNode[] = cloneNodes(nodes).map((node) =>
      node.id === bottleneckId
        ? {
            ...node,
            data: {
              ...node.data,
              component: {
                ...node.data.component,
                autoscaling: true,
                minInstances: Math.max(
                  1,
                  node.data.component.minInstances ?? 1
                ),
                maxInstances: Math.max(
                  2,
                  node.data.component.maxInstances ?? 4
                ),
              },
            },
          }
        : node
    );
    candidates.push({
      id: 'enable-autoscaling',
      label: 'Enable autoscaling',
      description: 'Add instances when utilization stays above 82%.',
      projected: evaluateGraph(autoscale, edges, seed, thresholds, faults),
      nodes: autoscale,
      edges,
    });
  }

  if (bottleneck.data.component.type !== 'cache') {
    const cached = insertCacheBefore(nodes, edges, bottleneckId);
    if (cached) {
      candidates.push({
        id: 'add-cache',
        label: 'Add a cache in front',
        description: 'Serve hot reads before they reach the bottleneck.',
        projected: evaluateGraph(
          cached.nodes,
          cached.edges,
          seed,
          thresholds,
          faults
        ),
        nodes: cached.nodes,
        edges: cached.edges,
      });
    }
  }

  return candidates
    .sort((a, b) => {
      if (a.projected.passed !== b.projected.passed) {
        return a.projected.passed ? -1 : 1;
      }
      return a.projected.p95Latency - b.projected.p95Latency;
    })
    .slice(0, 4);
}

export function summarizeBenchmark(result: BenchmarkResult): string {
  const rate = result.capped
    ? `>${result.searchedMaxRps}`
    : `${result.breakpointRps}`;
  return `${rate} rps`;
}
