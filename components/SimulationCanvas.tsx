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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import MetricsPanel from './MetricsPanel';
import NodePalette, { DRAG_MIME } from './NodePalette';
import ChallengePanel from './ChallengePanel';
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
  stopTraceCapture,
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
const MINIMAP_STYLE = { marginBottom: 12, width: 168, height: 104 };

function createChallengeSeed(): number {
  const values = new Uint32Array(1);
  window.crypto.getRandomValues(values);
  return values[0] || 1;
}

function ElapsedTime() {
  const elapsed = useSimulationStore((state) => {
    const latest = state.history[state.history.length - 1];
    return latest?.t ?? 0;
  });

  return (
    <span className="px-1 font-mono text-[11px] tabular-nums text-muted">
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
    <div className="sim-workspace-toolbar z-10 grid h-[84px] shrink-0 grid-rows-[34px_34px] gap-1.5 px-3 py-1 lg:flex lg:min-h-[54px] lg:h-auto lg:items-center lg:gap-2 lg:px-5 lg:py-2">
      <div className="flex min-w-0 items-center gap-1.5 lg:gap-2">
        <button
          type="button"
          aria-label={running ? 'Pause simulation' : 'Run simulation'}
          onClick={() => setRunning(!running)}
          className={`sim-control-button flex shrink-0 items-center gap-2 whitespace-nowrap rounded-[3px] px-3 text-[12px] font-semibold transition-colors ${
            running
              ? 'bg-warning/10 text-warning-ink hover:bg-warning/15'
              : 'bg-ink text-surface hover:bg-[#243642]'
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
          className="sim-control-button shrink-0 whitespace-nowrap rounded-[3px] px-3 text-[12px] font-medium text-muted transition-colors hover:bg-paper hover:text-ink"
        >
          Reset
        </button>
        <ElapsedTime />
      </div>

      <span className="mx-1 hidden h-5 w-px bg-rule lg:block" />
      <div className="flex min-w-0 items-center gap-2 lg:gap-2.5">
        <span className="shrink-0 pl-1 text-[12px] font-medium text-muted">
          Load
        </span>
        <div className="flex min-w-0 items-center gap-0.5 rounded-[3px] border border-rule bg-paper p-0.5">
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
              className={`sim-profile-button min-h-[30px] shrink-0 whitespace-nowrap rounded-[2px] px-2.5 text-[11px] font-medium transition-colors ${
                loadProfile === profile.id
                  ? 'bg-ink text-surface'
                  : 'text-muted hover:bg-surface hover:text-ink'
              } disabled:cursor-not-allowed disabled:opacity-40`}
            >
              {profile.label}
            </button>
          ))}
        </div>
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
  const loadProfile = useSimulationStore((state) => state.loadProfile);
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
  const challengeSeed = useRef<number | null>(null);
  const latestHistory = history[history.length - 1];
  const elapsedMs = latestHistory?.t ?? 0;
  const traceNodeIds = useMemo(() => {
    const trace = challengeResult?.representativeTrace;
    return new Set(
      trace ? [trace.sourceGeneratorId, ...trace.hops.map((hop) => hop.componentId)] : []
    );
  }, [challengeResult]);
  const traceEdgeKeys = useMemo(() => {
    const trace = challengeResult?.representativeTrace;
    if (!trace) return new Set<string>();

    const edgeKeys = new Set<string>();
    let source = trace.sourceGeneratorId;
    for (const hop of trace.hops) {
      edgeKeys.add(`${source}\u0000${hop.componentId}`);
      source = hop.componentId;
    }
    return edgeKeys;
  }, [challengeResult]);
  const visibleNodes = useMemo(
    () =>
      nodes.map((node) =>
        traceNodeIds.has(node.id)
          ? {
              ...node,
              className: [node.className, 'sim-node-traced']
                .filter(Boolean)
                .join(' '),
            }
          : node
      ),
    [nodes, traceNodeIds]
  );
  const visibleEdges = useMemo(
    () =>
      edges.map((edge) => {
        const traced = traceEdgeKeys.has(`${edge.source}\u0000${edge.target}`);
        const targetMetrics = metricsById[edge.target];
        const active = running && (targetMetrics?.requestsIn ?? 0) > 0;
        const color =
          traced
            ? 'var(--live)'
            : targetMetrics?.down ||
                (targetMetrics?.dropped ?? 0) > 0 ||
                (targetMetrics?.utilization ?? 0) > 0.9
              ? 'var(--alarm)'
              : (targetMetrics?.utilization ?? 0) > 0.7
                ? 'var(--warning)'
                : active
                  ? 'var(--live)'
                  : 'var(--faint)';
        return {
          ...edge,
          animated: !traced && active,
          markerEnd:
            traced && edge.markerEnd && typeof edge.markerEnd === 'object'
              ? { ...edge.markerEnd, color: 'var(--live)' }
              : edge.markerEnd,
          style: {
            ...edge.style,
            stroke: color,
            strokeWidth: traced ? 2.75 : active ? 2 : 1.5,
          },
        };
      }),
    [edges, metricsById, running, traceEdgeKeys]
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
      stopTraceCapture();
      const result = evaluateSpikeChallenge(
        state.history,
        state.metricsById,
        state.nodes,
        state.summary,
        state.requestTraces
      );
      const traceNodeIds = result.representativeTrace
        ? [
            ...new Set([
              result.representativeTrace.sourceGeneratorId,
              ...result.representativeTrace.hops.map((hop) => hop.componentId),
            ]),
          ].filter((id) => state.nodes.some((node) => node.id === id))
        : [];
      if (traceNodeIds.length > 0) {
        void fitView({
          nodes: traceNodeIds.map((id) => ({ id })),
          padding: 0.65,
          maxZoom: 0.9,
          duration: 650,
        });
      } else if (!result.passed && result.bottleneckId) {
        void fitView({
          nodes: [{ id: result.bottleneckId }],
          padding: 0.65,
          maxZoom: 0.9,
          duration: 650,
        });
      }
      setChallengeResult(result);
      setBaselineResult((baseline) => baseline ?? result);
      setChallengeAttempt((attempt) => attempt + 1);
      setResultShareUrl(createChallengeUrl(state.nodes, state.edges));
      setChallengePhase('complete');
      state.setRunning(false);
      state.setLoadProfile('steady');
      applyLoadProfile('steady');
    });
  }, [challengePhase, fitView]);

  const startChallenge = () => {
    setShareNotice(null);
    setChallengeResult(null);
    setResultShareUrl(null);
    setChallengePhase('running');
    useSimulationStore.getState().resetMetrics();
    setLoadProfile('spike');
    const seed = challengeSeed.current ?? createChallengeSeed();
    challengeSeed.current = seed;
    resetSimulation({ seed, captureTraces: true });
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
    <div className="grid h-dvh w-full min-w-0 grid-rows-[104px_minmax(0,1fr)_52px] overflow-hidden bg-paper pb-[env(safe-area-inset-bottom)] text-ink lg:grid-cols-[248px_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)_52px] xl:grid-cols-[248px_minmax(0,1fr)_320px] xl:grid-rows-[minmax(0,1fr)]">
      <a
        href="#workspace"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-[3px] focus:bg-ink focus:px-3 focus:py-2 focus:text-[12px] focus:font-semibold focus:text-surface"
      >
        Skip to canvas
      </a>
      <NodePalette />
      <main
        id="workspace"
        tabIndex={-1}
        className="col-start-1 row-start-2 flex min-h-0 min-w-0 flex-col focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-live lg:col-start-2 lg:row-start-1"
      >
        <Toolbar challengeRunning={challengePhase === 'running'} />
        <div
          className="sim-canvas-surface relative min-h-0 min-w-0 flex-1"
          onDrop={onDrop}
          onDragOver={onDragOver}
        >
          <ReactFlow
            nodes={visibleNodes}
            edges={visibleEdges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            colorMode="light"
            fitView
            fitViewOptions={FIT_VIEW_OPTIONS}
            minZoom={0.25}
            deleteKeyCode={DELETE_KEY_CODE}
            defaultEdgeOptions={DEFAULT_EDGE_OPTIONS}
          >
            <Background gap={24} size={1} color="#cfdae2" />
            <Controls position="top-right" />
            <MiniMap
              position="bottom-right"
              pannable
              zoomable
              style={MINIMAP_STYLE}
              nodeColor="#5c6b75"
              maskColor="rgba(232, 238, 242, 0.72)"
            />
          </ReactFlow>
          <div className="pointer-events-none absolute bottom-3 left-3 z-10 hidden items-center gap-4 border border-rule bg-surface px-3 py-1.5 lg:flex">
            <span className="font-mono text-[10px] text-faint">
              SHEET <span className="text-ink">01</span>
            </span>
            <span className="font-mono text-[10px] text-faint">
              LOAD <span className="text-ink uppercase">{loadProfile}</span>
            </span>
            <span className="font-mono text-[10px] text-faint">
              NODES{' '}
              <span className="tabular-nums text-ink">
                {String(nodes.length).padStart(2, '0')}
              </span>
            </span>
          </div>
        </div>
        <MetricsPanel />
      </main>
      <ChallengePanel {...challengePanel} />
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
