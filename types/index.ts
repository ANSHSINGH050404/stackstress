export type ComponentType = 'load-balancer' | 'database' | 'cache' | 'service' | 'traffic-generator';

export interface ComponentConfig {
  id: string;
  type: ComponentType;
  name: string;
  // Tunable parameters
  throughputLimit: number; // requests per second
  latency: number; // ms
  failureRate: number; // 0 to 1
  queueCapacity: number;
}

export interface SystemEvent {
  id: string;
  time: number; // Simulation timestamp
  type: 'request' | 'response' | 'error';
  sourceId: string;
  targetId: string;
  payload: {
    requestId: string;
    data: any;
  };
}

export interface SystemState {
  components: Record<string, ComponentConfig>;
  events: SystemEvent[];
  currentTime: number;
}
