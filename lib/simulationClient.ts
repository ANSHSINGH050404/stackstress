'use client';

import { GraphPayload, LoadProfile, SimulationEngineOptions } from '../types';
import { SimulationEngine } from './engine';
import { useSimulationStore } from './store';

const TICK_MS = 1000;

/**
 * Runs the simulation in-process for now. The engine is pure TypeScript and
 * this module is the only transport boundary, so moving it back into a Web
 * Worker is a local change once Turbopack can emit bundled worker entries.
 */
let engine: SimulationEngine | null = null;
let tickTimer: ReturnType<typeof setInterval> | null = null;
let unsubscribe: (() => void) | null = null;
let lastSignature = '';

function currentGraph(): GraphPayload {
  const { nodes, edges } = useSimulationStore.getState();
  return {
    components: nodes.map((node) => ({ ...node.data.component })),
    edges: edges.map((edge) => ({ source: edge.source, target: edge.target })),
  };
}

function syncGraph(force = false): void {
  const graph = currentGraph();
  const signature = JSON.stringify(graph);
  if (!force && signature === lastSignature) return;

  lastSignature = signature;
  if (engine) {
    engine.updateGraph(graph);
  } else {
    engine = createEngine(graph);
  }
}

function createEngine(
  graph: GraphPayload,
  options: SimulationEngineOptions = {}
): SimulationEngine {
  const state = useSimulationStore.getState();
  const next = new SimulationEngine(graph, {
    ...options,
    seed: options.seed ?? state.scenarioSeed ?? undefined,
  });
  next.setLoadProfile(state.loadProfile);
  return next;
}

export function startSimulation(): void {
  if (tickTimer) return;

  syncGraph(true);

  unsubscribe = useSimulationStore.subscribe((state, previous) => {
    if (state.nodes !== previous.nodes || state.edges !== previous.edges) {
      syncGraph();
    }
  });

  tickTimer = setInterval(() => {
    if (!engine) return;
    if (!useSimulationStore.getState().running) return;
    useSimulationStore.getState().applyUpdate(engine.tick(TICK_MS));
  }, TICK_MS);
}

export function stopSimulation(): void {
  if (tickTimer) clearInterval(tickTimer);
  tickTimer = null;

  unsubscribe?.();
  unsubscribe = null;

  engine = null;
  lastSignature = '';
}

export function resetSimulation(options: SimulationEngineOptions = {}): void {
  engine = createEngine(currentGraph(), options);
}

export function stopTraceCapture(): void {
  engine?.stopTraceCapture();
}

export function applyLoadProfile(profile: LoadProfile): void {
  engine?.setLoadProfile(profile);
}

export function injectOutage(nodeId: string, durationMs: number): void {
  engine?.injectOutage(nodeId, durationMs);
}
