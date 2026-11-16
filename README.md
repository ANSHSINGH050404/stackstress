# StackStress

Draw a system architecture, push traffic through it, and watch queues, latency, cost, and errors react in real time.

This is not another diagramming tool. The canvas is an executable model: every component has a capacity, a latency cost, a failure rate, and a bounded queue. When demand passes capacity, the queue grows, p95 latency climbs, and requests start dropping.

## What it does

- Drag-and-drop components: traffic generator, load balancer, service, cache, and database.
- Discrete-event simulation with per-node queues, capacity limits, p50/p95/p99 latency, and bounded backpressure.
- Load profiles: steady traffic, repeating 3x spikes, or a 0.2x-to-2x ramp.
- One-click 5-second outages or scheduled faults to watch queues drain, errors spike, and the system recover.
- Live utilization, queue depth, throughput, error-rate, and cost telemetry with threshold lines and spike-window shading.

### Component semantics

- **Cache** — requests either hit and terminate at the cache or miss and continue downstream.
- **Load balancer** — least-load, round-robin, or random routing, with optional health checks that skip failed targets.
- **Database** — replicas multiply effective capacity and add cost.
- **Service** — bounded retries can rescue transient failures, while autoscaling adds instances above 82% utilization with a 2.5s cooldown.
- **Cost** — every component has a modeled cost per hour derived from capacity, replicas, and instance count, with an optional budget cap.

### Test, break, fix

- **Spike challenge** — a deterministic 9-second run with a 3x traffic spike in the final 3 seconds. Targets for p95 latency, error budget, and cost are editable.
- **Breaking-point benchmark** — a headless binary search for the highest sustained rate that still meets the targets, using the same pure engine.
- **Fix Lab** — projected candidate fixes (capacity, replicas, cache placement, and more) ranked by whether they clear the targets, applicable to the canvas in one click.
- **Evidence** — pressure-point table plus a representative request path showing queue wait, service time, and the exact hop that failed.
- **Challenge targets** — edit p95, error, and cost limits; the benchmark and challenge evaluate against the same values.

### Scenarios and workspace

- Template library (starter, read-scaled database, multi-region failover, autoscaling, monolith baseline) and chaos recipes (cache stampede, retry storm, regional service outage).
- A deterministic daily challenge seeded from the UTC date, identical for everyone.
- Floating inspector for full component configuration and per-node history.
- Graph health warnings for missing generators, orphaned nodes, and cycles, with jump-to-node actions.
- Command palette (`Ctrl/Cmd+K`), undo/redo (`Ctrl/Cmd+Z`, `Ctrl/Cmd+Shift+Z`), and a deterministic tidy layout.
- Local autosave (best-effort `localStorage`), shared-state URLs, downloadable result cards, X intents, and an Open Graph social image.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

```bash
npm run build   # production build
npm run lint    # eslint
npm test        # engine and replay tests
npx tsc --noEmit
```

Set `NEXT_PUBLIC_SITE_URL` to your deployed origin so Open Graph and Twitter images resolve to absolute production URLs. On Vercel, the production domain is picked up automatically.

## Architecture

- `lib/engine.ts` — discrete-event engine: binary event heap, per-node queues, load-aware routing, cache hits/misses, health checks, replicas, autoscaling, retries, scheduled faults, latency percentiles, and interval metrics.
- `lib/components.ts` — component defaults, sanitization, effective capacity, and cost helpers.
- `lib/store.ts` — Zustand store for the graph, metrics, node history, faults, selection, and structural undo/redo.
- `lib/simulationClient.ts` — simulation runner and graph synchronization boundary.
- `lib/challenges.ts` — spike evaluation, thresholds, evidence, representative traces, and bottleneck detection.
- `lib/benchmark.ts` — breaking-point search and Fix Lab candidate projection.
- `lib/scenarios.ts` — template and chaos scenario definitions.
- `lib/daily.ts` — deterministic daily seed and label.
- `lib/shared-simulation.ts` — versioned share schema (v2) with optional faults, cost caps, and component semantics; v1 links still decode.
- `lib/sharing.ts` — share URLs, canvas result card, and X intent text.
- `lib/persistence.ts` — best-effort local autosave.
- `lib/layout.ts` — deterministic layered layout for Tidy.
- `lib/graph-health.ts` — structural validation for the canvas.
- `components/SimulationCanvas.tsx` — React Flow canvas, toolbar, drag-and-drop, autosave, keyboard shortcuts, and runner wiring.
- `components/InspectorPanel.tsx` — component editor and per-node telemetry.
- `components/ChallengePanel.tsx` — challenge, benchmark, Fix Lab, evidence, and sharing UI.
- `components/MetricsPanel.tsx` — aggregate throughput, latency, error, and cost telemetry.
- `components/nodes/BaseNode.tsx` — compact node card with live status.
- `tests/` — seeded replay, sharing round-trip, and engine feature coverage.

The simulation runs in-process behind `simulationClient.ts`. The engine is pure TypeScript, so the transport can move to a Web Worker later without changing the UI or store.

## Determinism

Runs are seeded, so the same graph, component settings, load profile, thresholds, faults, and seed produce the same telemetry. Challenge links encode those inputs; manual outages are intentionally not replayed. The daily challenge derives its seed from the UTC date, so every visitor gets the same run.

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.
