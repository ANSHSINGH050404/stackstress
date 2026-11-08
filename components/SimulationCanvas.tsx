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
import { useCallback, useEffect, useMemo, useState } from 'react';
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
import {
  evaluateSpikeChallenge,
  scaleComponentCapacity,
  SPIKE_CHALLENGE_DURATION_MS,
  type ChallengePhase,
  type ChallengeResult,
} from '@/lib/challenges';
import { createChallengeUrl, createXIntentUrl, downloadChallengeCard } from '@/lib/sharing';
import { decodeSharedSimulation } from '@/lib/shared-simulation';
import { COMPONENT_DEFAULTS, useSimulationStore } from '@/lib/store';
import type { ComponentType, LoadProfile } from '@/types';

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

const FIT_VIEW_OPTIONS = { padding: 0.22 };
const DELETE_KEY_CODE = ['Backspace', 'Delete'];
const DEFAULT_EDGE_OPTIONS = { type: 'smoothstep' as const };
const MINIMAP_STYLE = { marginBottom: 150 };

function ElapsedTime() {
  const elapsed = useSimulationStore((state) => {
    const latest = state.history[state.history.length - 1];
    return latest?.t ?? 0;
  });

  return (
    <span className="px-1 text-[10px] tabular-nums text-slate-500">
      t {formatDuration(elapsed)}
    </span>
  );
}

function Toolbar({ challengeRunning }: { challengeRunning: boolean }) {
  const running = useSimulationStore((state) => state.running);
  const setRunning = useSimulationStore((state) => state.setRunning);
  const resetMetrics = useSimulationStore((state) => state.resetMetrics);
  const loadProfile = useSimulationStore((state) => state.loadProfile);
  const setLoadProfile = useSimulationStore((state) => state.setLoadProfile);

  return (
    <div className="sim-toolbar-enter absolute left-4 top-4 z-10 flex items-center gap-1.5 rounded-xl border border-slate-800/80 bg-[#0a111a]/90 px-2 py-1.5 shadow-lg shadow-black/30 backdrop-blur">
      <button
        type="button"
        aria-label={running ? 'Pause simulation' : 'Run simulation'}
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
        aria-label="Reset simulation"
        onClick={() => {
          resetSimulation();
          resetMetrics();
        }}
        className="rounded-lg px-2.5 py-1 text-[11px] font-medium text-slate-400 transition-colors hover:bg-slate-800/70 hover:text-slate-200"
      >
        Reset
      </button>
      <ElapsedTime />
      <span className="ml-1 h-4 w-px bg-slate-800" />
      <span className="pl-1 text-[9px] font-medium uppercase tracking-wider text-slate-500">
        Load
      </span>
      <div className="flex items-center gap-0.5 rounded-lg border border-slate-800 bg-slate-900/60 p-0.5">
        {LOAD_PROFILES.map((profile) => (
          <button
            key={profile.id}
            type="button"
            aria-label={`Select ${profile.label} load profile`}
            onClick={() => {
              setLoadProfile(profile.id);
              applyLoadProfile(profile.id);
            }}
            disabled={challengeRunning}
            className={`rounded-md px-2 py-1 text-[10px] font-medium transition-colors ${
              loadProfile === profile.id
                ? 'bg-slate-700/80 text-slate-100'
                : 'text-slate-500 hover:text-slate-300'
            } disabled:cursor-not-allowed disabled:opacity-40`}
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
  const history = useSimulationStore((state) => state.history);
  const metricsById = useSimulationStore((state) => state.metricsById);
  const running = useSimulationStore((state) => state.running);
  const isSharedScenario = useSimulationStore((state) => state.sharedScenarioLoaded);
  const onNodesChange = useSimulationStore((state) => state.onNodesChange);
  const onEdgesChange = useSimulationStore((state) => state.onEdgesChange);
  const onConnect = useSimulationStore((state) => state.onConnect);
  const addNode = useSimulationStore((state) => state.addNode);
  const setRunning = useSimulationStore((state) => state.setRunning);
  const setLoadProfile = useSimulationStore((state) => state.setLoadProfile);
  const replaceScenario = useSimulationStore((state) => state.replaceScenario);
  const updateNodeData = useSimulationStore((state) => state.updateNodeData);
  const { fitView, screenToFlowPosition } = useReactFlow();
  const [challengePhase, setChallengePhase] = useState<ChallengePhase>('ready');
  const [challengeResult, setChallengeResult] = useState<ChallengeResult | null>(null);
  const [baselineResult, setBaselineResult] = useState<ChallengeResult | null>(null);
  const [challengeAttempt, setChallengeAttempt] = useState(0);
  const [shareNotice, setShareNotice] = useState<string | null>(null);
  const [resultShareUrl, setResultShareUrl] = useState<string | null>(null);
  const latestHistory = history[history.length - 1];
  const elapsedMs = latestHistory?.t ?? 0;
  const visibleEdges = useMemo(
    () =>
      edges.map((edge) => {
        const targetMetrics = metricsById[edge.target];
        const active = running && (targetMetrics?.requestsIn ?? 0) > 0;
        const color =
          targetMetrics?.down ||
          (targetMetrics?.dropped ?? 0) > 0 ||
          (targetMetrics?.utilization ?? 0) > 0.9
            ? '#fb7185'
            : (targetMetrics?.utilization ?? 0) > 0.7
              ? '#fbbf24'
              : active
                ? '#38bdf8'
                : '#334155';
        return {
          ...edge,
          animated: active,
          style: {
            ...edge.style,
            stroke: color,
            strokeWidth: active ? 2 : 1.5,
          },
        };
      }),
    [edges, metricsById, running]
  );

  useEffect(() => {
    let fitFrame: number | undefined;
    const params = new URLSearchParams(window.location.search);
    const token = params.get('state');
    if (token) {
      const shared = decodeSharedSimulation(token);
      if (shared) {
        replaceScenario(shared.nodes, shared.edges, shared.loadProfile);
        resetSimulation();
        fitFrame = window.requestAnimationFrame(() => {
          void fitView(FIT_VIEW_OPTIONS);
        });
      }
    }
    startSimulation();
    return () => {
      if (fitFrame !== undefined) window.cancelAnimationFrame(fitFrame);
      stopSimulation();
    };
  }, [fitView, replaceScenario]);

  useEffect(() => {
    if (challengePhase !== 'running') return;

    let completed = false;
    return useSimulationStore.subscribe((state) => {
      const latest = state.history[state.history.length - 1];
      if (
        completed ||
        !state.running ||
        !latest ||
        latest.t < SPIKE_CHALLENGE_DURATION_MS
      ) {
        return;
      }

      completed = true;
      const result = evaluateSpikeChallenge(
        state.history,
        state.metricsById,
        state.nodes,
        state.summary
      );
      setChallengeResult(result);
      setBaselineResult((baseline) => baseline ?? result);
      setChallengeAttempt((attempt) => attempt + 1);
      setResultShareUrl(createChallengeUrl(state.nodes, state.edges));
      setChallengePhase('complete');
      state.setRunning(false);
      state.setLoadProfile('steady');
      applyLoadProfile('steady');
    });
  }, [challengePhase]);

  const startChallenge = () => {
    setShareNotice(null);
    setChallengeResult(null);
    setResultShareUrl(null);
    setChallengePhase('running');
    useSimulationStore.getState().resetMetrics();
    setLoadProfile('spike');
    resetSimulation();
    applyLoadProfile('spike');
    setRunning(true);
  };

  const scaleBottleneck = () => {
    if (!challengeResult?.bottleneckId) return;
    const bottleneck = nodes.find((node) => node.id === challengeResult.bottleneckId);
    if (!bottleneck) return;

    updateNodeData(bottleneck.id, {
      throughputLimit: scaleComponentCapacity(bottleneck.data.component),
    });
    setShareNotice(`${bottleneck.data.component.name} capacity increased. Run the challenge again.`);
  };

  const copyChallengeLink = async () => {
    const url = createChallengeUrl(nodes, edges);
    if (!url) {
      setShareNotice('This architecture is too large to share as a link.');
      return;
    }

    try {
      await navigator.clipboard.writeText(url);
      setShareNotice('Challenge link copied.');
    } catch {
      setShareNotice('Clipboard access is unavailable in this browser.');
    }
  };

  const xShareHref =
    challengeResult && resultShareUrl
      ? createXIntentUrl(challengeResult, resultShareUrl)
      : null;
  const downloadResultCard = () => {
    if (!challengeResult) return;
    downloadChallengeCard(challengeResult, baselineResult, challengeAttempt);
  };

  const challengePanel = {
    phase: challengePhase,
    elapsedMs,
    attempt: challengeAttempt,
    baseline: baselineResult,
    result: challengeResult,
    isSharedScenario,
    shareNotice,
    onStart: startChallenge,
    onScaleBottleneck: scaleBottleneck,
    onCopyLink: copyChallengeLink,
    onDownloadCard: downloadResultCard,
    xShareHref,
  };

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
    <div className="flex h-dvh w-screen flex-col overflow-hidden bg-[#080d13] text-slate-200 md:flex-row">
      <NodePalette challenge={challengePanel} />
      <div
        className="relative min-h-0 min-w-0 flex-1"
        onDrop={onDrop}
        onDragOver={onDragOver}
      >
        <ReactFlow
          nodes={nodes}
          edges={visibleEdges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          colorMode="dark"
          fitView
          fitViewOptions={FIT_VIEW_OPTIONS}
          minZoom={0.25}
          deleteKeyCode={DELETE_KEY_CODE}
          defaultEdgeOptions={DEFAULT_EDGE_OPTIONS}
        >
          <Background gap={22} size={1} color="#16202c" />
          <Controls position="top-right" />
          <MiniMap
            position="bottom-right"
            pannable
            zoomable
            style={MINIMAP_STYLE}
            nodeColor="#334155"
            maskColor="rgba(8, 13, 19, 0.75)"
          />
        </ReactFlow>
        <Toolbar challengeRunning={challengePhase === 'running'} />
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
