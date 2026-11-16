'use client';

import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Edge,
  MarkerType,
  Node,
  OnConnect,
  OnEdgesChange,
  OnNodesChange,
  XYPosition,
} from '@xyflow/react';
import { create } from 'zustand';
import {
  ChallengeThresholds,
  ComponentConfig,
  ComponentType,
  LoadProfile,
  NodeMetrics,
  RequestTrace,
  ScheduledFault,
  SimulationScenarioSettings,
  SimulationSummary,
  SimulationUpdate,
} from '../types';
import { sanitizeComponent } from './components';
import { DEFAULT_CHALLENGE_THRESHOLDS } from './challenges';

export type SimNodeData = {
  component: ComponentConfig;
};

export type SimNode = Node<SimNodeData>;

export interface HistoryPoint {
  t: number;
  rps: number;
  generatedRps: number;
  p50: number;
  p95: number;
  p99: number;
  errorRate: number;
  avgLatency: number;
}

export interface NodeHistoryPoint {
  t: number;
  queueDepth: number;
  utilization: number;
  errors: number;
  dropped: number;
  p95Latency: number;
  cacheHitRate: number;
  instances: number;
}

export const COMPONENT_META: Record<
  ComponentType,
  { label: string; description: string; color: string }
> = {
  'traffic-generator': {
    label: 'Traffic Generator',
    description: 'Inject synthetic load',
    color: '#2f6f95',
  },
  'load-balancer': {
    label: 'Load Balancer',
    description: 'Spread requests across targets',
    color: '#4f5d8a',
  },
  service: {
    label: 'Service',
    description: 'Stateless request processing',
    color: '#0f7a63',
  },
  cache: {
    label: 'Cache',
    description: 'Serve hot reads without hitting downstream',
    color: '#a9680f',
  },
  database: {
    label: 'Database',
    description: 'Stateful storage bottleneck',
    color: '#7d4f70',
  },
};

export const COMPONENT_DEFAULTS: Record<
  ComponentType,
  Omit<ComponentConfig, 'id' | 'name'>
> = {
  'traffic-generator': {
    type: 'traffic-generator',
    throughputLimit: 120,
    latency: 0,
    failureRate: 0,
    queueCapacity: 1000,
  },
  'load-balancer': {
    type: 'load-balancer',
    throughputLimit: 5000,
    latency: 1,
    failureRate: 0,
    queueCapacity: 5000,
    lbStrategy: 'least-load',
    healthChecks: true,
  },
  service: {
    type: 'service',
    throughputLimit: 150,
    latency: 15,
    failureRate: 0,
    queueCapacity: 200,
    autoscaling: false,
    minInstances: 1,
    maxInstances: 4,
    retries: 0,
  },
  cache: {
    type: 'cache',
    throughputLimit: 2000,
    latency: 0.5,
    failureRate: 0,
    queueCapacity: 2000,
    cacheHitRate: 0.82,
  },
  database: {
    type: 'database',
    throughputLimit: 120,
    latency: 25,
    failureRate: 0,
    queueCapacity: 100,
    replicas: 1,
  },
};

const EDGE_STYLE = {
  type: 'smoothstep' as const,
  style: { stroke: '#87949d', strokeWidth: 1.5 },
  markerEnd: { type: MarkerType.ArrowClosed, color: '#87949d' },
};

function makeComponent(
  id: string,
  type: ComponentType,
  name: string,
  overrides: Partial<ComponentConfig> = {}
): ComponentConfig {
  return sanitizeComponent({ id, name, ...COMPONENT_DEFAULTS[type], ...overrides });
}

const initialNodes: SimNode[] = [
  {
    id: 'gen-1',
    type: 'traffic-generator',
    position: { x: 40, y: 180 },
    data: { component: makeComponent('gen-1', 'traffic-generator', 'Traffic Generator') },
  },
  {
    id: 'lb-1',
    type: 'load-balancer',
    position: { x: 280, y: 180 },
    data: { component: makeComponent('lb-1', 'load-balancer', 'Load Balancer') },
  },
  {
    id: 'svc-1',
    type: 'service',
    position: { x: 520, y: 40 },
    data: { component: makeComponent('svc-1', 'service', 'Service A') },
  },
  {
    id: 'svc-2',
    type: 'service',
    position: { x: 520, y: 320 },
    data: { component: makeComponent('svc-2', 'service', 'Service B') },
  },
  {
    id: 'db-1',
    type: 'database',
    position: { x: 760, y: 180 },
    data: { component: makeComponent('db-1', 'database', 'Primary DB') },
  },
];

const initialEdges: Edge[] = [
  { id: 'e-gen-lb', source: 'gen-1', target: 'lb-1', ...EDGE_STYLE },
  { id: 'e-lb-svc1', source: 'lb-1', target: 'svc-1', ...EDGE_STYLE },
  { id: 'e-lb-svc2', source: 'lb-1', target: 'svc-2', ...EDGE_STYLE },
  { id: 'e-svc1-db', source: 'svc-1', target: 'db-1', ...EDGE_STYLE },
  { id: 'e-svc2-db', source: 'svc-2', target: 'db-1', ...EDGE_STYLE },
];

let nodeSequence = 100;

function createNode(type: ComponentType, position: XYPosition): SimNode {
  nodeSequence += 1;
  const id = `${type}-${nodeSequence}`;
  return {
    id,
    type,
    position,
    data: {
      component: makeComponent(id, type, `${COMPONENT_META[type].label} ${nodeSequence}`),
    },
  };
}

interface ScenarioSnapshot {
  nodes: SimNode[];
  edges: Edge[];
}

interface SimulationStore {
  nodes: SimNode[];
  edges: Edge[];
  history: HistoryPoint[];
  nodeHistory: Record<string, NodeHistoryPoint[]>;
  summary: SimulationSummary | null;
  metricsById: Record<string, NodeMetrics>;
  requestTraces: RequestTrace[];
  running: boolean;
  loadProfile: LoadProfile;
  scenarioSeed: number | null;
  challengeThresholds: ChallengeThresholds;
  faults: ScheduledFault[];
  sharedScenarioLoaded: boolean;
  selectedNodeId: string | null;
  past: ScenarioSnapshot[];
  future: ScenarioSnapshot[];
  addNode: (type: ComponentType, position: XYPosition) => void;
  duplicateNode: (id: string) => void;
  removeNode: (id: string) => void;
  selectNode: (id: string | null) => void;
  updateNodeData: (id: string, patch: Partial<ComponentConfig>) => void;
  onNodesChange: OnNodesChange<SimNode>;
  onEdgesChange: OnEdgesChange;
  onConnect: OnConnect;
  setNodePositions: (positions: Record<string, XYPosition>) => void;
  applyUpdate: (update: SimulationUpdate) => void;
  setRunning: (running: boolean) => void;
  setLoadProfile: (profile: LoadProfile) => void;
  setScenarioSeed: (seed: number) => void;
  setChallengeThresholds: (thresholds: ChallengeThresholds) => void;
  setFaults: (faults: ScheduledFault[]) => void;
  replaceScenario: (
    nodes: SimNode[],
    edges: Edge[],
    settings: SimulationScenarioSettings,
    source?: 'shared' | 'template' | 'daily' | 'saved'
  ) => void;
  resetMetrics: () => void;
  undo: () => void;
  redo: () => void;
}

const HISTORY_LIMIT = 120;
const NODE_HISTORY_LIMIT = 30;
const UNDO_LIMIT = 25;
const REQUEST_TRACE_HISTORY_LIMIT = 2048;

function snapshot(state: SimulationStore): ScenarioSnapshot {
  return { nodes: state.nodes, edges: state.edges };
}

function withUndo(
  state: SimulationStore,
  next: Partial<SimulationStore>
): Partial<SimulationStore> {
  return {
    ...next,
    past: [...state.past.slice(-(UNDO_LIMIT - 1)), snapshot(state)],
    future: [],
  };
}

function sanitizeThresholds(thresholds: ChallengeThresholds): ChallengeThresholds {
  const maxP95LatencyMs = Math.min(
    60_000,
    Math.max(0, Number(thresholds.maxP95LatencyMs) || 0)
  );
  const maxErrorRate = Math.min(1, Math.max(0, Number(thresholds.maxErrorRate) || 0));
  const next: ChallengeThresholds = { maxP95LatencyMs, maxErrorRate };
  if (thresholds.maxCostPerHour !== undefined) {
    next.maxCostPerHour = Math.min(
      100_000,
      Math.max(0, Number(thresholds.maxCostPerHour) || 0)
    );
  }
  return next;
}

export const useSimulationStore = create<SimulationStore>((set) => ({
  nodes: initialNodes,
  edges: initialEdges,
  history: [],
  nodeHistory: {},
  summary: null,
  metricsById: {},
  requestTraces: [],
  running: false,
  loadProfile: 'steady',
  scenarioSeed: null,
  challengeThresholds: { ...DEFAULT_CHALLENGE_THRESHOLDS },
  faults: [],
  sharedScenarioLoaded: false,
  selectedNodeId: null,
  past: [],
  future: [],

  addNode: (type, position) =>
    set((state) =>
      withUndo(state, {
        nodes: [...state.nodes, createNode(type, position)],
      })
    ),

  duplicateNode: (id) =>
    set((state) => {
      const source = state.nodes.find((node) => node.id === id);
      if (!source) return {};
      nodeSequence += 1;
      const nextId = `${source.data.component.type}-${nodeSequence}`;
      const sourceConfig: Partial<ComponentConfig> = {
        ...source.data.component,
      };
      delete sourceConfig.id;
      delete sourceConfig.name;
      const duplicate: SimNode = {
        ...source,
        id: nextId,
        selected: false,
        position: {
          x: source.position.x + 48,
          y: source.position.y + 48,
        },
        data: {
          component: makeComponent(
            nextId,
            source.data.component.type,
            `${source.data.component.name} copy`,
            sourceConfig
          ),
        },
      };
      return withUndo(state, { nodes: [...state.nodes, duplicate] });
    }),

  removeNode: (id) =>
    set((state) => {
      if (!state.nodes.some((node) => node.id === id)) return {};
      const metricsById = Object.fromEntries(
        Object.entries(state.metricsById).filter(([nodeId]) => nodeId !== id)
      );
      const nodeHistory = Object.fromEntries(
        Object.entries(state.nodeHistory).filter(([nodeId]) => nodeId !== id)
      );
      return withUndo(state, {
        nodes: state.nodes.filter((node) => node.id !== id),
        edges: state.edges.filter(
          (edge) => edge.source !== id && edge.target !== id
        ),
        metricsById,
        nodeHistory,
        selectedNodeId:
          state.selectedNodeId === id ? null : state.selectedNodeId,
      });
    }),

  selectNode: (selectedNodeId) => set({ selectedNodeId }),

  updateNodeData: (id, patch) =>
    set((state) => ({
      nodes: state.nodes.map((node) =>
        node.id === id
          ? {
              ...node,
              data: {
                ...node.data,
                component: sanitizeComponent({
                  ...node.data.component,
                  ...patch,
                }),
              },
            }
          : node
      ),
    })),

  onNodesChange: (changes) =>
    set((state) => {
      const removed = new Set(
        changes.filter((change) => change.type === 'remove').map((change) => change.id)
      );
      const metricsById =
        removed.size > 0
          ? Object.fromEntries(
              Object.entries(state.metricsById).filter(([id]) => !removed.has(id))
            )
          : state.metricsById;
      const nodeHistory =
        removed.size > 0
          ? Object.fromEntries(
              Object.entries(state.nodeHistory).filter(([id]) => !removed.has(id))
            )
          : state.nodeHistory;
      const structural = changes.some(
        (change) => change.type === 'remove' || change.type === 'add'
      );
      const next = {
        nodes: applyNodeChanges(changes, state.nodes),
        edges:
          removed.size > 0
            ? state.edges.filter(
                (edge) => !removed.has(edge.source) && !removed.has(edge.target)
              )
            : state.edges,
        metricsById,
        nodeHistory,
        selectedNodeId:
          state.selectedNodeId && removed.has(state.selectedNodeId)
            ? null
            : state.selectedNodeId,
      };
      return structural ? withUndo(state, next) : next;
    }),

  onEdgesChange: (changes) =>
    set((state) => {
      const structural = changes.some(
        (change) => change.type === 'remove' || change.type === 'add'
      );
      const next = { edges: applyEdgeChanges(changes, state.edges) };
      return structural ? withUndo(state, next) : next;
    }),

  onConnect: (connection) =>
    set((state) =>
      withUndo(state, {
        edges: addEdge({ ...connection, ...EDGE_STYLE }, state.edges),
      })
    ),

  setNodePositions: (positions) =>
    set((state) =>
      withUndo(state, {
        nodes: state.nodes.map((node) => {
          const position = positions[node.id];
          return position ? { ...node, position } : node;
        }),
      })
    ),

  applyUpdate: (update) =>
    set((state) => {
      const nextNodeHistory = { ...state.nodeHistory };
      for (const [id, metrics] of Object.entries(update.nodes)) {
        const previous = nextNodeHistory[id] ?? [];
        nextNodeHistory[id] = [
          ...previous.slice(-(NODE_HISTORY_LIMIT - 1)),
          {
            t: update.time,
            queueDepth: metrics.queueDepth,
            utilization: metrics.utilization,
            errors: metrics.errors,
            dropped: metrics.dropped,
            p95Latency: metrics.p95Latency,
            cacheHitRate: metrics.cacheHitRate,
            instances: metrics.instances,
          },
        ];
      }

      return {
        metricsById: update.nodes,
        nodeHistory: nextNodeHistory,
        summary: update.summary,
        requestTraces:
          update.requestTraces.length === 0
            ? state.requestTraces
            : [...state.requestTraces, ...update.requestTraces].slice(
                -REQUEST_TRACE_HISTORY_LIMIT
              ),
        history: [
          ...state.history.slice(-(HISTORY_LIMIT - 1)),
          {
            t: update.time,
            rps: update.summary.completedRps,
            generatedRps: update.summary.generatedRps,
            p50: update.summary.p50Latency,
            p95: update.summary.p95Latency,
            p99: update.summary.p99Latency,
            errorRate: update.summary.errorRate,
            avgLatency: update.summary.avgLatency,
          },
        ],
      };
    }),

  setRunning: (running) => set({ running }),

  setLoadProfile: (loadProfile) => set({ loadProfile }),

  setScenarioSeed: (scenarioSeed) => set({ scenarioSeed }),

  setChallengeThresholds: (thresholds) =>
    set({ challengeThresholds: sanitizeThresholds(thresholds) }),

  setFaults: (faults) => set({ faults }),

  replaceScenario: (nodes, edges, settings, source = 'template') =>
    set(() => {
      for (const node of nodes) {
        const suffix = /-(\d+)$/.exec(node.id)?.[1];
        if (suffix) nodeSequence = Math.max(nodeSequence, Number(suffix));
      }

      return {
        nodes: nodes.map((node) => ({
          ...node,
          data: {
            ...node.data,
            component: sanitizeComponent(node.data.component),
          },
        })),
        edges: edges.map((edge) => ({ ...edge, ...EDGE_STYLE })),
        loadProfile: settings.loadProfile,
        scenarioSeed: settings.seed,
        challengeThresholds: sanitizeThresholds(settings.thresholds),
        faults: settings.faults ?? [],
        sharedScenarioLoaded: source === 'shared',
        selectedNodeId: null,
        running: false,
        history: [],
        nodeHistory: {},
        summary: null,
        metricsById: {},
        requestTraces: [],
        past: [],
        future: [],
      };
    }),

  resetMetrics: () =>
    set({
      metricsById: {},
      nodeHistory: {},
      history: [],
      summary: null,
      requestTraces: [],
    }),

  undo: () =>
    set((state) => {
      const previous = state.past[state.past.length - 1];
      if (!previous) return {};
      return {
        nodes: previous.nodes,
        edges: previous.edges,
        past: state.past.slice(0, -1),
        future: [...state.future, snapshot(state)],
      };
    }),

  redo: () =>
    set((state) => {
      const next = state.future[state.future.length - 1];
      if (!next) return {};
      return {
        nodes: next.nodes,
        edges: next.edges,
        past: [...state.past, snapshot(state)],
        future: state.future.slice(0, -1),
      };
    }),
}));

export type { ScenarioSnapshot };
