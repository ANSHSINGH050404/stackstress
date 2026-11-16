import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Edge } from '@xyflow/react';
import type { LoadProfile } from '../types';
import { evaluateSpikeChallenge } from '../lib/challenges';
import {
  decodeSharedSimulation,
  encodeSharedSimulation,
} from '../lib/shared-simulation';
import type { HistoryPoint, SimNode } from '../lib/store';
import type { SharedSimulation } from '../lib/shared-simulation';

const scenario: SharedSimulation = {
  nodes: [
    {
      id: 'generator',
      type: 'traffic-generator',
      position: { x: 40, y: 80 },
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
      position: { x: 260, y: 80 },
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
  ] satisfies SimNode[],
  edges: [
    { id: 'generator-service', source: 'generator', target: 'service' },
  ] satisfies Edge[],
  loadProfile: 'spike' satisfies LoadProfile,
  seed: 42_424_242,
  thresholds: {
    maxP95LatencyMs: 640,
    maxErrorRate: 0.025,
  },
};

function encodePayload(payload: unknown): string {
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

function legacyV1Payload() {
  return {
    version: 1,
    loadProfile: scenario.loadProfile,
    nodes: scenario.nodes.map((node) => ({
      id: node.id,
      x: node.position.x,
      y: node.position.y,
      component: node.data.component,
    })),
    edges: scenario.edges,
  };
}

function v2Payload(overrides: Record<string, unknown> = {}) {
  const token = encodeSharedSimulation(scenario);
  assert.ok(token);
  const payload: Record<string, unknown> = JSON.parse(
    Buffer.from(token, 'base64url').toString('utf8')
  );
  return { ...payload, ...overrides };
}

test('v2 shared scenarios round-trip all replay inputs', () => {
  const token = encodeSharedSimulation(scenario);

  assert.ok(token);
  assert.match(token, /^[A-Za-z0-9_-]+$/);
  assert.equal(
    JSON.parse(Buffer.from(token, 'base64url').toString('utf8')).version,
    2
  );
  assert.deepEqual(decodeSharedSimulation(token), scenario);
});

test('v1 shared scenarios migrate to replay defaults', () => {
  const legacyToken = encodePayload(legacyV1Payload());
  const migrated = decodeSharedSimulation(legacyToken);

  assert.ok(migrated);
  assert.deepEqual(migrated.nodes, scenario.nodes);
  assert.deepEqual(migrated.edges, scenario.edges);
  assert.equal(migrated.loadProfile, scenario.loadProfile);
  assert.ok(migrated.seed >= 0 && migrated.seed <= 0xffff_ffff);
  assert.equal(decodeSharedSimulation(legacyToken)?.seed, migrated.seed);
  assert.deepEqual(migrated.thresholds, {
    maxP95LatencyMs: 800,
    maxErrorRate: 0.05,
  });
});

test('shared scenarios reject invalid seeds and thresholds', () => {
  const invalidPayloads = [
    v2Payload({ seed: -1 }),
    v2Payload({ seed: 1.5 }),
    v2Payload({
      thresholds: { ...scenario.thresholds, maxP95LatencyMs: -1 },
    }),
    v2Payload({
      thresholds: { ...scenario.thresholds, maxErrorRate: 1.01 },
    }),
  ];

  for (const invalidPayload of invalidPayloads) {
    assert.equal(
      decodeSharedSimulation(encodePayload(invalidPayload)),
      null
    );
  }

  assert.equal(encodeSharedSimulation({ ...scenario, seed: -1 }), null);
  assert.equal(
    encodeSharedSimulation({
      ...scenario,
      thresholds: { ...scenario.thresholds, maxErrorRate: 2 },
    }),
    null
  );
});

test('challenge evaluation uses the scenario thresholds', () => {
  const history: HistoryPoint[] = [7_000, 8_000, 9_000].map((t) => ({
    t,
    rps: 100,
    generatedRps: 100,
    p50: 60,
    p95: 700,
    p99: 900,
    errorRate: 0.02,
    avgLatency: 100,
  }));

  const strict = evaluateSpikeChallenge(
    history,
    {},
    [],
    null,
    [],
    { maxP95LatencyMs: 640, maxErrorRate: 0.025 }
  );
  const defaultBudget = evaluateSpikeChallenge(
    history,
    {},
    [],
    null,
    [],
    { maxP95LatencyMs: 800, maxErrorRate: 0.05 }
  );

  assert.equal(strict.passed, false);
  assert.equal(strict.p95Latency, 700);
  assert.equal(defaultBudget.passed, true);
});
