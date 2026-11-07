import {
  ComponentConfig,
  GraphPayload,
  LoadProfile,
  NodeMetrics,
  SimulationSummary,
  SimulationUpdate,
} from '../types';

/** Requests are dropped after this many hops to stop cycles from running forever. */
const MAX_HOPS = 32;
/** Cap the number of latency samples kept per interval. */
const MAX_SAMPLES = 5000;
/** Safety valve so a pathological graph cannot lock the simulation loop. */
const MAX_EVENTS_PER_TICK = 200_000;
/** Never generate more than one request per millisecond. */
const MIN_INTERARRIVAL_MS = 1;

type EventKind = 'generator' | 'arrival' | 'complete';

interface Request {
  id: number;
  startedAt: number;
  overheadMs: number;
  hops: number;
  enqueuedAt: number;
  serviceStartedAt: number;
}

interface SimEvent {
  time: number;
  seq: number;
  kind: EventKind;
  nodeId: string;
  request?: Request;
  /** Generators use an epoch so rescheduled events can be invalidated. */
  epoch?: number;
}

interface IntervalStats {
  in: number;
  out: number;
  errors: number;
  dropped: number;
  busyMs: number;
  latencySamples: number[];
}

interface NodeRuntime {
  config: ComponentConfig;
  queue: Request[];
  busy: boolean;
  epoch: number;
  downUntil: number;
  interval: IntervalStats;
  totalIn: number;
  totalOut: number;
  totalErrors: number;
  totalDropped: number;
}

function emptyInterval(): IntervalStats {
  return {
    in: 0,
    out: 0,
    errors: 0,
    dropped: 0,
    busyMs: 0,
    latencySamples: [],
  };
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
  return {
    ...config,
    throughputLimit: clamp(Number(config.throughputLimit) || 0, 0, 100_000),
    latency: clamp(Number(config.latency) || 0, 0, 60_000),
    failureRate: clamp(Number(config.failureRate) || 0, 0, 1),
    queueCapacity: clamp(Math.floor(Number(config.queueCapacity) || 0), 0, 1_000_000),
  };
}

export class SimulationEngine {
  private components = new Map<string, NodeRuntime>();
  private edges = new Map<string, string[]>();
  private heap = new EventHeap();
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

  constructor(graph: GraphPayload) {
    this.updateGraph(graph);
  }

  /** Reconcile the runtime with a new graph while preserving existing metrics. */
  public updateGraph(graph: GraphPayload): void {
    const next = new Map<string, ComponentConfig>();
    for (const raw of graph.components) {
      const config = normalizeConfig(raw);
      next.set(config.id, config);
    }

    for (const id of [...this.components.keys()]) {
      if (!next.has(id)) this.components.delete(id);
    }

    for (const [id, config] of next) {
      const existing = this.components.get(id);
      if (existing && existing.config.type === config.type) {
        const rateChanged = existing.config.throughputLimit !== config.throughputLimit;
        existing.config = config;
        if (config.type === 'traffic-generator' && rateChanged) {
          existing.epoch += 1;
          this.scheduleNextGeneration(existing);
        }
        continue;
      }

      const runtime: NodeRuntime = {
        config,
        queue: [],
        busy: false,
        epoch: 0,
        downUntil: 0,
        interval: emptyInterval(),
        totalIn: 0,
        totalOut: 0,
        totalErrors: 0,
        totalDropped: 0,
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
      runtime.queue.pop();
      this.recordDrop(runtime);
    }
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
    if (!runtime) return;

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

    const targets = this.edges.get(runtime.config.id);
    if (!targets || targets.length === 0) {
      this.recordDrop(runtime);
      return;
    }

    const request: Request = {
      id: this.requestSeq++,
      startedAt: event.time,
      overheadMs: 0,
      hops: 0,
      enqueuedAt: event.time,
      serviceStartedAt: event.time,
    };

    this.heap.push({
      time: event.time,
      seq: this.seq++,
      kind: 'arrival',
      nodeId: this.pickTarget(targets),
      request,
    });
  }

  private handleArrival(runtime: NodeRuntime, event: SimEvent): void {
    if (!event.request || runtime.config.type === 'traffic-generator') return;

    runtime.interval.in += 1;
    runtime.totalIn += 1;

    if (this.isDown(runtime)) {
      this.recordDrop(runtime);
      return;
    }

    // A busy server with a full waiting room drops the request.
    if (runtime.busy && runtime.queue.length >= runtime.config.queueCapacity) {
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

    const failed = request.hops >= MAX_HOPS || Math.random() < runtime.config.failureRate;
    if (failed) {
      runtime.interval.errors += 1;
      runtime.totalErrors += 1;
      this.summaryInterval.errors += 1;
      this.totals.errors += 1;
      this.pump(runtime, event.time);
      return;
    }

    runtime.interval.out += 1;
    runtime.totalOut += 1;

    const overheadMs = request.overheadMs + runtime.config.latency;
    const targets = this.edges.get(runtime.config.id);

    if (targets && targets.length > 0) {
      request.overheadMs = overheadMs;
      this.heap.push({
        time: event.time,
        seq: this.seq++,
        kind: 'arrival',
        nodeId: this.pickTarget(targets),
        request,
      });
    } else {
      // Terminal node: record the end-to-end latency.
      const endToEnd = event.time - request.startedAt + overheadMs;
      pushSample(this.summaryInterval.e2eSamples, endToEnd);
      this.summaryInterval.completed += 1;
      this.totals.completed += 1;
    }

    this.pump(runtime, event.time);
  }

  private pump(runtime: NodeRuntime, now: number): void {
    if (runtime.busy || runtime.queue.length === 0) return;

    const request = runtime.queue.shift();
    if (!request) return;

    runtime.busy = true;
    request.serviceStartedAt = now;

    this.heap.push({
      time: now + this.sampleServiceMs(runtime.config.throughputLimit),
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
    const exponential = -Math.log(1 - Math.random()) * (1000 / rps);
    return Math.max(MIN_INTERARRIVAL_MS, exponential);
  }

  private sampleServiceMs(throughputLimit: number): number {
    const meanMs = 1000 / Math.max(1, throughputLimit);
    const sample = -Math.log(1 - Math.random()) * meanMs;
    return clamp(sample, 0.1, 60_000);
  }

  private pickTarget(targets: string[]): string {
    if (targets.length === 1) return targets[0];

    let bestLoad = Number.POSITIVE_INFINITY;
    let candidates: string[] = [];

    for (const id of targets) {
      const runtime = this.components.get(id);
      const load = runtime ? runtime.queue.length + (runtime.busy ? 1 : 0) : 0;
      if (load < bestLoad) {
        bestLoad = load;
        candidates = [id];
      } else if (load === bestLoad) {
        candidates.push(id);
      }
    }

    // Break ties randomly so equal-capacity targets share traffic evenly.
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  private snapshot(durationMs: number): SimulationUpdate {
    const nodes: Record<string, NodeMetrics> = {};
    const duration = Math.max(1, durationMs);

    for (const [id, runtime] of this.components) {
      const samples = runtime.interval.latencySamples;
      nodes[id] = {
        requestsIn: runtime.interval.in,
        requestsOut: runtime.interval.out,
        errors: runtime.interval.errors,
        dropped: runtime.interval.dropped,
        queueDepth: runtime.queue.length,
        down: this.isDown(runtime),
        utilization: clamp(runtime.interval.busyMs / duration, 0, 1),
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

    return { time: this.time, nodes, summary };
  }
}
