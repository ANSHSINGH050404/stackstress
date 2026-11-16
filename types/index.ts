export type ComponentType =
  | 'load-balancer'
  | 'database'
  | 'cache'
  | 'service'
  | 'traffic-generator';

export type LoadProfile = 'steady' | 'spike' | 'ramp';

export type LoadBalancerStrategy = 'least-load' | 'round-robin' | 'random';

export interface ChallengeThresholds {
  maxP95LatencyMs: number;
  maxErrorRate: number;
  /** Optional provisioned-cost ceiling in USD/hour. */
  maxCostPerHour?: number;
}

export interface ScheduledFault {
  id: string;
  nodeId: string;
  startMs: number;
  durationMs: number;
}

export interface SimulationScenarioSettings {
  loadProfile: LoadProfile;
  seed: number;
  thresholds: ChallengeThresholds;
  faults?: ScheduledFault[];
}

export type RequestTraceOutcome = 'completed' | 'failed' | 'dropped';

export type RequestTraceReason =
  | 'component-failure'
  | 'hop-limit'
  | 'queue-full'
  | 'outage'
  | 'no-target';

export interface RequestTraceHop {
  readonly componentId: string;
  readonly componentName: string;
  readonly queueWaitMs: number;
  readonly serviceTimeMs: number;
  readonly configuredLatencyMs: number;
  readonly outcome: RequestTraceOutcome;
  readonly reason: RequestTraceReason | null;
}

export interface RequestTrace {
  readonly sourceGeneratorId: string;
  readonly sourceGeneratorName: string;
  readonly requestId: number;
  readonly startedAt: number;
  readonly terminalAt: number;
  readonly totalObservedLatencyMs: number;
  readonly outcome: RequestTraceOutcome;
  readonly reason: RequestTraceReason | null;
  readonly hops: readonly RequestTraceHop[];
}

export interface SimulationEngineOptions {
  seed?: number;
  captureTraces?: boolean;
  faults?: ScheduledFault[];
}

export interface ComponentConfig {
  id: string;
  type: ComponentType;
  name: string;
  /**
   * Maximum requests per second this component can serve.
   * For traffic generators this is the target generation rate (RPS).
   */
  throughputLimit: number;
  /** Fixed latency added per hop, in milliseconds. */
  latency: number;
  /** Probability that a request fails at this component, 0 to 1. */
  failureRate: number;
  /** How many requests may wait in the queue before arrivals are dropped. */
  queueCapacity: number;
  /** Cache-only: fraction of requests served without forwarding downstream. */
  cacheHitRate?: number;
  /** Load-balancer-only: how the next target is selected. */
  lbStrategy?: LoadBalancerStrategy;
  /** Load-balancer-only: skip targets that are currently down. */
  healthChecks?: boolean;
  /** Database-only: number of identical replicas behind the node. */
  replicas?: number;
  /** Service-only: add instances when utilization is sustained above 82%. */
  autoscaling?: boolean;
  /** Service-only: minimum instance count while autoscaling. */
  minInstances?: number;
  /** Service-only: maximum instance count while autoscaling. */
  maxInstances?: number;
  /** Service-only: retry attempts after a component failure. */
  retries?: number;
}

export interface NodeMetrics {
  /** Requests that arrived at this node during the last interval. */
  requestsIn: number;
  /** Requests that completed service at this node during the last interval. */
  requestsOut: number;
  /** Failures + queue drops during the last interval. */
  errors: number;
  /** Queue drops during the last interval. */
  dropped: number;
  /** Requests currently waiting in the queue. */
  queueDepth: number;
  /** True while the component is in an injected outage. */
  down: boolean;
  /** Fraction of the last interval the server was busy, 0 to 1. */
  utilization: number;
  /** Current service instances (autoscaling services, otherwise 1). */
  instances: number;
  /** Cache hits during the last interval. */
  cacheHits: number;
  /** Cache misses during the last interval. */
  cacheMisses: number;
  /** Cache hit ratio during the last interval, 0 to 1. */
  cacheHitRate: number;
  p50Latency: number;
  p95Latency: number;
  p99Latency: number;
  avgLatency: number;
  totalIn: number;
  totalOut: number;
  totalDropped: number;
}

export interface SimulationSummary {
  completedRps: number;
  generatedRps: number;
  errorRate: number;
  p50Latency: number;
  p95Latency: number;
  p99Latency: number;
  avgLatency: number;
  totalCompleted: number;
  totalDropped: number;
  totalErrors: number;
}

export interface SimulationUpdate {
  time: number;
  nodes: Record<string, NodeMetrics>;
  summary: SimulationSummary;
  requestTraces: readonly RequestTrace[];
}

export interface GraphPayload {
  components: ComponentConfig[];
  edges: Array<{ source: string; target: string }>;
}
