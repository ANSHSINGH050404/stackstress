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
  metrics?: NodeMetrics;
};

export type SimNode = Node<SimNodeData>;

export interface HistoryPoint {
  t: number;
  rps: number;
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
    color: '#38bdf8',
  },
  'load-balancer': {
    label: 'Load Balancer',
    description: 'Spread requests across targets',
    color: '#a78bfa',
  },
  service: {
    label: 'Service',
    description: 'Stateless request processing',
    color: '#34d399',
  },
  cache: {
    label: 'Cache',
    description: 'Low-latency read path',
    color: '#fbbf24',
  },
  database: {
    label: 'Database',
    description: 'Stateful storage bottleneck',
    color: '#fb7185',
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
  style: { stroke: '#334155', strokeWidth: 1.5 },
  markerEnd: { type: MarkerType.ArrowClosed, color: '#475569' },
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
  running: boolean;
  loadProfile: LoadProfile;
  addNode: (type: ComponentType, position: XYPosition) => void;
  updateNodeData: (id: string, patch: Partial<ComponentConfig>) => void;
  onNodesChange: OnNodesChange<SimNode>;
  onEdgesChange: OnEdgesChange;
  onConnect: OnConnect;
  applyUpdate: (update: SimulationUpdate) => void;
  setRunning: (running: boolean) => void;
  setLoadProfile: (profile: LoadProfile) => void;
  resetMetrics: () => void;
}

const HISTORY_LIMIT = 120;

export const useSimulationStore = create<SimulationStore>((set) => ({
  nodes: initialNodes,
  edges: initialEdges,
  history: [],
  summary: null,
  running: true,
  loadProfile: 'steady',

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
      return {
        nodes: applyNodeChanges(changes, state.nodes),
        edges:
          removed.size > 0
            ? state.edges.filter(
                (edge) => !removed.has(edge.source) && !removed.has(edge.target)
              )
            : state.edges,
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
      nodes: state.nodes.map((node) => {
        const metrics = update.nodes[node.id];
        if (!metrics) return node;
        return {
          ...node,
          data: { ...node.data, metrics },
        };
      }),
      summary: update.summary,
      history: [
        ...state.history.slice(-(HISTORY_LIMIT - 1)),
        {
          t: update.time,
          rps: update.summary.completedRps,
          p95: update.summary.p95Latency,
          errorRate: update.summary.errorRate,
          avgLatency: update.summary.avgLatency,
        },
      ],
    })),

  setRunning: (running) => set({ running }),

  setLoadProfile: (loadProfile) => set({ loadProfile }),

  resetMetrics: () =>
    set((state) => ({
      nodes: state.nodes.map((node) => ({
        ...node,
        data: { ...node.data, metrics: undefined },
      })),
      history: [],
      summary: null,
    })),
}));
