import type { Edge } from '@xyflow/react';
import type {
  ChallengeThresholds,
  LoadProfile,
  ScheduledFault,
} from '@/types';
import type { SimNode } from './store';

const STORAGE_KEY = 'stackstress.scenario.v1';

interface SavedScenario {
  version: 1;
  nodes: SimNode[];
  edges: Edge[];
  loadProfile: LoadProfile;
  seed: number | null;
  thresholds: ChallengeThresholds;
  faults: ScheduledFault[];
}

export interface SavedScenarioData {
  nodes: SimNode[];
  edges: Edge[];
  loadProfile: LoadProfile;
  seed: number | null;
  thresholds: ChallengeThresholds;
  faults: ScheduledFault[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function loadSavedScenario(): SavedScenarioData | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      !isRecord(parsed) ||
      parsed.version !== 1 ||
      !Array.isArray(parsed.nodes) ||
      !Array.isArray(parsed.edges) ||
      parsed.nodes.length === 0 ||
      parsed.nodes.length > 80 ||
      parsed.edges.length > 160
    ) {
      return null;
    }

    const nodes = parsed.nodes.filter(
      (node): node is SimNode =>
        isRecord(node) &&
        typeof node.id === 'string' &&
        typeof node.position === 'object' &&
        isRecord(node.position) &&
        typeof node.position.x === 'number' &&
        typeof node.position.y === 'number' &&
        isRecord(node.data) &&
        isRecord(node.data.component)
    );
    if (nodes.length !== parsed.nodes.length) return null;

    const edges = parsed.edges.filter(
      (edge): edge is Edge =>
        isRecord(edge) &&
        typeof edge.id === 'string' &&
        typeof edge.source === 'string' &&
        typeof edge.target === 'string'
    );
    if (edges.length !== parsed.edges.length) return null;

    const loadProfile =
      parsed.loadProfile === 'spike' || parsed.loadProfile === 'ramp'
        ? parsed.loadProfile
        : 'steady';
    const thresholds = isRecord(parsed.thresholds)
      ? {
          maxP95LatencyMs:
            typeof parsed.thresholds.maxP95LatencyMs === 'number'
              ? parsed.thresholds.maxP95LatencyMs
              : 800,
          maxErrorRate:
            typeof parsed.thresholds.maxErrorRate === 'number'
              ? parsed.thresholds.maxErrorRate
              : 0.05,
          ...(typeof parsed.thresholds.maxCostPerHour === 'number'
            ? { maxCostPerHour: parsed.thresholds.maxCostPerHour }
            : {}),
        }
      : { maxP95LatencyMs: 800, maxErrorRate: 0.05 };
    const faults = Array.isArray(parsed.faults)
      ? parsed.faults.filter(
          (fault): fault is ScheduledFault =>
            isRecord(fault) &&
            typeof fault.id === 'string' &&
            typeof fault.nodeId === 'string' &&
            typeof fault.startMs === 'number' &&
            typeof fault.durationMs === 'number'
        )
      : [];

    return {
      nodes,
      edges,
      loadProfile,
      seed:
        typeof parsed.seed === 'number' && Number.isFinite(parsed.seed)
          ? parsed.seed
          : null,
      thresholds,
      faults,
    };
  } catch {
    return null;
  }
}

export function saveScenario(data: SavedScenarioData): void {
  if (typeof window === 'undefined') return;
  try {
    const payload: SavedScenario = {
      version: 1,
      nodes: data.nodes.map((node) => ({
        id: node.id,
        type: node.type,
        position: node.position,
        data: node.data,
      })),
      edges: data.edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
      })),
      loadProfile: data.loadProfile,
      seed: data.seed,
      thresholds: data.thresholds,
      faults: data.faults,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Storage can be unavailable in private windows; autosave is best-effort.
  }
}

export function clearSavedScenario(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore storage failures.
  }
}
