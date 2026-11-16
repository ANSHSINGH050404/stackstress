import type { ComponentConfig, ComponentType } from '@/types';

export const COMPONENT_LIMITS = {
  throughputLimit: { min: 0, max: 100_000 },
  latency: { min: 0, max: 60_000 },
  failureRate: { min: 0, max: 1 },
  queueCapacity: { min: 0, max: 1_000_000 },
  cacheHitRate: { min: 0, max: 1 },
  replicas: { min: 1, max: 10 },
  minInstances: { min: 1, max: 10 },
  maxInstances: { min: 1, max: 10 },
  retries: { min: 0, max: 3 },
} as const;

export function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function clampInteger(value: number, min: number, max: number): number {
  return Math.round(clampNumber(value, min, max));
}

/**
 * Keep the stored graph truthful. The engine clamps defensively too, but the
 * UI should never display a value that the simulation silently ignores.
 */
export function sanitizeComponent(component: ComponentConfig): ComponentConfig {
  const throughputLimit = clampNumber(
    component.throughputLimit,
    COMPONENT_LIMITS.throughputLimit.min,
    COMPONENT_LIMITS.throughputLimit.max
  );
  const latency = clampNumber(
    component.latency,
    COMPONENT_LIMITS.latency.min,
    COMPONENT_LIMITS.latency.max
  );
  const failureRate = clampNumber(
    component.failureRate,
    COMPONENT_LIMITS.failureRate.min,
    COMPONENT_LIMITS.failureRate.max
  );
  const queueCapacity = clampInteger(
    component.queueCapacity,
    COMPONENT_LIMITS.queueCapacity.min,
    COMPONENT_LIMITS.queueCapacity.max
  );
  const name = component.name.trim().slice(0, 80) || 'Component';

  const next: ComponentConfig = {
    ...component,
    name,
    throughputLimit,
    latency,
    failureRate,
    queueCapacity,
  };

  if (component.cacheHitRate !== undefined) {
    next.cacheHitRate = clampNumber(
      component.cacheHitRate,
      COMPONENT_LIMITS.cacheHitRate.min,
      COMPONENT_LIMITS.cacheHitRate.max
    );
  }
  if (component.replicas !== undefined) {
    next.replicas = clampInteger(
      component.replicas,
      COMPONENT_LIMITS.replicas.min,
      COMPONENT_LIMITS.replicas.max
    );
  }
  if (component.minInstances !== undefined) {
    next.minInstances = clampInteger(
      component.minInstances,
      COMPONENT_LIMITS.minInstances.min,
      COMPONENT_LIMITS.minInstances.max
    );
  }
  if (component.maxInstances !== undefined) {
    next.maxInstances = clampInteger(
      component.maxInstances,
      COMPONENT_LIMITS.maxInstances.min,
      COMPONENT_LIMITS.maxInstances.max
    );
  }
  if (
    next.minInstances !== undefined &&
    next.maxInstances !== undefined &&
    next.maxInstances < next.minInstances
  ) {
    next.maxInstances = next.minInstances;
  }
  if (component.retries !== undefined) {
    next.retries = clampInteger(
      component.retries,
      COMPONENT_LIMITS.retries.min,
      COMPONENT_LIMITS.retries.max
    );
  }

  return next;
}

/** Capacity one instance can serve, including database replicas. */
export function effectiveCapacity(
  component: ComponentConfig,
  instances = 1
): number {
  const replicas = component.replicas ?? 1;
  const runningInstances = component.autoscaling
    ? Math.max(1, instances)
    : 1;
  return component.throughputLimit * replicas * runningInstances;
}

const COST_BASE: Record<ComponentType, number> = {
  'traffic-generator': 0,
  'load-balancer': 4,
  service: 8,
  cache: 6,
  database: 12,
};

const COST_PER_100_RPS: Record<ComponentType, number> = {
  'traffic-generator': 0,
  'load-balancer': 0.18,
  service: 1.15,
  cache: 0.32,
  database: 2.8,
};

/**
 * Provisioned cost in USD/hour. Autoscaled services pay for their current
 * instance count when runtime metrics are available.
 */
export function componentCostPerHour(
  component: ComponentConfig,
  instances = component.minInstances ?? 1
): number {
  const capacity = effectiveCapacity(
    component,
    component.autoscaling ? instances : 1
  );
  return COST_BASE[component.type] + (capacity / 100) * COST_PER_100_RPS[component.type];
}

export function formatCost(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '$0.00/hr';
  if (value < 1) return `$${value.toFixed(2)}/hr`;
  return `$${value.toFixed(1)}/hr`;
}
