import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Edge } from '@xyflow/react';
import type { ComponentConfig, GraphPayload, ScheduledFault } from '../types';
import { SimulationEngine } from '../lib/engine';
import { findBreakingPoint, buildFixCandidates } from '../lib/benchmark';
import { componentCostPerHour } from '../lib/components';
import { getDailyChallenge } from '../lib/daily';
import { analyzeGraph } from '../lib/graph-health';
import { tidyPositions } from '../lib/layout';
import { SCENARIOS } from '../lib/scenarios';
import { encodeSharedSimulation, decodeSharedSimulation } from '../lib/shared-simulation';
import type { SharedSimulation } from '../lib/shared-simulation';
import type { SimNode } from '../lib/store';

function component(
  id: string,
  type: ComponentConfig['type'],
  overrides: Partial<ComponentConfig> = {}
): ComponentConfig {
  return {
    id,
    type,
    name: id,
    throughputLimit: 100,
    latency: 1,
    failureRate: 0,
    queueCapacity: 1_000,
    ...overrides,
  };
}

function graph(components: ComponentConfig[], edges: GraphPayload['edges']): GraphPayload {
  return { components, edges };
}

function run(
  payload: GraphPayload,
  ticks: number,
  seed = 7,
  faults: ScheduledFault[] = []
) {
  const engine = new SimulationEngine(payload, { seed, faults });
  engine.setLoadProfile('steady');
  return Array.from({ length: ticks }, () => engine.tick(1_000));
}

test('cache hits terminate requests before they reach downstream components', () => {
  const payload = graph(
    [
      component('gen', 'traffic-generator', { throughputLimit: 40 }),
      component('cache', 'cache', {
        throughputLimit: 5_000,
        cacheHitRate: 1,
      }),
      component('db', 'database', { throughputLimit: 50 }),
    ],
    [
      { source: 'gen', target: 'cache' },
      { source: 'cache', target: 'db' },
    ]
  );

  const updates = run(payload, 4);
  const last = updates[updates.length - 1];
  assert.ok(last.summary.totalCompleted > 0);
  assert.equal(last.nodes.db.totalIn, 0);
  assert.ok(last.nodes.cache.cacheHits > 0);
  assert.equal(last.nodes.cache.cacheHitRate, 1);
});

test('cache misses forward traffic to downstream components', () => {
  const payload = graph(
    [
      component('gen', 'traffic-generator', { throughputLimit: 40 }),
      component('cache', 'cache', {
        throughputLimit: 5_000,
        cacheHitRate: 0,
      }),
      component('db', 'database', { throughputLimit: 500 }),
    ],
    [
      { source: 'gen', target: 'cache' },
      { source: 'cache', target: 'db' },
    ]
  );

  const updates = run(payload, 4);
  const last = updates[updates.length - 1];
  assert.ok(last.nodes.db.totalIn > 0);
  assert.ok(last.nodes.cache.cacheMisses > 0);
});

test('scheduled faults take a node down for exactly the requested window', () => {
  const payload = graph(
    [
      component('gen', 'traffic-generator', { throughputLimit: 60 }),
      component('svc', 'service', { throughputLimit: 200, queueCapacity: 30 }),
    ],
    [{ source: 'gen', target: 'svc' }]
  );

  const updates = run(payload, 4, 11, [
    { id: 'fault-1', nodeId: 'svc', startMs: 2_000, durationMs: 2_000 },
  ]);

  assert.equal(updates[1].nodes.svc.down, true);
  assert.ok(updates[2].nodes.svc.dropped > 0);
  assert.equal(updates[3].nodes.svc.down, false);
});

test('database replicas multiply effective capacity', () => {
  const payload = (replicas: number) =>
    graph(
      [
        component('gen', 'traffic-generator', { throughputLimit: 200 }),
        component('db', 'database', {
          throughputLimit: 25,
          latency: 4,
          queueCapacity: 5_000,
          replicas,
        }),
      ],
      [{ source: 'gen', target: 'db' }]
    );

  const single = run(payload(1), 4, 99);
  const replicated = run(payload(4), 4, 99);
  const singleLast = single[single.length - 1];
  const replicatedLast = replicated[replicated.length - 1];

  assert.ok(
    replicatedLast.nodes.db.totalOut > singleLast.nodes.db.totalOut,
    'four replicas should serve more requests than one'
  );
});

test('service autoscaling adds instances under sustained load', () => {
  const payload = graph(
    [
      component('gen', 'traffic-generator', { throughputLimit: 250 }),
      component('svc', 'service', {
        throughputLimit: 120,
        queueCapacity: 5_000,
        autoscaling: true,
        minInstances: 1,
        maxInstances: 4,
      }),
      component('db', 'database', { throughputLimit: 2_000 }),
    ],
    [
      { source: 'gen', target: 'svc' },
      { source: 'svc', target: 'db' },
    ]
  );

  const updates = run(payload, 6, 5);
  const last = updates[updates.length - 1];
  assert.ok(last.nodes.svc.instances > 1);
  assert.ok(last.nodes.svc.instances <= 4);
});

test('health-checked load balancing skips a failed target', () => {
  const payload = graph(
    [
      component('gen', 'traffic-generator', { throughputLimit: 80 }),
      component('lb', 'load-balancer', {
        throughputLimit: 5_000,
        healthChecks: true,
      }),
      component('svc-a', 'service', { throughputLimit: 500 }),
      component('svc-b', 'service', { throughputLimit: 500 }),
    ],
    [
      { source: 'gen', target: 'lb' },
      { source: 'lb', target: 'svc-a' },
      { source: 'lb', target: 'svc-b' },
    ]
  );

  const updates = run(payload, 4, 21, [
    { id: 'fault-a', nodeId: 'svc-a', startMs: 2_000, durationMs: 1_000 },
  ]);
  const during = updates[2];

  assert.equal(during.nodes['svc-a'].requestsIn, 0);
  assert.ok(during.nodes['svc-b'].requestsIn > 0);
});

test('cost scales with capacity and replica count', () => {
  const small = componentCostPerHour(
    component('db', 'database', { throughputLimit: 100, replicas: 1 })
  );
  const large = componentCostPerHour(
    component('db', 'database', { throughputLimit: 100, replicas: 3 })
  );
  assert.ok(large > small);
  assert.ok(small > 0);
});

test('breaking-point search returns a finite rate and a bottleneck', () => {
  const scenario = SCENARIOS.find((candidate) => candidate.id === 'monolith');
  assert.ok(scenario);
  const result = findBreakingPoint(
    scenario.nodes,
    scenario.edges,
    20261123,
    { maxP95LatencyMs: 400, maxErrorRate: 0.02 },
    { ticks: 6, maxRps: 600 }
  );

  assert.ok(result);
  assert.ok(result.breakpointRps >= 10);
  assert.ok(result.breakpointRps <= 600);
  assert.ok(result.capped || result.bottleneckName !== null);
});

test('fix candidates are projected, ranked, and applicable', () => {
  const scenario = SCENARIOS.find((candidate) => candidate.id === 'monolith');
  assert.ok(scenario);
  const nodes: SimNode[] = scenario.nodes;
  const candidates = buildFixCandidates(
    nodes,
    scenario.edges,
    20261123,
    { maxP95LatencyMs: 250, maxErrorRate: 0.02 },
    'db'
  );

  assert.ok(candidates.length > 0);
  assert.equal(new Set(candidates.map((candidate) => candidate.id)).size, candidates.length);
  assert.ok(
    candidates[0].projected.p95Latency <=
      candidates[candidates.length - 1].projected.p95Latency
  );
  const cached = candidates.find((candidate) => candidate.id === 'add-cache');
  if (cached) {
    assert.ok(cached.nodes.some((node) => node.data.component.type === 'cache'));
    assert.ok(cached.edges.length > scenario.edges.length);
  }
});

test('shared simulations round-trip new component semantics and faults', () => {
  const scenario = SCENARIOS.find((candidate) => candidate.id === 'service-outage');
  assert.ok(scenario);
  const shared: SharedSimulation = {
    nodes: scenario.nodes,
    edges: scenario.edges,
    loadProfile: scenario.loadProfile,
    seed: scenario.seed,
    thresholds: { ...scenario.thresholds, maxCostPerHour: 120 },
    faults: scenario.faults,
  };

  const token = encodeSharedSimulation(shared);
  assert.ok(token);
  const decoded = decodeSharedSimulation(token);
  assert.ok(decoded);
  assert.equal(decoded.seed, shared.seed);
  assert.equal(decoded.thresholds.maxCostPerHour, 120);
  assert.deepEqual(decoded.faults, shared.faults);
});

test('daily challenges are stable within a UTC day and advance by one', () => {
  const first = getDailyChallenge(new Date(Date.UTC(2026, 10, 16, 9)));
  const sameDay = getDailyChallenge(new Date(Date.UTC(2026, 10, 16, 23)));
  const nextDay = getDailyChallenge(new Date(Date.UTC(2026, 10, 17, 1)));

  assert.equal(first.dateKey, sameDay.dateKey);
  assert.equal(first.seed, sameDay.seed);
  assert.equal(nextDay.number, first.number + 1);
  assert.notEqual(nextDay.seed, first.seed);
});

test('graph health reports missing generators, orphans, and cycles', () => {
  const nodes: SimNode[] = [
    {
      id: 'a',
      type: 'service',
      position: { x: 0, y: 0 },
      data: { component: component('a', 'service') },
    },
    {
      id: 'b',
      type: 'service',
      position: { x: 100, y: 0 },
      data: { component: component('b', 'service') },
    },
    {
      id: 'orphan',
      type: 'database',
      position: { x: 200, y: 0 },
      data: { component: component('orphan', 'database') },
    },
  ];
  const edges: Edge[] = [
    { id: 'a-b', source: 'a', target: 'b' },
    { id: 'b-a', source: 'b', target: 'a' },
  ];

  const issues = analyzeGraph(nodes, edges);
  assert.ok(issues.some((issue) => issue.kind === 'no-generator'));
  assert.ok(issues.some((issue) => issue.kind === 'orphan'));
  assert.ok(issues.some((issue) => issue.kind === 'cycle'));
});

test('tidy layout is deterministic and flows left to right', () => {
  const scenario = SCENARIOS.find((candidate) => candidate.id === 'three-tier');
  assert.ok(scenario);
  const first = tidyPositions(scenario.nodes, scenario.edges);
  const second = tidyPositions(scenario.nodes, scenario.edges);

  assert.deepEqual(first, second);
  assert.ok(first.gen.x < first.lb.x);
  assert.ok(first.lb.x < first['svc-a'].x);
});
