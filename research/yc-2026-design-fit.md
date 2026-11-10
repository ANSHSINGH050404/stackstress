# YC 2026 Design Fit for the System Simulator

As of November 8, 2026, YC's directory lists four 2026 batches: Winter (197
companies), Spring (192), Summer (227), and Fall (216), for 832 total. This is a
relevance-filtered UX review of developer-tool, infrastructure, simulation, and
testing products in that directory, not a page-by-page teardown of all 832
companies. Several products are early-access, CLI-first, or do not expose their
application publicly, so recommendations below rely on public product pages and
documentation rather than assumptions about inaccessible screens.

## Recommendation

Use **Simulithic as the closest overall interaction reference**, while retaining
the simulator's own dark, topology-first visual identity. Its public documentation
describes a simulation canvas, configurable runs, live activity, and per-run
results, which closely matches the simulator's graph, challenge controls, and
metrics. Borrow the workflow, not its brand or exact visual styling.

Use **Workers IO** as the strongest domain reference for failure scenarios and
replay, and **Composal** as the strongest reference for making a failed run
understandable and actionable.

## Shortlist

| YC startup | Fit | Patterns worth adapting |
| --- | --- | --- |
| [Simulithic (F26)](https://www.ycombinator.com/companies/simulithic) | Closest interaction model: simulate scenarios from a visual canvas. | Keep the graph central; make run setup explicit; show live progress and a result per scenario. Its docs describe a canvas of flows, a run-configuration panel, live session tiles, and per-run outcomes. [Simulate docs](https://www.simulithic.com/docs/simulate) |
| [Workers IO (F26)](https://www.ycombinator.com/companies/workers-io) | Closest systems-simulation concept. | Turn scenario results into clear promises/invariants, identify the first failure, and make that run reproducible. Its public product page demonstrates injected production faults, pass/fail checks, and deterministic replay. [Workers IO](https://workers.io/) |
| [Composal (F26)](https://www.ycombinator.com/companies/composal) | Best failure-review pattern. | Pair the failed component with the request path, exact cause, reproduction steps, and a replay action instead of stopping at red metrics. [Deep Scan](https://composal.com/product/deep-scan) |
| [Graphide (F26)](https://www.ycombinator.com/companies/graphide) | Best graph-navigation reference. | Keep topology legible at multiple zoom levels; reveal affected paths and details on selection rather than crowding the canvas. [Graphide overview](https://graphide.com/overview/) |
| [Simantic (F26)](https://www.ycombinator.com/companies/simantic) | Literal simulator analogue, but aimed at firmware and primarily CLI/API workflows. | Treat simulation as a repeatable test loop with inspectable inputs and results; less useful as a visual web-app template. [Simantic Cloud Sim](https://simantic.com/cloud-sim) |

## Apply This to the Current UI

1. Keep the editable architecture graph as the main stage.
2. Make challenge/scenario setup a compact, clearly scoped panel rather than adding more permanent dashboard chrome.
3. On failure, focus the bottleneck and highlight the affected request path; show the key metric, the reason it failed, and a one-click replay.
4. Add a few named scenarios (traffic spike, database outage, cold cache) and compare each run against the previous attempt.
5. Preserve the existing shareable challenge card/link; it is a better fit for this product than copying an enterprise monitoring dashboard.

## Source Scope

The batch counts and company profiles come from the [YC Startup Directory](https://www.ycombinator.com/companies) and YC's [Developer Tools directory](https://www.ycombinator.com/companies/industry/Developer%20Tools). Product-interface claims are linked to first-party company sites or docs. The shortlist is ranked for interaction-model fit, not startup quality or popularity.
