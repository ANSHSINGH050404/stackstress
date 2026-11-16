import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SimulationEngine } from '../lib/engine';
import type { GraphPayload, LoadProfile } from '../types';

const graph: GraphPayload = {
  components: [
    {
      id: 'generator',
      type: 'traffic-generator',
      name: 'Traffic',
      throughputLimit: 90,
      latency: 0,
      failureRate: 0,
      queueCapacity: 100,
    },
    {
      id: 'service',
      type: 'service',
      name: 'API',
      throughputLimit: 120,
      latency: 18,
      failureRate: 0.01,
      queueCapacity: 40,
    },
  ],
  edges: [{ source: 'generator', target: 'service' }],
};

function runChallenge(seed: number, loadProfile: LoadProfile) {
  const engine = new SimulationEngine(graph, { seed, captureTraces: true });
  engine.setLoadProfile(loadProfile);

  return Array.from({ length: 9 }, () => engine.tick(1_000));
}

test('identical seeded inputs produce identical non-empty 9-second challenge ticks', () => {
  const firstRun = runChallenge(42_424_242, 'spike');
  const secondRun = runChallenge(42_424_242, 'spike');

  assert.equal(firstRun.length, 9);
  assert.deepEqual(firstRun, secondRun);
  assert.equal(firstRun.at(-1)?.time, 9_000);
  assert.ok(firstRun.some((tick) => tick.summary.generatedRps > 0));
  assert.ok(
    firstRun.some((tick) => tick.nodes.service.requestsIn > 0),
    'the service should receive generated traffic during the challenge'
  );
});
