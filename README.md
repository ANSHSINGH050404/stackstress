# System Simulator

Draw a system architecture, push traffic through it, and watch queues, latency, and errors react in real time.

This is not another diagramming tool. The canvas is an executable model: every component has a capacity, a latency cost, a failure rate, and a bounded queue. When demand passes capacity, the queue grows, p95 latency climbs, and requests start dropping.

## What it does

- Drag-and-drop components: traffic generator, load balancer, service, cache, and database.
- Discrete-event simulation with per-node queues, capacity limits, and p50/p95/p99 latency.
- Load profiles: steady traffic, repeating 3x spikes, or a 0.2x-to-2x ramp.
- One-click 5-second outages on any node to watch queues drain, errors spike, and the system recover.
- Live utilization, queue depth, throughput, and error-rate charts.
- Automatic bottleneck detection via utilization and queue-depth visuals.
- Pause, resume, and reset controls.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

```bash
npm run build   # production build
npm run lint    # eslint
npx tsc --noEmit
```

## Architecture

- `lib/engine.ts` — discrete-event engine: binary event heap, per-node queues, load-aware routing, load profiles, outage injection, latency percentiles, and interval metrics.
- `lib/store.ts` — Zustand store for the graph, node metrics, and chart history.
- `lib/simulationClient.ts` — simulation runner and graph synchronization boundary.
- `components/SimulationCanvas.tsx` — React Flow canvas, toolbar, drag-and-drop, and runner wiring.
- `components/nodes/BaseNode.tsx` — shared node UI for config and live metrics.
- `components/MetricsPanel.tsx` — aggregate throughput, p95 latency, and error-rate charts.

The simulation currently runs in-process behind `simulationClient.ts`. The engine is pure TypeScript, so the transport can move to a Web Worker later without changing the UI or store.
