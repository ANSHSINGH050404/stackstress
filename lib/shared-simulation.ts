import type { Edge } from '@xyflow/react';
import { DEFAULT_CHALLENGE_THRESHOLDS } from './challenges';
import type {
  ChallengeThresholds,
  ComponentConfig,
  ComponentType,
  LoadProfile,
} from '@/types';
import type { SimNode } from './store';

const MAX_PAYLOAD_LENGTH = 12_000;
const MAX_NODES = 60;
const MAX_EDGES = 120;
const MAX_SEED = 0xffff_ffff;
const COMPONENT_TYPES = new Set<ComponentType>([
  'load-balancer',
  'database',
  'cache',
  'service',
  'traffic-generator',
]);
const LOAD_PROFILES = new Set<LoadProfile>(['steady', 'spike', 'ramp']);

export interface SharedSimulation {
  nodes: SimNode[];
  edges: Edge[];
  loadProfile: LoadProfile;
  seed: number;
  thresholds: ChallengeThresholds;
}

interface SerializedSimulation {
  version: 2;
  loadProfile: LoadProfile;
  seed: number;
  thresholds: ChallengeThresholds;
  nodes: Array<{
    id: string;
    x: number;
    y: number;
    component: ComponentConfig;
  }>;
  edges: Array<{ id: string; source: string; target: string }>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function encodeBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function decodeBase64Url(value: string): string {
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/');
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
  const binary = atob(padded);
  if (binary.length > MAX_PAYLOAD_LENGTH) throw new Error('Shared graph is too large');
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

function isFiniteInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

function parseThresholds(value: unknown): ChallengeThresholds | null {
  if (
    !isRecord(value) ||
    !isFiniteInRange(value.maxP95LatencyMs, 0, 60_000) ||
    !isFiniteInRange(value.maxErrorRate, 0, 1)
  ) {
    return null;
  }

  return {
    maxP95LatencyMs: value.maxP95LatencyMs,
    maxErrorRate: value.maxErrorRate,
  };
}

function seedFromLegacyPayload(value: string): number {
  let seed = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    seed = Math.imul(seed ^ value.charCodeAt(index), 0x01000193);
  }
  return seed >>> 0;
}

function parseComponent(value: unknown, nodeId: string): ComponentConfig | null {
  if (!isRecord(value)) return null;
  const { id, type, name, throughputLimit, latency, failureRate, queueCapacity } = value;
  if (
    id !== nodeId ||
    typeof type !== 'string' ||
    !COMPONENT_TYPES.has(type as ComponentType) ||
    typeof name !== 'string' ||
    name.length === 0 ||
    name.length > 80 ||
    !isFiniteInRange(throughputLimit, 0, 100_000) ||
    !isFiniteInRange(latency, 0, 60_000) ||
    !isFiniteInRange(failureRate, 0, 1) ||
    !isFiniteInRange(queueCapacity, 0, 1_000_000)
  ) {
    return null;
  }

  return {
    id,
    type: type as ComponentType,
    name,
    throughputLimit,
    latency,
    failureRate,
    queueCapacity: Math.floor(queueCapacity),
  };
}

export function encodeSharedSimulation(scenario: SharedSimulation): string | null {
  const { nodes, edges, loadProfile, seed, thresholds } = scenario;
  const validThresholds = parseThresholds(thresholds);
  if (nodes.length > MAX_NODES || edges.length > MAX_EDGES) return null;
  if (
    !LOAD_PROFILES.has(loadProfile) ||
    !Number.isInteger(seed) ||
    seed < 0 ||
    seed > MAX_SEED ||
    !validThresholds
  ) {
    return null;
  }

  const payload: SerializedSimulation = {
    version: 2,
    loadProfile,
    seed,
    thresholds: validThresholds,
    nodes: nodes.map((node) => ({
      id: node.id,
      x: node.position.x,
      y: node.position.y,
      component: node.data.component,
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
    })),
  };
  const serialized = JSON.stringify(payload);
  if (serialized.length > MAX_PAYLOAD_LENGTH) return null;

  try {
    return encodeBase64Url(serialized);
  } catch {
    return null;
  }
}

export function decodeSharedSimulation(value: string): SharedSimulation | null {
  if (!value || value.length > MAX_PAYLOAD_LENGTH * 2) return null;

  try {
    const serialized = decodeBase64Url(value);
    const payload: unknown = JSON.parse(serialized);
    if (
      !isRecord(payload) ||
      (payload.version !== 1 && payload.version !== 2)
    ) {
      return null;
    }
    if (
      typeof payload.loadProfile !== 'string' ||
      !LOAD_PROFILES.has(payload.loadProfile as LoadProfile) ||
      !Array.isArray(payload.nodes) ||
      !Array.isArray(payload.edges) ||
      payload.nodes.length > MAX_NODES ||
      payload.edges.length > MAX_EDGES
    ) {
      return null;
    }

    const seed = payload.version === 1 ? seedFromLegacyPayload(serialized) : payload.seed;
    const thresholds =
      payload.version === 1
        ? DEFAULT_CHALLENGE_THRESHOLDS
        : parseThresholds(payload.thresholds);
    if (
      typeof seed !== 'number' ||
      !Number.isInteger(seed) ||
      seed < 0 ||
      seed > MAX_SEED ||
      !thresholds
    ) {
      return null;
    }

    const ids = new Set<string>();
    const nodes: SimNode[] = [];
    for (const value of payload.nodes) {
      if (!isRecord(value) || typeof value.id !== 'string' || value.id.length > 80) {
        return null;
      }
      if (
        ids.has(value.id) ||
        !isFiniteInRange(value.x, -200_000, 200_000) ||
        !isFiniteInRange(value.y, -200_000, 200_000)
      ) {
        return null;
      }
      const component = parseComponent(value.component, value.id);
      if (!component) return null;

      ids.add(value.id);
      nodes.push({
        id: value.id,
        type: component.type,
        position: { x: value.x, y: value.y },
        data: { component },
      });
    }

    const edgeIds = new Set<string>();
    const edges: Edge[] = [];
    for (const value of payload.edges) {
      if (
        !isRecord(value) ||
        typeof value.id !== 'string' ||
        value.id.length > 100 ||
        typeof value.source !== 'string' ||
        typeof value.target !== 'string' ||
        !ids.has(value.source) ||
        !ids.has(value.target) ||
        edgeIds.has(value.id)
      ) {
        return null;
      }
      edgeIds.add(value.id);
      edges.push({ id: value.id, source: value.source, target: value.target });
    }

    return {
      nodes,
      edges,
      loadProfile: payload.loadProfile as LoadProfile,
      seed,
      thresholds,
    };
  } catch {
    return null;
  }
}
