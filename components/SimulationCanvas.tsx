'use client';

import {
  Background,
  Controls,
  MiniMap,
  NodeTypes,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useCallback, useEffect } from 'react';
import MetricsPanel from './MetricsPanel';
import NodePalette, { DRAG_MIME } from './NodePalette';
import CacheNode from './nodes/CacheNode';
import DatabaseNode from './nodes/DatabaseNode';
import LoadBalancerNode from './nodes/LoadBalancerNode';
import ServiceNode from './nodes/ServiceNode';
import TrafficGeneratorNode from './nodes/TrafficGeneratorNode';
import { formatDuration } from '@/lib/format';
import {
  applyLoadProfile,
  resetSimulation,
  startSimulation,
  stopSimulation,
} from '@/lib/simulationClient';
import { COMPONENT_DEFAULTS, useSimulationStore } from '@/lib/store';
import { ComponentType, LoadProfile } from '@/types';

const nodeTypes = {
  'traffic-generator': TrafficGeneratorNode,
  'load-balancer': LoadBalancerNode,
  service: ServiceNode,
  cache: CacheNode,
  database: DatabaseNode,
} satisfies NodeTypes;

const LOAD_PROFILES: Array<{ id: LoadProfile; label: string }> = [
  { id: 'steady', label: 'Steady' },
  { id: 'spike', label: 'Spike' },
  { id: 'ramp', label: 'Ramp' },
];

function Toolbar() {
  const running = useSimulationStore((state) => state.running);
  const setRunning = useSimulationStore((state) => state.setRunning);
  const resetMetrics = useSimulationStore((state) => state.resetMetrics);
  const loadProfile = useSimulationStore((state) => state.loadProfile);
  const setLoadProfile = useSimulationStore((state) => state.setLoadProfile);
  const elapsed = useSimulationStore((state) => {
    const latest = state.history[state.history.length - 1];
    return latest?.t ?? 0;
  });

  return (
    <div className="absolute left-4 top-4 z-10 flex items-center gap-1.5 rounded-xl border border-slate-800/80 bg-[#0a111a]/90 px-2 py-1.5 shadow-lg shadow-black/30 backdrop-blur">
      <button
        type="button"
        onClick={() => setRunning(!running)}
        className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors ${
          running
            ? 'bg-amber-400/15 text-amber-300 hover:bg-amber-400/25'
            : 'bg-emerald-400/15 text-emerald-300 hover:bg-emerald-400/25'
        }`}
      >
        <span className="flex items-center gap-[2px]">
          {running ? (
            <>
              <span className="h-2 w-[2px] rounded-sm bg-current" />
              <span className="h-2 w-[2px] rounded-sm bg-current" />
            </>
          ) : (
            <span
              style={{
                width: 0,
                height: 0,
                borderTop: '4px solid transparent',
                borderBottom: '4px solid transparent',
                borderLeft: '6px solid currentColor',
              }}
            />
          )}
        </span>
        {running ? 'Pause' : 'Run'}
      </button>
      <button
        type="button"
        onClick={() => {
          resetSimulation();
          resetMetrics();
        }}
        className="rounded-lg px-2.5 py-1 text-[11px] font-medium text-slate-400 transition-colors hover:bg-slate-800/70 hover:text-slate-200"
      >
        Reset
      </button>
      <span className="px-1 text-[10px] tabular-nums text-slate-500">
        t {formatDuration(elapsed)}
      </span>
      <span className="ml-1 h-4 w-px bg-slate-800" />
      <span className="pl-1 text-[9px] font-medium uppercase tracking-wider text-slate-500">
        Load
      </span>
      <div className="flex items-center gap-0.5 rounded-lg border border-slate-800 bg-slate-900/60 p-0.5">
        {LOAD_PROFILES.map((profile) => (
          <button
            key={profile.id}
            type="button"
            onClick={() => {
              setLoadProfile(profile.id);
              applyLoadProfile(profile.id);
            }}
            className={`rounded-md px-2 py-1 text-[10px] font-medium transition-colors ${
              loadProfile === profile.id
                ? 'bg-slate-700/80 text-slate-100'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            {profile.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Simulator() {
  const nodes = useSimulationStore((state) => state.nodes);
  const edges = useSimulationStore((state) => state.edges);
  const onNodesChange = useSimulationStore((state) => state.onNodesChange);
  const onEdgesChange = useSimulationStore((state) => state.onEdgesChange);
  const onConnect = useSimulationStore((state) => state.onConnect);
  const addNode = useSimulationStore((state) => state.addNode);
  const { screenToFlowPosition } = useReactFlow();

  useEffect(() => {
    startSimulation();
    return () => stopSimulation();
  }, []);

  const onDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      const raw = event.dataTransfer.getData(DRAG_MIME);
      if (!raw || !(raw in COMPONENT_DEFAULTS)) return;
      addNode(
        raw as ComponentType,
        screenToFlowPosition({ x: event.clientX, y: event.clientY })
      );
    },
    [addNode, screenToFlowPosition]
  );

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#080d13] text-slate-200">
      <NodePalette />
      <div className="relative min-w-0 flex-1" onDrop={onDrop} onDragOver={onDragOver}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          colorMode="dark"
          fitView
          fitViewOptions={{ padding: 0.22 }}
          minZoom={0.25}
          deleteKeyCode={['Backspace', 'Delete']}
          defaultEdgeOptions={{ type: 'smoothstep' }}
        >
          <Background gap={22} size={1} color="#16202c" />
          <Controls position="top-right" />
          <MiniMap
            position="bottom-right"
            pannable
            zoomable
            style={{ marginBottom: 150 }}
            nodeColor="#334155"
            maskColor="rgba(8, 13, 19, 0.75)"
          />
        </ReactFlow>
        <Toolbar />
        <MetricsPanel />
      </div>
    </div>
  );
}

export default function SimulationCanvas() {
  return (
    <ReactFlowProvider>
      <Simulator />
    </ReactFlowProvider>
  );
}
