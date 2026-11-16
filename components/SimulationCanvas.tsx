'use client';

import {
  Background,
  Controls,
  MiniMap,
  NodeTypes,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useCallback, useEffect, useMemo, useState } from 'react';
import MetricsPanel from './MetricsPanel';
import NodePalette, { DRAG_MIME } from './NodePalette';
import ChallengePanel from './ChallengePanel';
import InspectorPanel from './InspectorPanel';
import ScenarioPicker from './ScenarioPicker';
import GraphHealth from './GraphHealth';
import CommandPalette, { type PaletteCommand } from './CommandPalette';
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
import {
  createChallengeUrl,
  createXIntentUrl,
  downloadChallengeCard,
} from '@/lib/sharing';
import { decodeSharedSimulation } from '@/lib/shared-simulation';
import {
  COMPONENT_DEFAULTS,
  useSimulationStore,
  type SimNode,
} from '@/lib/store';
import { buildFixCandidates, findBreakingPoint, type BenchmarkResult, type FixCandidate } from '@/lib/benchmark';
import { tidyPositions } from '@/lib/layout';
import { loadSavedScenario, saveScenario } from '@/lib/persistence';
import { getDailyChallenge, type DailyChallenge } from '@/lib/daily';
import { SCENARIOS, type ScenarioDefinition } from '@/lib/scenarios';
import type { ChallengeThresholds, ComponentType, LoadProfile } from '@/types';

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

function ensureScenarioSeed(): number {
  const state = useSimulationStore.getState();
  if (state.scenarioSeed !== null) return state.scenarioSeed;

  const seed = createChallengeSeed();
  state.setScenarioSeed(seed);
  return seed;
}

function currentChallengeUrl(nodes: SimNode[], edges: Edge[]): string | null {
  const state = useSimulationStore.getState();
  const seed = ensureScenarioSeed();
  return createChallengeUrl({
    nodes,
    edges,
    loadProfile: 'spike',
    seed,
    thresholds: state.challengeThresholds,
    faults: state.faults.length > 0 ? state.faults : undefined,
  });
}

function signatureOf(nodes: SimNode[], edges: Edge[]): string {
  return JSON.stringify({
    components: nodes.map((node) => node.data.component),
    edges: edges.map((edge) => [edge.source, edge.target]),
  });
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

interface ToolbarProps {
  challengeRunning: boolean;
  activeScenarioId: string | null;
  daily: DailyChallenge | null;
  canUndo: boolean;
  canRedo: boolean;
  onSelectScenario: (scenario: ScenarioDefinition) => void;
  onDaily: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onTidy: () => void;
  onReset: () => void;
  onOpenPalette: () => void;
}

function Toolbar({
  challengeRunning,
  activeScenarioId,
  daily,
  canUndo,
  canRedo,
  onSelectScenario,
  onDaily,
  onUndo,
  onRedo,
  onTidy,
  onReset,
  onOpenPalette,
}: ToolbarProps) {
  const running = useSimulationStore((state) => state.running);
  const setRunning = useSimulationStore((state) => state.setRunning);
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
          onClick={onReset}
          className="sim-control-button shrink-0 whitespace-nowrap rounded-[3px] px-3 text-[12px] font-medium text-muted transition-colors hover:bg-paper hover:text-ink"
        >
          Reset
        </button>
        <ScenarioPicker
          activeId={activeScenarioId}
          daily={daily}
          onSelect={onSelectScenario}
          onDaily={onDaily}
        />
        <span className="ml-auto flex items-center">
          <ElapsedTime />
        </span>
      </div>

      <span className="mx-1 hidden h-5 w-px bg-rule lg:block" />
      <div className="flex min-w-0 items-center gap-1.5 lg:gap-2.5">
        <span className="hidden shrink-0 pl-1 text-[12px] font-medium text-muted sm:inline">
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

        <span className="mx-0.5 hidden h-5 w-px bg-rule sm:block" />
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            aria-label="Undo graph change"
            title="Undo (Ctrl/Cmd+Z)"
            disabled={!canUndo}
            onClick={onUndo}
            className="sim-control-button grid min-w-8 place-items-center rounded-[2px] px-1.5 text-[14px] text-muted transition-colors hover:bg-paper hover:text-ink disabled:cursor-not-allowed disabled:opacity-35"
          >
            ↶
          </button>
          <button
            type="button"
            aria-label="Redo graph change"
            title="Redo (Ctrl/Cmd+Shift+Z)"
            disabled={!canRedo}
            onClick={onRedo}
            className="sim-control-button grid min-w-8 place-items-center rounded-[2px] px-1.5 text-[14px] text-muted transition-colors hover:bg-paper hover:text-ink disabled:cursor-not-allowed disabled:opacity-35"
          >
            ↷
          </button>
          <button
            type="button"
            onClick={onTidy}
            className="sim-control-button whitespace-nowrap rounded-[2px] px-2 text-[11px] font-medium text-muted transition-colors hover:bg-paper hover:text-ink"
          >
            Tidy
          </button>
        </div>

        <a
          href="https://github.com/ANSHSINGH050404/stackstress"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="GitHub repository"
          className="sim-control-button hidden shrink-0 items-center justify-center min-w-8 rounded-[2px] border border-rule bg-paper text-muted transition-colors hover:text-ink lg:flex"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
          </svg>
        </a>

        <button
          type="button"
          onClick={onOpenPalette}
          className="sim-control-button ml-auto hidden shrink-0 items-center gap-1.5 rounded-[2px] border border-rule bg-paper px-2.5 text-[10px] font-medium text-muted transition-colors hover:text-ink lg:flex"
        >
          Commands
          <kbd className="rounded-[1px] border border-rule bg-surface px-1 font-mono text-[9px]">
            Ctrl K
          </kbd>
        </button>
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
  const challengeThresholds = useSimulationStore(
    (state) => state.challengeThresholds
  );
  const isSharedScenario = useSimulationStore(
    (state) => state.sharedScenarioLoaded
  );
  const pastCount = useSimulationStore((state) => state.past.length);
  const futureCount = useSimulationStore((state) => state.future.length);
  const onNodesChange = useSimulationStore((state) => state.onNodesChange);
  const onEdgesChange = useSimulationStore((state) => state.onEdgesChange);
  const onConnect = useSimulationStore((state) => state.onConnect);
  const addNode = useSimulationStore((state) => state.addNode);
  const setRunning = useSimulationStore((state) => state.setRunning);
  const setLoadProfile = useSimulationStore((state) => state.setLoadProfile);
  const replaceScenario = useSimulationStore((state) => state.replaceScenario);
  const updateNodeData = useSimulationStore((state) => state.updateNodeData);
  const selectNode = useSimulationStore((state) => state.selectNode);
  const undo = useSimulationStore((state) => state.undo);
  const redo = useSimulationStore((state) => state.redo);
  const setNodePositions = useSimulationStore((state) => state.setNodePositions);
  const setChallengeThresholds = useSimulationStore(
    (state) => state.setChallengeThresholds
  );
  const { fitView, screenToFlowPosition } = useReactFlow();
  const [challengePhase, setChallengePhase] = useState<ChallengePhase>('ready');
  const [challengeResult, setChallengeResult] =
    useState<ChallengeResult | null>(null);
  const [baselineResult, setBaselineResult] =
    useState<ChallengeResult | null>(null);
  const [challengeAttempt, setChallengeAttempt] = useState(0);
  const [shareNotice, setShareNotice] = useState<string | null>(null);
  const [resultShareUrl, setResultShareUrl] = useState<string | null>(null);
  const [activeScenarioId, setActiveScenarioId] = useState<string | null>(null);
  const [daily, setDaily] = useState<DailyChallenge | null>(null);
  const [today, setToday] = useState<DailyChallenge | null>(null);
  const [benchmark, setBenchmark] = useState<BenchmarkResult | null>(null);
  const [benchmarkSignature, setBenchmarkSignature] = useState<string | null>(
    null
  );
  const [benchmarkRunning, setBenchmarkRunning] = useState(false);
  const [fixCandidates, setFixCandidates] = useState<FixCandidate[]>([]);
  const [fixSignature, setFixSignature] = useState<string | null>(null);
  const [fixLabRunning, setFixLabRunning] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    // Reading the clock must happen after prerender. The daily label is only
    // visible inside menus that open after mount, so a deferred read is fine.
    const timer = window.setTimeout(() => setToday(getDailyChallenge()), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const latestHistory = history[history.length - 1];
  const elapsedMs = latestHistory?.t ?? 0;
  const traceNodeIds = useMemo(() => {
    const trace = challengeResult?.representativeTrace;
    return new Set(
      trace
        ? [
            trace.sourceGeneratorId,
            ...trace.hops.map((hop) => hop.componentId),
          ]
        : []
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
  const maxIncoming = useMemo(
    () =>
      Math.max(
        1,
        ...Object.values(metricsById).map((metrics) => metrics.requestsIn)
      ),
    [metricsById]
  );
  const visibleEdges = useMemo(
    () =>
      edges.map((edge) => {
        const traced = traceEdgeKeys.has(`${edge.source}\u0000${edge.target}`);
        const targetMetrics = metricsById[edge.target];
        const active = running && (targetMetrics?.requestsIn ?? 0) > 0;
        const loadRatio = Math.min(
          1,
          (targetMetrics?.requestsIn ?? 0) / maxIncoming
        );
        const color = traced
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
            strokeWidth: traced
              ? 2.75
              : active
                ? 1.25 + 2.25 * loadRatio
                : 1.25,
          },
        };
      }),
    [edges, metricsById, running, traceEdgeKeys, maxIncoming]
  );

  const graphSignature = useMemo(
    () => signatureOf(nodes, edges),
    [nodes, edges]
  );
  const activeBenchmark =
    benchmarkSignature === graphSignature ? benchmark : null;
  const activeFixCandidates =
    fixSignature === graphSignature ? fixCandidates : [];

  // Restore a shared URL first, then the local autosave, then the starter graph.
  useEffect(() => {
    let fitFrame: number | undefined;
    let loaded = false;
    const params = new URLSearchParams(window.location.search);
    const token = params.get('state');
    if (token) {
      const shared = decodeSharedSimulation(token);
      if (shared) {
        replaceScenario(
          shared.nodes,
          shared.edges,
          {
            loadProfile: shared.loadProfile,
            seed: shared.seed,
            thresholds: shared.thresholds,
            faults: shared.faults,
          },
          'shared'
        );
        resetSimulation({ seed: shared.seed, faults: shared.faults ?? [] });
        selectNode(null);
        loaded = true;
      }
    } else {
      const saved = loadSavedScenario();
      if (saved) {
        const seed = saved.seed ?? createChallengeSeed();
        replaceScenario(
          saved.nodes,
          saved.edges,
          {
            loadProfile: saved.loadProfile,
            seed,
            thresholds: saved.thresholds,
            faults: saved.faults,
          },
          'saved'
        );
        resetSimulation({ seed, faults: saved.faults });
        loaded = true;
      }
    }

    if (loaded) {
      fitFrame = window.requestAnimationFrame(() => {
        void fitView(FIT_VIEW_OPTIONS);
      });
    }
    startSimulation();
    return () => {
      if (fitFrame !== undefined) window.cancelAnimationFrame(fitFrame);
      stopSimulation();
    };
  }, [fitView, replaceScenario, selectNode]);

  // Best-effort local autosave. Persistence stays out of the store so engine
  // tests remain pure and deterministic.
  useEffect(() => {
    let timer: number | undefined;
    const snapshot = () => {
      const state = useSimulationStore.getState();
      saveScenario({
        nodes: state.nodes,
        edges: state.edges,
        loadProfile: state.loadProfile,
        seed: state.scenarioSeed,
        thresholds: state.challengeThresholds,
        faults: state.faults,
      });
    };
    const unsubscribe = useSimulationStore.subscribe((state, previous) => {
      if (
        state.nodes === previous.nodes &&
        state.edges === previous.edges &&
        state.loadProfile === previous.loadProfile &&
        state.scenarioSeed === previous.scenarioSeed &&
        state.challengeThresholds === previous.challengeThresholds &&
        state.faults === previous.faults
      ) {
        return;
      }
      if (timer !== undefined) window.clearTimeout(timer);
      timer = window.setTimeout(snapshot, 700);
    });
    window.addEventListener('pagehide', snapshot);
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
      unsubscribe();
      window.removeEventListener('pagehide', snapshot);
    };
  }, []);

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
        state.requestTraces,
        state.challengeThresholds,
        state.nodeHistory
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
      setResultShareUrl(currentChallengeUrl(state.nodes, state.edges));
      setChallengePhase('complete');
      state.setRunning(false);
      state.setLoadProfile('steady');
      applyLoadProfile('steady');

      if (!result.passed && result.bottleneckId) {
        setFixLabRunning(true);
        const seed = state.scenarioSeed ?? 1;
        window.setTimeout(() => {
          setFixCandidates(
            buildFixCandidates(
              state.nodes,
              state.edges,
              seed,
              state.challengeThresholds,
              result.bottleneckId,
              state.faults
            )
          );
          setFixSignature(signatureOf(state.nodes, state.edges));
          setFixLabRunning(false);
        }, 20);
      } else {
        setFixCandidates([]);
        setFixSignature(null);
        setFixLabRunning(false);
      }
    });
  }, [challengePhase, fitView]);

  const clearChallengeUi = useCallback(() => {
    setChallengePhase('ready');
    setChallengeResult(null);
    setBaselineResult(null);
    setChallengeAttempt(0);
    setResultShareUrl(null);
    setFixCandidates([]);
    setFixSignature(null);
    setFixLabRunning(false);
    setBenchmark(null);
    setBenchmarkSignature(null);
    setShareNotice(null);
  }, []);

  const applyScenario = useCallback(
    (scenario: ScenarioDefinition, dailyChallenge: DailyChallenge | null) => {
      const seed = dailyChallenge?.seed ?? scenario.seed;
      replaceScenario(
        scenario.nodes,
        scenario.edges,
        {
          loadProfile: scenario.loadProfile,
          seed,
          thresholds: scenario.thresholds,
          faults: scenario.faults,
        },
        dailyChallenge ? 'daily' : 'template'
      );
      resetSimulation({ seed, faults: scenario.faults ?? [] });
      selectNode(null);
      setDaily(dailyChallenge);
      setActiveScenarioId(dailyChallenge ? null : scenario.id);
      clearChallengeUi();
      window.requestAnimationFrame(() => {
        void fitView({ padding: 0.18, duration: 450 });
      });
    },
    [clearChallengeUi, fitView, replaceScenario, selectNode]
  );

  const handleSelectScenario = useCallback(
    (scenario: ScenarioDefinition) => {
      applyScenario(scenario, null);
    },
    [applyScenario]
  );

  const handleDaily = useCallback(() => {
    if (!today) return;
    const scenario =
      SCENARIOS.find((candidate) => candidate.id === 'three-tier') ??
      SCENARIOS[0];
    if (!scenario) return;
    applyScenario(scenario, today);
    setShareNotice(`${today.label} loaded. Run the spike when you are ready.`);
  }, [applyScenario, today]);

  const startChallenge = () => {
    setShareNotice(null);
    setBenchmark(null);
    setFixCandidates([]);
    setFixLabRunning(false);
    setChallengeResult(null);
    setResultShareUrl(null);
    setChallengePhase('running');
    useSimulationStore.getState().resetMetrics();
    setLoadProfile('spike');
    const seed = ensureScenarioSeed();
    resetSimulation({ seed, captureTraces: true });
    applyLoadProfile('spike');
    setRunning(true);
  };

  const scaleBottleneck = () => {
    if (!challengeResult?.bottleneckId) return;
    const bottleneck = nodes.find(
      (node) => node.id === challengeResult.bottleneckId
    );
    if (!bottleneck) return;

    updateNodeData(bottleneck.id, {
      throughputLimit: scaleComponentCapacity(bottleneck.data.component),
    });
    setFixCandidates([]);
    setShareNotice(
      `${bottleneck.data.component.name} capacity increased. Run the challenge again.`
    );
  };

  const copyChallengeLink = async () => {
    const url = currentChallengeUrl(nodes, edges);
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

  const runBenchmark = () => {
    if (benchmarkRunning) return;
    const state = useSimulationStore.getState();
    if (
      !state.nodes.some(
        (node) => node.data.component.type === 'traffic-generator'
      )
    ) {
      setShareNotice('Add a traffic generator before benchmarking.');
      return;
    }
    const seed = ensureScenarioSeed();
    setBenchmarkRunning(true);
    setShareNotice(null);
    window.setTimeout(() => {
      const result = findBreakingPoint(
        state.nodes,
        state.edges,
        seed,
        state.challengeThresholds,
        { faults: state.faults, ticks: 6, maxRps: 2_000 }
      );
      setBenchmark(result);
      setBenchmarkSignature(signatureOf(state.nodes, state.edges));
      setBenchmarkRunning(false);
    }, 30);
  };

  const applyFix = (candidate: FixCandidate) => {
    const state = useSimulationStore.getState();
    const seed = ensureScenarioSeed();
    replaceScenario(
      candidate.nodes,
      candidate.edges,
      {
        loadProfile: state.loadProfile,
        seed,
        thresholds: state.challengeThresholds,
        faults: state.faults,
      },
      'template'
    );
    resetSimulation({ seed, faults: state.faults });
    selectNode(candidate.projected.bottleneckId);
    setDaily(null);
    setActiveScenarioId(null);
    clearChallengeUi();
    setShareNotice(
      `${candidate.label} applied. Run the challenge to verify the projection.`
    );
    window.requestAnimationFrame(() => {
      void fitView({ padding: 0.2, duration: 450 });
    });
  };

  const tidyLayout = () => {
    const state = useSimulationStore.getState();
    setNodePositions(tidyPositions(state.nodes, state.edges));
    window.requestAnimationFrame(() => {
      void fitView({ padding: 0.18, duration: 400 });
    });
  };

  const resetRun = () => {
    resetSimulation();
    useSimulationStore.getState().resetMetrics();
    setRunning(false);
    clearChallengeUi();
  };

  const downloadResultCard = () => {
    if (!challengeResult) return;
    downloadChallengeCard(challengeResult, baselineResult, challengeAttempt, {
      nodes,
      edges,
      breakpointRps: activeBenchmark?.breakpointRps ?? null,
      dailyLabel: daily?.label ?? null,
      costPerHour: challengeResult.costPerHour,
    });
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target !== null &&
        (target.closest('input, textarea, select') !== null ||
          target.isContentEditable);

      if (
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === 'k'
      ) {
        event.preventDefault();
        setPaletteOpen((open) => !open);
        return;
      }
      if (typing) return;
      if (
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === 'z'
      ) {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      } else if (
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === 'y'
      ) {
        event.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [redo, undo]);

  const xShareHref =
    challengeResult && resultShareUrl
      ? createXIntentUrl(challengeResult, resultShareUrl, {
          breakpointRps: activeBenchmark?.breakpointRps ?? null,
          dailyLabel: daily?.label ?? null,
        })
      : null;

  const commands: PaletteCommand[] = [
    {
      id: 'run',
      label: running ? 'Pause simulation' : 'Run simulation',
      group: 'Simulation',
      keywords: 'play stop',
      run: () => setRunning(!running),
    },
    {
      id: 'reset',
      label: 'Reset run',
      group: 'Simulation',
      keywords: 'clear restart',
      run: resetRun,
    },
    {
      id: 'challenge',
      label: 'Start spike challenge',
      group: 'Simulation',
      hint: '9s',
      run: startChallenge,
    },
    {
      id: 'benchmark',
      label: benchmarkRunning ? 'Benchmark running…' : 'Find breaking point',
      group: 'Analysis',
      keywords: 'limit capacity benchmark',
      disabled: benchmarkRunning,
      run: runBenchmark,
    },
    {
      id: 'tidy',
      label: 'Tidy layout',
      group: 'Canvas',
      keywords: 'arrange align',
      run: tidyLayout,
    },
    {
      id: 'fit',
      label: 'Fit graph to view',
      group: 'Canvas',
      keywords: 'zoom',
      run: () => void fitView({ padding: 0.22, duration: 400 }),
    },
    {
      id: 'undo',
      label: 'Undo',
      group: 'Edit',
      hint: 'Ctrl Z',
      disabled: pastCount === 0,
      run: undo,
    },
    {
      id: 'redo',
      label: 'Redo',
      group: 'Edit',
      hint: 'Ctrl Shift Z',
      disabled: futureCount === 0,
      run: redo,
    },
    {
      id: 'copy-link',
      label: 'Copy challenge link',
      group: 'Share',
      run: () => void copyChallengeLink(),
    },
    {
      id: 'download-card',
      label: 'Download result card',
      group: 'Share',
      disabled: challengeResult === null,
      run: downloadResultCard,
    },
    ...(today
      ? [
          {
            id: 'daily',
            label: `Run ${today.label}`,
            group: 'Scenario',
            run: handleDaily,
          },
        ]
      : []),
    ...SCENARIOS.map((scenario) => ({
      id: `scenario-${scenario.id}`,
      label: scenario.name,
      group: scenario.kind === 'chaos' ? 'Chaos recipe' : 'Template',
      keywords: scenario.description,
      run: () => handleSelectScenario(scenario),
    })),
  ];

  const challengePanel = {
    phase: challengePhase,
    elapsedMs,
    attempt: challengeAttempt,
    baseline: baselineResult,
    result: challengeResult,
    thresholds: challengeThresholds,
    isSharedScenario,
    dailyLabel: daily?.label ?? null,
    shareNotice,
    benchmark: activeBenchmark,
    benchmarkRunning,
    fixCandidates: activeFixCandidates,
    fixLabRunning,
    onStart: startChallenge,
    onScaleBottleneck: scaleBottleneck,
    onBenchmark: runBenchmark,
    onApplyFix: applyFix,
    onChangeThresholds: (thresholds: ChallengeThresholds) =>
      setChallengeThresholds(thresholds),
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
        <Toolbar
          challengeRunning={challengePhase === 'running'}
          activeScenarioId={activeScenarioId}
          daily={today}
          canUndo={pastCount > 0}
          canRedo={futureCount > 0}
          onSelectScenario={handleSelectScenario}
          onDaily={handleDaily}
          onUndo={undo}
          onRedo={redo}
          onTidy={tidyLayout}
          onReset={resetRun}
          onOpenPalette={() => setPaletteOpen(true)}
        />
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
            onNodeClick={(_, node) => selectNode(node.id)}
            onPaneClick={() => selectNode(null)}
            colorMode="light"
            fitView
            fitViewOptions={FIT_VIEW_OPTIONS}
            minZoom={0.25}
            deleteKeyCode={DELETE_KEY_CODE}
            defaultEdgeOptions={DEFAULT_EDGE_OPTIONS}
          >
            <Background gap={24} size={1} color="#cfdae2" />
            <Controls position="bottom-left" />
            <MiniMap
              position="bottom-right"
              pannable
              zoomable
              style={MINIMAP_STYLE}
              nodeColor="#5c6b75"
              maskColor="rgba(232, 238, 242, 0.72)"
            />
          </ReactFlow>
          <GraphHealth />
          <InspectorPanel />
          <div className="pointer-events-none absolute bottom-3 left-1/2 z-10 hidden -translate-x-1/2 items-center gap-4 border border-rule bg-surface px-3 py-1.5 lg:flex">
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
      {paletteOpen ? (
        <CommandPalette
          open
          commands={commands}
          onClose={() => setPaletteOpen(false)}
        />
      ) : null}
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
