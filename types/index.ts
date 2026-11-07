export type ComponentType =
  | 'load-balancer'
  | 'database'
  | 'cache'
  | 'service'
  | 'traffic-generator';

export type LoadProfile = 'steady' | 'spike' | 'ramp';

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
}

export interface GraphPayload {
  components: ComponentConfig[];
  edges: Array<{ source: string; target: string }>;
}
