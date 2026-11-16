import type { Edge } from '@xyflow/react';
import type {
  ChallengeThresholds,
  ComponentConfig,
  ComponentType,
  LoadProfile,
  ScheduledFault,
} from '@/types';
import { COMPONENT_DEFAULTS, type SimNode } from './store';

export type ScenarioKind = 'template' | 'chaos';

export interface ScenarioDefinition {
  id: string;
  kind: ScenarioKind;
  name: string;
  description: string;
  tag: string;
  loadProfile: LoadProfile;
  seed: number;
  thresholds: ChallengeThresholds;
  nodes: SimNode[];
  edges: Edge[];
  faults?: ScheduledFault[];
}

function node(
  id: string,
  type: ComponentType,
  name: string,
  x: number,
  y: number,
  overrides: Partial<ComponentConfig> = {}
): SimNode {
  return {
    id,
    type,
    position: { x, y },
    data: {
      component: {
        id,
        name,
        ...COMPONENT_DEFAULTS[type],
        ...overrides,
      },
    },
  };
}

function edge(source: string, target: string): Edge {
  return { id: `${source}-${target}`, source, target };
}

const thresholds: ChallengeThresholds = {
  maxP95LatencyMs: 800,
  maxErrorRate: 0.05,
};

const baseNodes: SimNode[] = [
  node('gen', 'traffic-generator', 'Traffic Generator', 40, 180, {
    throughputLimit: 120,
  }),
  node('lb', 'load-balancer', 'Edge Balancer', 280, 180),
  node('svc-a', 'service', 'API Service', 520, 180, {
    throughputLimit: 180,
    latency: 15,
    queueCapacity: 240,
  }),
  node('db', 'database', 'Primary DB', 760, 180, {
    throughputLimit: 120,
    latency: 25,
    queueCapacity: 100,
  }),
];

const baseEdges: Edge[] = [
  edge('gen', 'lb'),
  edge('lb', 'svc-a'),
  edge('svc-a', 'db'),
];

export const SCENARIOS: ScenarioDefinition[] = [
  {
    id: 'three-tier',
    kind: 'template',
    name: 'Three-tier with cache',
    description:
      'A classic web stack with a cache in front of the database. Watch hits shield the DB.',
    tag: 'Starter',
    loadProfile: 'steady',
    seed: 20261116,
    thresholds,
    nodes: [
      node('gen', 'traffic-generator', 'Traffic Generator', 40, 180, {
        throughputLimit: 120,
      }),
      node('lb', 'load-balancer', 'Edge Balancer', 280, 180),
      node('svc-a', 'service', 'API Service', 520, 180, {
        throughputLimit: 180,
        queueCapacity: 240,
      }),
      node('cache', 'cache', 'Read Cache', 760, 180, {
        cacheHitRate: 0.86,
        throughputLimit: 2_000,
        queueCapacity: 2_000,
      }),
      node('db', 'database', 'Primary DB', 1_000, 180, {
        throughputLimit: 120,
        latency: 25,
        queueCapacity: 100,
      }),
    ],
    edges: [
      edge('gen', 'lb'),
      edge('lb', 'svc-a'),
      edge('svc-a', 'cache'),
      edge('cache', 'db'),
    ],
  },
  {
    id: 'read-scale',
    kind: 'template',
    name: 'Read-scaled database',
    description:
      'Three database replicas absorb a read-heavy spike. Great for comparing scale-out versus queueing.',
    tag: 'Scaling',
    loadProfile: 'steady',
    seed: 20261117,
    thresholds: { maxP95LatencyMs: 700, maxErrorRate: 0.03 },
    nodes: [
      node('gen', 'traffic-generator', 'Traffic Generator', 40, 220, {
        throughputLimit: 180,
      }),
      node('lb', 'load-balancer', 'Read Balancer', 280, 220, {
        lbStrategy: 'least-load',
        healthChecks: true,
      }),
      node('svc-a', 'service', 'Query Service', 520, 220, {
        throughputLimit: 220,
        queueCapacity: 300,
      }),
      node('db', 'database', 'Replicated DB', 760, 220, {
        throughputLimit: 90,
        replicas: 3,
        queueCapacity: 180,
        latency: 20,
      }),
    ],
    edges: [edge('gen', 'lb'), edge('lb', 'svc-a'), edge('svc-a', 'db')],
  },
  {
    id: 'multi-region',
    kind: 'template',
    name: 'Multi-region failover',
    description:
      'Two regions behind a health-checked balancer. Take one region down and watch traffic shift.',
    tag: 'Resilience',
    loadProfile: 'steady',
    seed: 20261118,
    thresholds: { maxP95LatencyMs: 900, maxErrorRate: 0.04 },
    nodes: [
      node('gen', 'traffic-generator', 'Global Traffic', 40, 220, {
        throughputLimit: 200,
      }),
      node('lb', 'load-balancer', 'Global Balancer', 280, 220, {
        healthChecks: true,
        lbStrategy: 'least-load',
      }),
      node('svc-a', 'service', 'Region A API', 520, 100, {
        throughputLimit: 180,
        queueCapacity: 260,
      }),
      node('svc-b', 'service', 'Region B API', 520, 360, {
        throughputLimit: 180,
        queueCapacity: 260,
      }),
      node('db-a', 'database', 'Region A DB', 760, 100, {
        throughputLimit: 120,
        queueCapacity: 100,
        latency: 25,
      }),
      node('db-b', 'database', 'Region B DB', 760, 360, {
        throughputLimit: 120,
        queueCapacity: 100,
        latency: 28,
      }),
    ],
    edges: [
      edge('gen', 'lb'),
      edge('lb', 'svc-a'),
      edge('lb', 'svc-b'),
      edge('svc-a', 'db-a'),
      edge('svc-b', 'db-b'),
    ],
  },
  {
    id: 'autoscaling',
    kind: 'template',
    name: 'Autoscaling service',
    description:
      'The API scales from one to four instances when utilization stays hot. Cooldown makes it imperfect.',
    tag: 'Elasticity',
    loadProfile: 'steady',
    seed: 20261119,
    thresholds: { maxP95LatencyMs: 600, maxErrorRate: 0.03 },
    nodes: [
      node('gen', 'traffic-generator', 'Traffic Generator', 40, 220, {
        throughputLimit: 220,
      }),
      node('lb', 'load-balancer', 'Edge Balancer', 280, 220),
      node('svc-a', 'service', 'Autoscaling API', 520, 220, {
        throughputLimit: 90,
        queueCapacity: 160,
        autoscaling: true,
        minInstances: 1,
        maxInstances: 4,
      }),
      node('db', 'database', 'Primary DB', 760, 220, {
        throughputLimit: 180,
        replicas: 2,
        queueCapacity: 180,
        latency: 20,
      }),
    ],
    edges: [edge('gen', 'lb'), edge('lb', 'svc-a'), edge('svc-a', 'db')],
  },
  {
    id: 'cache-stampede',
    kind: 'chaos',
    name: 'Cache stampede',
    description:
      'The cache dies at t=6s. Every miss now lands on the database at once.',
    tag: 'Chaos',
    loadProfile: 'spike',
    seed: 20261120,
    thresholds,
    nodes: [
      node('gen', 'traffic-generator', 'Traffic Generator', 40, 200, {
        throughputLimit: 140,
      }),
      node('lb', 'load-balancer', 'Edge Balancer', 280, 200),
      node('svc-a', 'service', 'API Service', 520, 200, {
        throughputLimit: 200,
        queueCapacity: 280,
      }),
      node('cache', 'cache', 'Hot Cache', 760, 200, {
        cacheHitRate: 0.9,
        throughputLimit: 2_500,
        queueCapacity: 2_500,
      }),
      node('db', 'database', 'Primary DB', 1_000, 200, {
        throughputLimit: 140,
        queueCapacity: 120,
        latency: 25,
      }),
    ],
    edges: [
      edge('gen', 'lb'),
      edge('lb', 'svc-a'),
      edge('svc-a', 'cache'),
      edge('cache', 'db'),
    ],
    faults: [{ id: 'fault-cache', nodeId: 'cache', startMs: 6_000, durationMs: 3_000 }],
  },
  {
    id: 'retry-storm',
    kind: 'chaos',
    name: 'Retry storm',
    description:
      'A flaky service retries failed requests twice, adding load exactly when it is least useful.',
    tag: 'Chaos',
    loadProfile: 'spike',
    seed: 20261121,
    thresholds: { maxP95LatencyMs: 900, maxErrorRate: 0.08 },
    nodes: [
      node('gen', 'traffic-generator', 'Traffic Generator', 40, 200, {
        throughputLimit: 140,
      }),
      node('lb', 'load-balancer', 'Edge Balancer', 280, 200),
      node('svc-a', 'service', 'Flaky API', 520, 200, {
        throughputLimit: 220,
        queueCapacity: 320,
        failureRate: 0.22,
        retries: 2,
      }),
      node('db', 'database', 'Primary DB', 760, 200, {
        throughputLimit: 180,
        queueCapacity: 180,
        latency: 20,
      }),
    ],
    edges: [edge('gen', 'lb'), edge('lb', 'svc-a'), edge('svc-a', 'db')],
  },
  {
    id: 'service-outage',
    kind: 'chaos',
    name: 'Regional service outage',
    description:
      'One API service disappears at t=6s. Health checks shift traffic to the surviving region.',
    tag: 'Chaos',
    loadProfile: 'spike',
    seed: 20261122,
    thresholds: { maxP95LatencyMs: 850, maxErrorRate: 0.05 },
    nodes: [
      node('gen', 'traffic-generator', 'Traffic Generator', 40, 220, {
        throughputLimit: 180,
      }),
      node('lb', 'load-balancer', 'Health-checked LB', 280, 220, {
        healthChecks: true,
        lbStrategy: 'least-load',
      }),
      node('svc-a', 'service', 'Region A API', 520, 100, {
        throughputLimit: 190,
        queueCapacity: 260,
      }),
      node('svc-b', 'service', 'Region B API', 520, 360, {
        throughputLimit: 190,
        queueCapacity: 260,
      }),
      node('db', 'database', 'Shared DB', 760, 220, {
        throughputLimit: 240,
        queueCapacity: 240,
        latency: 22,
      }),
    ],
    edges: [
      edge('gen', 'lb'),
      edge('lb', 'svc-a'),
      edge('lb', 'svc-b'),
      edge('svc-a', 'db'),
      edge('svc-b', 'db'),
    ],
    faults: [{ id: 'fault-svc-a', nodeId: 'svc-a', startMs: 6_000, durationMs: 3_000 }],
  },
  {
    id: 'monolith',
    kind: 'template',
    name: 'Monolith under pressure',
    description:
      'One service, one database, no cache. A clean baseline for the breaking-point benchmark.',
    tag: 'Baseline',
    loadProfile: 'steady',
    seed: 20261123,
    thresholds,
    nodes: baseNodes,
    edges: baseEdges,
  },
];

export const TEMPLATE_SCENARIOS = SCENARIOS.filter(
  (scenario) => scenario.kind === 'template'
);
export const CHAOS_SCENARIOS = SCENARIOS.filter(
  (scenario) => scenario.kind === 'chaos'
);
