import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Edge } from '@xyflow/react';
import { resetSimulation, startSimulation, stopSimulation } from '../lib/simulationClient';
import { useSimulationStore, type SimNode } from '../lib/store';
import type { SimulationScenarioSettings } from '../types';

const nodes: SimNode[] = [
  {
    id: 'generator',
    type: 'traffic-generator',
    position: { x: 0, y: 0 },
    data: {
      component: {
        id: 'generator',
        type: 'traffic-generator',
        name: 'Traffic',
        throughputLimit: 90,
        latency: 0,
        failureRate: 0,
        queueCapacity: 100,
      },
    },
  },
  {
    id: 'service',
    type: 'service',
    position: { x: 100, y: 0 },
    data: {
      component: {
        id: 'service',
        type: 'service',
        name: 'API',
        throughputLimit: 120,
        latency: 18,
        failureRate: 0.01,
        queueCapacity: 40,
      },
    },
  },
];
const edges: Edge[] = [
  { id: 'generator-service', source: 'generator', target: 'service' },
];
const settings: SimulationScenarioSettings = {
  loadProfile: 'spike',
  seed: 42_424_242,
  thresholds: { maxP95LatencyMs: 640, maxErrorRate: 0.025 },
};

test('installed shared seed reproduces simulation after engine reset', async () => {
  const store = useSimulationStore.getState();
  store.replaceScenario(nodes, edges, settings);

  assert.equal(useSimulationStore.getState().scenarioSeed, settings.seed);
  assert.deepEqual(
    useSimulationStore.getState().challengeThresholds,
    settings.thresholds
  );

  async function runTwoTicks() {
    store.resetMetrics();
    resetSimulation();
    const result = new Promise<unknown>((resolve) => {
      const unsubscribe = useSimulationStore.subscribe((state) => {
        if (state.history.length < 2) return;
        unsubscribe();
        state.setRunning(false);
        resolve({
          history: state.history,
          metricsById: state.metricsById,
          requestTraces: state.requestTraces,
          summary: state.summary,
        });
      });
    });
    useSimulationStore.getState().setRunning(true);
    return result;
  }

  startSimulation();
  try {
    const firstRun = await runTwoTicks();
    const secondRun = await runTwoTicks();
    assert.deepEqual(secondRun, firstRun);
  } finally {
    useSimulationStore.getState().setRunning(false);
    stopSimulation();
  }
});
