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
  ComponentConfig,
  ComponentType,
  LoadProfile,
  NodeMetrics,
  SimulationSummary,
  SimulationUpdate,
} from '../types';

export type SimNodeData = {
  component: ComponentConfig;
};

export type SimNode = Node<SimNodeData>;

export interface HistoryPoint {
  t: number;
  rps: number;
  generatedRps: number;
  p95: number;
  errorRate: number;
  avgLatency: number;
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
    description: 'Low-latency read path',
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
  },
  service: {
    type: 'service',
    throughputLimit: 150,
    latency: 15,
    failureRate: 0,
    queueCapacity: 200,
  },
  cache: {
    type: 'cache',
    throughputLimit: 2000,
    latency: 0.5,
    failureRate: 0,
    queueCapacity: 2000,
  },
  database: {
    type: 'database',
    throughputLimit: 120,
    latency: 25,
    failureRate: 0,
    queueCapacity: 100,
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
  return { id, name, ...COMPONENT_DEFAULTS[type], ...overrides };
}

const initialNodes: SimNode[] = [
  {
    id: 'gen-1',
    type: 'traffic-generator',
    position: { x: 40, y: 260 },
    data: { component: makeComponent('gen-1', 'traffic-generator', 'Traffic Generator') },
  },
  {
    id: 'lb-1',
    type: 'load-balancer',
    position: { x: 320, y: 260 },
    data: { component: makeComponent('lb-1', 'load-balancer', 'Load Balancer') },
  },
  {
    id: 'svc-1',
    type: 'service',
    position: { x: 600, y: 20 },
    data: { component: makeComponent('svc-1', 'service', 'Service A') },
  },
  {
    id: 'svc-2',
    type: 'service',
    position: { x: 600, y: 470 },
    data: { component: makeComponent('svc-2', 'service', 'Service B') },
  },
  {
    id: 'db-1',
    type: 'database',
    position: { x: 900, y: 260 },
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

interface SimulationStore {
  nodes: SimNode[];
  edges: Edge[];
  history: HistoryPoint[];
  summary: SimulationSummary | null;
  metricsById: Record<string, NodeMetrics>;
  running: boolean;
  loadProfile: LoadProfile;
  sharedScenarioLoaded: boolean;
  addNode: (type: ComponentType, position: XYPosition) => void;
  updateNodeData: (id: string, patch: Partial<ComponentConfig>) => void;
  onNodesChange: OnNodesChange<SimNode>;
  onEdgesChange: OnEdgesChange;
  onConnect: OnConnect;
  applyUpdate: (update: SimulationUpdate) => void;
  setRunning: (running: boolean) => void;
  setLoadProfile: (profile: LoadProfile) => void;
  replaceScenario: (nodes: SimNode[], edges: Edge[], loadProfile: LoadProfile) => void;
  resetMetrics: () => void;
}

const HISTORY_LIMIT = 120;

export const useSimulationStore = create<SimulationStore>((set) => ({
  nodes: initialNodes,
  edges: initialEdges,
  history: [],
  summary: null,
  metricsById: {},
  running: false,
  loadProfile: 'steady',
  sharedScenarioLoaded: false,

  addNode: (type, position) =>
    set((state) => ({
      nodes: [...state.nodes, createNode(type, position)],
    })),

  updateNodeData: (id, patch) =>
    set((state) => ({
      nodes: state.nodes.map((node) =>
        node.id === id
          ? {
              ...node,
              data: {
                ...node.data,
                component: { ...node.data.component, ...patch },
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
      return {
        nodes: applyNodeChanges(changes, state.nodes),
        edges:
          removed.size > 0
            ? state.edges.filter(
                (edge) => !removed.has(edge.source) && !removed.has(edge.target)
              )
            : state.edges,
        metricsById,
      };
    }),

  onEdgesChange: (changes) =>
    set((state) => ({
      edges: applyEdgeChanges(changes, state.edges),
    })),

  onConnect: (connection) =>
    set((state) => ({
      edges: addEdge({ ...connection, ...EDGE_STYLE }, state.edges),
    })),

  applyUpdate: (update) =>
    set((state) => ({
      metricsById: update.nodes,
      summary: update.summary,
      history: [
        ...state.history.slice(-(HISTORY_LIMIT - 1)),
        {
          t: update.time,
          rps: update.summary.completedRps,
          generatedRps: update.summary.generatedRps,
          p95: update.summary.p95Latency,
          errorRate: update.summary.errorRate,
          avgLatency: update.summary.avgLatency,
        },
      ],
    })),

  setRunning: (running) => set({ running }),

  setLoadProfile: (loadProfile) => set({ loadProfile }),

  replaceScenario: (nodes, edges, loadProfile) =>
    set(() => {
      for (const node of nodes) {
        const suffix = /-(\d+)$/.exec(node.id)?.[1];
        if (suffix) nodeSequence = Math.max(nodeSequence, Number(suffix));
      }

      return {
        nodes,
        edges: edges.map((edge) => ({ ...edge, ...EDGE_STYLE })),
        loadProfile,
        sharedScenarioLoaded: true,
        running: false,
        history: [],
        summary: null,
        metricsById: {},
      };
    }),

  resetMetrics: () =>
    set({
      metricsById: {},
      history: [],
      summary: null,
    }),
}));
