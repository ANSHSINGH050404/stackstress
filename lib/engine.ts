import type {
  ComponentConfig,
  GraphPayload,
  LoadProfile,
  NodeMetrics,
  RequestTrace,
  RequestTraceHop,
  RequestTraceOutcome,
  RequestTraceReason,
  ScheduledFault,
  SimulationEngineOptions,
  SimulationSummary,
  SimulationUpdate,
} from '../types';

/** Requests are dropped after this many hops to stop cycles from running forever. */
const MAX_HOPS = 32;
/** Keep tracing overhead bounded even when the simulated request rate is high. */
const TRACE_SAMPLE_INTERVAL = 4;
const MAX_TRACKED_TRACES = 1024;
const MAX_PENDING_TRACES = 512;
/** Cap the number of latency samples kept per interval. */
const MAX_SAMPLES = 5000;
/** Safety valve so a pathological graph cannot lock the simulation loop. */
const MAX_EVENTS_PER_TICK = 200_000;
/** Never generate more than one request per millisecond. */
const MIN_INTERARRIVAL_MS = 1;

type EventKind = 'generator' | 'arrival' | 'complete' | 'fault';

interface Request {
  id: number;
  startedAt: number;
  overheadMs: number;
  hops: number;
  retryCount: number;
  enqueuedAt: number;
  serviceStartedAt: number;
  trace?: RequestTraceDraft;
}

interface RequestTraceHopDraft {
  componentId: string;
  componentName: string;
  arrivedAt: number;
  serviceStartedAt: number | null;
  queueWaitMs: number;
}

interface RequestTraceDraft {
  sourceGeneratorId: string;
  sourceGeneratorName: string;
  requestId: number;
  startedAt: number;
  hops: RequestTraceHop[];
  currentHop: RequestTraceHopDraft | null;
}

interface SimEvent {
  time: number;
  seq: number;
  kind: EventKind;
  nodeId: string;
  request?: Request;
  /** Generators use an epoch so rescheduled events can be invalidated. */
  epoch?: number;
  /** Fault events carry the outage duration. */
  durationMs?: number;
}

interface IntervalStats {
  in: number;
  out: number;
  errors: number;
  dropped: number;
  cacheHits: number;
  cacheMisses: number;
  busyMs: number;
  latencySamples: number[];
}

interface NodeRuntime {
  config: ComponentConfig;
  queue: Request[];
  busy: boolean;
  epoch: number;
  downUntil: number;
  instances: number;
  lastScaleAt: number;
  rrIndex: number;
  interval: IntervalStats;
  totalIn: number;
  totalOut: number;
  totalErrors: number;
  totalDropped: number;
  totalCacheHits: number;
  totalCacheMisses: number;
}

function emptyInterval(): IntervalStats {
  return {
    in: 0,
    out: 0,
    errors: 0,
    dropped: 0,
    cacheHits: 0,
    cacheMisses: 0,
    busyMs: 0,
    latencySamples: [],
  };
}

function initialInstances(config: ComponentConfig): number {
  if (!config.autoscaling) return 1;
  const min = Math.max(1, config.minInstances ?? 1);
  const max = Math.max(min, config.maxInstances ?? min);
  return Math.min(max, min);
}

function effectiveCapacity(config: ComponentConfig, instances: number): number {
  const replicas = Math.max(1, config.replicas ?? 1);
  const running = config.autoscaling ? Math.max(1, instances) : 1;
  return Math.max(0, config.throughputLimit) * replicas * running;
}

function compareEvents(a: SimEvent, b: SimEvent): number {
  return a.time === b.time ? a.seq - b.seq : a.time - b.time;
}

/** Minimal binary min-heap ordered by (time, sequence). */
class EventHeap {
  private items: SimEvent[] = [];

  get size(): number {
    return this.items.length;
  }

  peek(): SimEvent | undefined {
    return this.items[0];
  }

  forEachRequestAtNode(nodeId: string, visit: (request: Request) => void): void {
    for (const event of this.items) {
      if (event.nodeId === nodeId && event.request) visit(event.request);
    }
  }

  push(event: SimEvent): void {
    const items = this.items;
    items.push(event);
    let index = items.length - 1;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (compareEvents(items[parent], items[index]) <= 0) break;
      [items[parent], items[index]] = [items[index], items[parent]];
      index = parent;
    }
  }

  pop(): SimEvent | undefined {
    const items = this.items;
    if (items.length === 0) return undefined;
    const top = items[0];
    const last = items.pop() as SimEvent;
    if (items.length > 0) {
      items[0] = last;
      let index = 0;
      for (;;) {
        const left = index * 2 + 1;
        const right = left + 1;
        let smallest = index;
        if (left < items.length && compareEvents(items[left], items[smallest]) < 0) {
          smallest = left;
        }
        if (right < items.length && compareEvents(items[right], items[smallest]) < 0) {
          smallest = right;
        }
        if (smallest === index) break;
        [items[smallest], items[index]] = [items[index], items[smallest]];
        index = smallest;
      }
    }
    return top;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

let fallbackSeed = Date.now() >>> 0;

function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 0x1_0000_0000;
  };
}

function percentile(samples: number[], p: number): number {
  if (samples.length === 0) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  const index = clamp(Math.ceil(sorted.length * p) - 1, 0, sorted.length - 1);
  return sorted[index];
}

function mean(samples: number[]): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (const value of samples) sum += value;
  return sum / samples.length;
}

function pushSample(samples: number[], value: number): void {
  if (samples.length < MAX_SAMPLES) samples.push(value);
}

function normalizeConfig(config: ComponentConfig): ComponentConfig {
  const normalized: ComponentConfig = {
    ...config,
    throughputLimit: clamp(Number(config.throughputLimit) || 0, 0, 100_000),
    latency: clamp(Number(config.latency) || 0, 0, 60_000),
    failureRate: clamp(Number(config.failureRate) || 0, 0, 1),
    queueCapacity: clamp(Math.floor(Number(config.queueCapacity) || 0), 0, 1_000_000),
  };

  if (config.type === 'cache') {
    normalized.cacheHitRate = clamp(
      Number(config.cacheHitRate ?? 0.82) || 0,
      0,
      1
    );
  }
  if (config.type === 'load-balancer') {
    normalized.healthChecks = config.healthChecks ?? true;
    normalized.lbStrategy = config.lbStrategy ?? 'least-load';
  }
  if (config.replicas !== undefined) {
    normalized.replicas = clamp(Math.round(Number(config.replicas) || 1), 1, 10);
  }
  if (config.minInstances !== undefined) {
    normalized.minInstances = clamp(
      Math.round(Number(config.minInstances) || 1),
      1,
      10
    );
  }
  if (config.maxInstances !== undefined) {
    normalized.maxInstances = clamp(
      Math.round(Number(config.maxInstances) || 1),
      1,
      10
    );
  }
  if (
    normalized.minInstances !== undefined &&
    normalized.maxInstances !== undefined &&
    normalized.maxInstances < normalized.minInstances
  ) {
    normalized.maxInstances = normalized.minInstances;
  }
  if (config.retries !== undefined) {
    normalized.retries = clamp(Math.round(Number(config.retries) || 0), 0, 3);
  }

  return normalized;
}

export class SimulationEngine {
  private components = new Map<string, NodeRuntime>();
  private edges = new Map<string, string[]>();
  private heap = new EventHeap();
  private random = createRandom(0);
  private captureTraces = false;
  private trackedTraceCount = 0;
  private pendingTraces: RequestTrace[] = [];
  private scheduledFaults: ScheduledFault[] = [];
  private seq = 0;
  private requestSeq = 0;
  private time = 0;
  private loadProfile: LoadProfile = 'steady';

  private summaryInterval = {
    generated: 0,
    completed: 0,
    errors: 0,
    dropped: 0,
    e2eSamples: [] as number[],
  };

  private totals = {
    completed: 0,
    errors: 0,
    dropped: 0,
  };

  constructor(graph: GraphPayload, options: SimulationEngineOptions = {}) {
    const seed = options.seed ?? fallbackSeed++;
    this.random = createRandom(seed);
    this.captureTraces = options.captureTraces ?? false;
    this.scheduledFaults = options.faults ?? [];
    this.updateGraph(graph);
    this.scheduleFaults();
  }

  private scheduleFaults(): void {
    for (const fault of this.scheduledFaults) {
      if (!this.components.has(fault.nodeId)) continue;
      this.heap.push({
        time: Math.max(0, fault.startMs),
        seq: this.seq++,
        kind: 'fault',
        nodeId: fault.nodeId,
        durationMs: Math.max(100, fault.durationMs),
      });
    }
  }

  /** Reconcile the runtime with a new graph while preserving existing metrics. */
  public updateGraph(graph: GraphPayload): void {
    const next = new Map<string, ComponentConfig>();
    for (const raw of graph.components) {
      const config = normalizeConfig(raw);
      next.set(config.id, config);
    }

    for (const id of [...this.components.keys()]) {
      if (!next.has(id)) {
        this.discardTracesForNode(id, this.components.get(id));
        this.components.delete(id);
      }
    }

    for (const [id, config] of next) {
      const existing = this.components.get(id);
      if (existing && existing.config.type === config.type) {
        const rateChanged =
          existing.config.throughputLimit !== config.throughputLimit ||
          existing.config.replicas !== config.replicas;
        existing.config = config;
        const min = Math.max(1, config.minInstances ?? 1);
        const max = Math.max(min, config.maxInstances ?? min);
        existing.instances = config.autoscaling
          ? Math.min(max, Math.max(min, existing.instances))
          : 1;
        if (config.type === 'traffic-generator' && rateChanged) {
          existing.epoch += 1;
          this.scheduleNextGeneration(existing);
        }
        continue;
      }

      if (existing) this.discardTracesForNode(id, existing);
      const runtime: NodeRuntime = {
        config,
        queue: [],
        busy: false,
        epoch: 0,
        downUntil: 0,
        instances: initialInstances(config),
        lastScaleAt: this.time,
        rrIndex: 0,
        interval: emptyInterval(),
        totalIn: 0,
        totalOut: 0,
        totalErrors: 0,
        totalDropped: 0,
        totalCacheHits: 0,
        totalCacheMisses: 0,
      };
      this.components.set(id, runtime);
      if (config.type === 'traffic-generator') this.scheduleNextGeneration(runtime);
    }

    this.edges.clear();
    for (const edge of graph.edges) {
      if (!this.components.has(edge.source) || !this.components.has(edge.target)) continue;
      const targets = this.edges.get(edge.source) ?? [];
      if (!targets.includes(edge.target)) targets.push(edge.target);
      this.edges.set(edge.source, targets);
    }
  }

  /** Change the global traffic pattern and reschedule generators immediately. */
  public setLoadProfile(profile: LoadProfile): void {
    this.loadProfile = profile;
    for (const runtime of this.components.values()) {
      if (runtime.config.type !== 'traffic-generator') continue;
      runtime.epoch += 1;
      this.scheduleNextGeneration(runtime);
    }
  }

  /** Take a component down for a fixed duration, failing everything queued. */
  public injectOutage(nodeId: string, durationMs: number): void {
    const runtime = this.components.get(nodeId);
    if (!runtime) return;

    runtime.downUntil = Math.max(runtime.downUntil, this.time + Math.max(100, durationMs));
    while (runtime.queue.length > 0) {
      const request = runtime.queue.pop();
      if (request) {
        this.finishTraceHop(
          request,
          'dropped',
          'outage',
          this.time,
          runtime.config.latency
        );
        this.finalizeTrace(request, 'dropped', 'outage', this.time);
      }
      this.recordDrop(runtime);
    }
  }

  public stopTraceCapture(): void {
    this.captureTraces = false;
  }

  /** Advance simulated time and return a metrics snapshot for the interval. */
  public tick(durationMs: number): SimulationUpdate {
    const target = this.time + Math.max(1, durationMs);
    let processed = 0;

    while (this.heap.size > 0 && processed < MAX_EVENTS_PER_TICK) {
      const next = this.heap.peek();
      if (!next || next.time > target) break;
      const event = this.heap.pop();
      if (!event) break;
      this.time = event.time;
      this.handleEvent(event);
      processed += 1;
    }

    this.time = target;
    return this.snapshot(durationMs);
  }

  private handleEvent(event: SimEvent): void {
    const runtime = this.components.get(event.nodeId);
    if (!runtime) {
      if (event.request) this.discardTrace(event.request);
      return;
    }

    switch (event.kind) {
      case 'generator':
        this.handleGenerator(runtime, event);
        break;
      case 'arrival':
        this.handleArrival(runtime, event);
        break;
      case 'complete':
        this.handleComplete(runtime, event);
        break;
      case 'fault':
        this.injectOutage(event.nodeId, event.durationMs ?? 1_000);
        break;
    }
  }

  private handleGenerator(runtime: NodeRuntime, event: SimEvent): void {
    if (runtime.config.type !== 'traffic-generator') return;
    if (event.epoch !== runtime.epoch) return;
    if (runtime.config.throughputLimit <= 0) return;

    this.scheduleNextGeneration(runtime, event.time);

    if (this.isDown(runtime)) return;

    runtime.interval.in += 1;
    runtime.interval.out += 1;
    runtime.totalIn += 1;
    runtime.totalOut += 1;
    this.summaryInterval.generated += 1;

    const request: Request = {
      id: this.requestSeq++,
      startedAt: event.time,
      overheadMs: 0,
      hops: 0,
      retryCount: 0,
      enqueuedAt: event.time,
      serviceStartedAt: event.time,
    };
    this.sampleTrace(request, runtime.config);

    const targets = this.edges.get(runtime.config.id);
    if (!targets || targets.length === 0) {
      this.finalizeTrace(request, 'dropped', 'no-target', event.time);
      this.recordDrop(runtime);
      return;
    }

    this.heap.push({
      time: event.time,
      seq: this.seq++,
      kind: 'arrival',
      nodeId: this.pickTarget(runtime, targets),
      request,
    });
  }

  private handleArrival(runtime: NodeRuntime, event: SimEvent): void {
    if (!event.request) return;
    if (runtime.config.type === 'traffic-generator') {
      this.discardTrace(event.request);
      return;
    }

    this.startTraceHop(event.request, runtime, event.time);
    runtime.interval.in += 1;
    runtime.totalIn += 1;

    if (this.isDown(runtime)) {
      this.finishTraceHop(
        event.request,
        'dropped',
        'outage',
        event.time,
        runtime.config.latency
      );
      this.finalizeTrace(event.request, 'dropped', 'outage', event.time);
      this.recordDrop(runtime);
      return;
    }

    // A busy server with a full waiting room drops the request.
    if (runtime.busy && runtime.queue.length >= runtime.config.queueCapacity) {
      this.finishTraceHop(
        event.request,
        'dropped',
        'queue-full',
        event.time,
        runtime.config.latency
      );
      this.finalizeTrace(event.request, 'dropped', 'queue-full', event.time);
      this.recordDrop(runtime);
      return;
    }

    event.request.enqueuedAt = event.time;
    event.request.hops += 1;
    runtime.queue.push(event.request);
    this.pump(runtime, event.time);
  }

  private handleComplete(runtime: NodeRuntime, event: SimEvent): void {
    const request = event.request;
    runtime.busy = false;
    if (!request) return;

    runtime.interval.busyMs += Math.max(0, event.time - request.serviceStartedAt);

    const residency = event.time - request.enqueuedAt + runtime.config.latency;
    pushSample(runtime.interval.latencySamples, residency);

    const hitHopLimit = request.hops >= MAX_HOPS;
    const componentFailed =
      !hitHopLimit && this.random() < runtime.config.failureRate;
    const failed = hitHopLimit || componentFailed;
    const failureReason: RequestTraceReason | null = hitHopLimit
      ? 'hop-limit'
      : componentFailed
        ? 'component-failure'
        : null;
    request.overheadMs += runtime.config.latency;

    if (failed) {
      this.finishTraceHop(request, 'failed', failureReason, event.time, runtime.config.latency);
      runtime.interval.errors += 1;
      runtime.totalErrors += 1;
      this.summaryInterval.errors += 1;
      this.totals.errors += 1;

      const retryLimit =
        runtime.config.type === 'service'
          ? Math.max(0, runtime.config.retries ?? 0)
          : 0;
      const canRetry =
        failureReason === 'component-failure' &&
        request.retryCount < retryLimit;

      if (canRetry) {
        request.retryCount += 1;
        this.heap.push({
          time: event.time + 100,
          seq: this.seq++,
          kind: 'arrival',
          nodeId: runtime.config.id,
          request,
        });
      } else {
        this.finalizeTrace(request, 'failed', failureReason, event.time);
      }

      this.pump(runtime, event.time);
      return;
    }

    runtime.interval.out += 1;
    runtime.totalOut += 1;

    const targets = this.edges.get(runtime.config.id);

    if (
      runtime.config.type === 'cache' &&
      targets &&
      targets.length > 0 &&
      this.random() < clamp(runtime.config.cacheHitRate ?? 0, 0, 1)
    ) {
      runtime.interval.cacheHits += 1;
      runtime.totalCacheHits += 1;
      const endToEnd = event.time - request.startedAt + request.overheadMs;
      pushSample(this.summaryInterval.e2eSamples, endToEnd);
      this.summaryInterval.completed += 1;
      this.totals.completed += 1;
      this.finishTraceHop(request, 'completed', null, event.time, runtime.config.latency);
      this.finalizeTrace(request, 'completed', null, event.time);
      this.pump(runtime, event.time);
      return;
    }

    if (runtime.config.type === 'cache') {
      runtime.interval.cacheMisses += 1;
      runtime.totalCacheMisses += 1;
    }

    if (targets && targets.length > 0) {
      this.finishTraceHop(request, 'completed', null, event.time, runtime.config.latency);
      this.heap.push({
        time: event.time,
        seq: this.seq++,
        kind: 'arrival',
        nodeId: this.pickTarget(runtime, targets),
        request,
      });
    } else {
      // Terminal node: record the end-to-end latency.
      const endToEnd = event.time - request.startedAt + request.overheadMs;
      pushSample(this.summaryInterval.e2eSamples, endToEnd);
      this.summaryInterval.completed += 1;
      this.totals.completed += 1;
      this.finishTraceHop(request, 'completed', null, event.time, runtime.config.latency);
      this.finalizeTrace(request, 'completed', null, event.time);
    }

    this.pump(runtime, event.time);
  }

  private pump(runtime: NodeRuntime, now: number): void {
    if (runtime.busy || runtime.queue.length === 0) return;

    const request = runtime.queue.shift();
    if (!request) return;

    runtime.busy = true;
    request.serviceStartedAt = now;
    if (request.trace?.currentHop) {
      request.trace.currentHop.serviceStartedAt = now;
      request.trace.currentHop.queueWaitMs = Math.max(0, now - request.trace.currentHop.arrivedAt);
    }

    this.heap.push({
      time:
        now +
        this.sampleServiceMs(
          effectiveCapacity(runtime.config, runtime.instances)
        ),
      seq: this.seq++,
      kind: 'complete',
      nodeId: runtime.config.id,
      request,
    });
  }

  private recordDrop(runtime: NodeRuntime): void {
    runtime.interval.errors += 1;
    runtime.interval.dropped += 1;
    runtime.totalErrors += 1;
    runtime.totalDropped += 1;
    this.summaryInterval.errors += 1;
    this.summaryInterval.dropped += 1;
    this.totals.errors += 1;
    this.totals.dropped += 1;
  }

  private sampleTrace(request: Request, generator: ComponentConfig): void {
    if (
      !this.captureTraces ||
      request.id % TRACE_SAMPLE_INTERVAL !== 0 ||
      this.trackedTraceCount >= MAX_TRACKED_TRACES
    ) {
      return;
    }

    request.trace = {
      sourceGeneratorId: generator.id,
      sourceGeneratorName: generator.name,
      requestId: request.id,
      startedAt: request.startedAt,
      hops: [],
      currentHop: null,
    };
    this.trackedTraceCount += 1;
  }

  private startTraceHop(request: Request, runtime: NodeRuntime, arrivedAt: number): void {
    const trace = request.trace;
    if (!trace) return;
    trace.currentHop = {
      componentId: runtime.config.id,
      componentName: runtime.config.name,
      arrivedAt,
      serviceStartedAt: null,
      queueWaitMs: 0,
    };
  }

  private finishTraceHop(
    request: Request,
    outcome: RequestTraceOutcome,
    reason: RequestTraceReason | null,
    endedAt: number,
    configuredLatencyMs = 0
  ): void {
    const trace = request.trace;
    const hop = trace?.currentHop;
    if (!trace || !hop) return;

    const serviceStartedAt = hop.serviceStartedAt;
    const serviced = serviceStartedAt !== null;
    const completedHop: RequestTraceHop = {
      componentId: hop.componentId,
      componentName: hop.componentName,
      queueWaitMs: serviced
        ? hop.queueWaitMs
        : Math.max(0, endedAt - hop.arrivedAt),
      serviceTimeMs: serviced ? Math.max(0, endedAt - serviceStartedAt) : 0,
      configuredLatencyMs,
      outcome,
      reason,
    };
    trace.hops.push(completedHop);
    trace.currentHop = null;
  }

  private finalizeTrace(
    request: Request,
    outcome: RequestTraceOutcome,
    reason: RequestTraceReason | null,
    terminalAt: number
  ): void {
    const trace = request.trace;
    if (!trace) return;

    if (trace.currentHop) {
      this.finishTraceHop(request, outcome, reason, terminalAt);
    }
    if (this.pendingTraces.length >= MAX_PENDING_TRACES) {
      this.pendingTraces.splice(0, MAX_PENDING_TRACES / 2);
    }
    this.pendingTraces.push({
      sourceGeneratorId: trace.sourceGeneratorId,
      sourceGeneratorName: trace.sourceGeneratorName,
      requestId: trace.requestId,
      startedAt: trace.startedAt,
      terminalAt,
      totalObservedLatencyMs: Math.max(0, terminalAt - request.startedAt) + request.overheadMs,
      outcome,
      reason,
      hops: trace.hops.map((hop) => ({ ...hop })),
    });
    request.trace = undefined;
    this.trackedTraceCount -= 1;
  }

  private discardTrace(request: Request): void {
    if (!request.trace) return;
    request.trace = undefined;
    this.trackedTraceCount -= 1;
  }

  private discardTracesForNode(nodeId: string, runtime?: NodeRuntime): void {
    for (const request of runtime?.queue ?? []) this.discardTrace(request);
    this.heap.forEachRequestAtNode(nodeId, (request) => this.discardTrace(request));
  }

  private scheduleNextGeneration(runtime: NodeRuntime, from = this.time): void {
    const rps = runtime.config.throughputLimit * this.profileMultiplier();
    if (rps <= 0) return;
    this.heap.push({
      time: from + this.interarrivalMs(rps),
      seq: this.seq++,
      kind: 'generator',
      nodeId: runtime.config.id,
      epoch: runtime.epoch,
    });
  }

  private profileMultiplier(): number {
    switch (this.loadProfile) {
      case 'spike': {
        // Baseline for 6s, then 3x for 3s, repeating every 12s.
        const phase = (this.time + 6000) % 12000;
        return phase < 3000 ? 3 : 1;
      }
      case 'ramp': {
        // Ramp from 0.2x to 2x over the first 30s, then hold at 2x.
        return Math.min(2, 0.2 + (this.time / 30000) * 1.8);
      }
      default:
        return 1;
    }
  }

  private isDown(runtime: NodeRuntime): boolean {
    return this.time < runtime.downUntil;
  }

  private interarrivalMs(rps: number): number {
    if (rps <= 0) return Number.POSITIVE_INFINITY;
    const exponential = -Math.log(1 - this.random()) * (1000 / rps);
    return Math.max(MIN_INTERARRIVAL_MS, exponential);
  }

  private sampleServiceMs(throughputLimit: number): number {
    const meanMs = 1000 / Math.max(1, throughputLimit);
    const sample = -Math.log(1 - this.random()) * meanMs;
    return clamp(sample, 0.1, 60_000);
  }

  private pickTarget(source: NodeRuntime, targets: string[]): string {
    let candidates = targets;

    if (source.config.type === 'load-balancer' && source.config.healthChecks) {
      const healthy = targets.filter((id) => {
        const runtime = this.components.get(id);
        return runtime ? !this.isDown(runtime) : true;
      });
      if (healthy.length > 0) candidates = healthy;
    }

    if (candidates.length === 1) return candidates[0];

    const strategy = source.config.lbStrategy ?? 'least-load';
    if (source.config.type === 'load-balancer' && strategy === 'round-robin') {
      const target = candidates[source.rrIndex % candidates.length];
      source.rrIndex += 1;
      return target;
    }
    if (source.config.type === 'load-balancer' && strategy === 'random') {
      return candidates[Math.floor(this.random() * candidates.length)];
    }

    let bestLoad = Number.POSITIVE_INFINITY;
    let leastLoaded: string[] = [];

    for (const id of candidates) {
      const runtime = this.components.get(id);
      const load = runtime ? runtime.queue.length + (runtime.busy ? 1 : 0) : 0;
      if (load < bestLoad) {
        bestLoad = load;
        leastLoaded = [id];
      } else if (load === bestLoad) {
        leastLoaded.push(id);
      }
    }

    // Break ties randomly so equal-capacity targets share traffic evenly.
    return leastLoaded[Math.floor(this.random() * leastLoaded.length)];
  }

  private snapshot(durationMs: number): SimulationUpdate {
    const nodes: Record<string, NodeMetrics> = {};
    const duration = Math.max(1, durationMs);

    for (const [id, runtime] of this.components) {
      const samples = runtime.interval.latencySamples;
      const utilization = clamp(runtime.interval.busyMs / duration, 0, 1);
      const down = this.isDown(runtime);

      if (
        runtime.config.type === 'service' &&
        runtime.config.autoscaling &&
        !down
      ) {
        const min = Math.max(1, runtime.config.minInstances ?? 1);
        const max = Math.max(min, runtime.config.maxInstances ?? min);
        const cooldownMs = 2_500;
        const cooledDown = this.time - runtime.lastScaleAt >= cooldownMs;
        if (utilization > 0.82 && runtime.instances < max && cooledDown) {
          runtime.instances += 1;
          runtime.lastScaleAt = this.time;
        } else if (
          utilization < 0.55 &&
          runtime.instances > min &&
          cooledDown
        ) {
          runtime.instances -= 1;
          runtime.lastScaleAt = this.time;
        }
      }

      const cacheHits = runtime.interval.cacheHits;
      const cacheMisses = runtime.interval.cacheMisses;
      const cacheAttempts = cacheHits + cacheMisses;

      nodes[id] = {
        requestsIn: runtime.interval.in,
        requestsOut: runtime.interval.out,
        errors: runtime.interval.errors,
        dropped: runtime.interval.dropped,
        queueDepth: runtime.queue.length,
        down,
        utilization,
        instances: runtime.instances,
        cacheHits,
        cacheMisses,
        cacheHitRate: cacheAttempts > 0 ? cacheHits / cacheAttempts : 0,
        p50Latency: percentile(samples, 0.5),
        p95Latency: percentile(samples, 0.95),
        p99Latency: percentile(samples, 0.99),
        avgLatency: mean(samples),
        totalIn: runtime.totalIn,
        totalOut: runtime.totalOut,
        totalDropped: runtime.totalDropped,
      };
      runtime.interval = emptyInterval();
    }

    const e2e = this.summaryInterval.e2eSamples;
    const completed = this.summaryInterval.completed;
    const errors = this.summaryInterval.errors;
    const attempted = completed + errors;

    const summary: SimulationSummary = {
      completedRps: completed / (duration / 1000),
      generatedRps: this.summaryInterval.generated / (duration / 1000),
      errorRate: attempted > 0 ? errors / attempted : 0,
      p50Latency: percentile(e2e, 0.5),
      p95Latency: percentile(e2e, 0.95),
      p99Latency: percentile(e2e, 0.99),
      avgLatency: mean(e2e),
      totalCompleted: this.totals.completed,
      totalDropped: this.totals.dropped,
      totalErrors: this.totals.errors,
    };

    this.summaryInterval = {
      generated: 0,
      completed: 0,
      errors: 0,
      dropped: 0,
      e2eSamples: [],
    };

    return {
      time: this.time,
      nodes,
      summary,
      requestTraces: this.pendingTraces.splice(0),
    };
  }
}
