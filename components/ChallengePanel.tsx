'use client';

import { useState } from 'react';
import { formatLatency, formatPercent, formatRate } from '@/lib/format';
import { formatCost } from '@/lib/components';
import { summarizeBenchmark, type BenchmarkResult, type FixCandidate } from '@/lib/benchmark';
import {
  SPIKE_CHALLENGE_DURATION_MS,
  SPIKE_WINDOW_START_MS,
  type ChallengePhase,
  type ChallengeResult,
} from '@/lib/challenges';
import type {
  ChallengeThresholds,
  RequestTrace,
  RequestTraceReason,
} from '@/types';

type MobileChallengeDockState = 'collapsed' | 'expanded';

export interface ChallengePanelProps {
  phase: ChallengePhase;
  elapsedMs: number;
  attempt: number;
  baseline: ChallengeResult | null;
  result: ChallengeResult | null;
  thresholds: ChallengeThresholds;
  isSharedScenario: boolean;
  dailyLabel: string | null;
  shareNotice: string | null;
  benchmark: BenchmarkResult | null;
  benchmarkRunning: boolean;
  fixCandidates: FixCandidate[];
  fixLabRunning: boolean;
  onStart: () => void;
  onScaleBottleneck: () => void;
  onBenchmark: () => void;
  onApplyFix: (candidate: FixCandidate) => void;
  onChangeThresholds: (thresholds: ChallengeThresholds) => void;
  onCopyLink: () => void;
  onDownloadCard: () => void;
  xShareHref: string | null;
}

function Metric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="border-t border-rule pt-2.5">
      <div className="text-[11px] text-muted">{label}</div>
      <div className="mt-1 font-mono text-[16px] font-semibold tabular-nums tracking-tight text-ink">
        {value}
      </div>
    </div>
  );
}

function TargetInput({
  label,
  value,
  suffix,
  step = 1,
  placeholder,
  onChange,
}: {
  label: string;
  value: number | '';
  suffix: string;
  step?: number;
  placeholder?: string;
  onChange: (value: number | '') => void;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-[10px] text-muted">{label}</span>
      <span className="flex min-h-8 items-center gap-1 rounded-[2px] border border-control bg-surface px-2 focus-within:border-live focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-live">
        <input
          type="number"
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          value={value}
          step={step}
          min={0}
          placeholder={placeholder}
          onChange={(event) => {
            if (event.target.value === '') {
              onChange('');
              return;
            }
            const next = Number(event.target.value);
            onChange(Number.isFinite(next) ? next : 0);
          }}
          className="w-full min-w-0 bg-transparent py-1 font-mono text-[12px] font-medium text-ink outline-none"
        />
        <span className="shrink-0 font-mono text-[10px] text-faint">{suffix}</span>
      </span>
    </label>
  );
}

const TRACE_REASON_LABELS: Record<RequestTraceReason, string> = {
  'component-failure': 'Component failure',
  'hop-limit': 'Hop limit reached',
  'queue-full': 'Queue full',
  outage: 'Component outage',
  'no-target': 'No connected target',
};

function RequestPath({ trace }: { trace: RequestTrace }) {
  return (
    <section
      aria-labelledby="request-path-title"
      className="mt-4 border-y border-rule py-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 id="request-path-title" className="text-[13px] font-semibold text-ink">
            Representative request
          </h3>
          <p className="mt-1 text-[11px] text-muted">
            {trace.outcome[0].toUpperCase() + trace.outcome.slice(1)}
            {trace.reason ? ` · ${TRACE_REASON_LABELS[trace.reason]}` : ''}
          </p>
        </div>
        <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted">
          #{trace.requestId}
        </span>
      </div>

      <p className="mt-2 font-mono text-[11px] tabular-nums text-ink">
        {formatLatency(trace.totalObservedLatencyMs)} observed
      </p>

      <ol
        aria-label="Request path from source through each component"
        className="mt-3 list-none border-l border-rule pl-3"
      >
        <li className="relative pb-3">
          <span
            aria-hidden="true"
            className="absolute -left-[1.02rem] top-0.5 h-2 w-2 rounded-full border border-live bg-surface"
          />
          <p className="text-[12px] font-semibold leading-snug text-ink">
            {trace.sourceGeneratorName}
          </p>
          <p className="mt-0.5 text-[10px] text-muted">Traffic generator</p>
        </li>
        {trace.hops.map((hop, index) => (
          <li
            key={`${hop.componentId}-${index}`}
            className="relative border-t border-rule/70 py-2.5 last:pb-0"
          >
            <span
              aria-hidden="true"
              className={`absolute -left-[1.02rem] top-3 h-2 w-2 rounded-full border ${
                hop.outcome === 'completed'
                  ? 'border-live bg-live'
                  : 'border-alarm bg-alarm'
              }`}
            />
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 break-words text-[12px] font-semibold leading-snug text-ink">
                {hop.componentName}
              </p>
              <span
                className={`shrink-0 font-mono text-[9px] uppercase tracking-wide ${
                  hop.outcome === 'completed' ? 'text-live-ink' : 'text-alarm-ink'
                }`}
              >
                {hop.outcome}
              </span>
            </div>
            <dl className="mt-2 grid grid-cols-3 gap-1.5">
              <div>
                <dt className="text-[9px] leading-tight text-muted">Queue wait</dt>
                <dd className="mt-0.5 font-mono text-[10px] tabular-nums text-ink">
                  {formatLatency(hop.queueWaitMs)}
                </dd>
              </div>
              <div>
                <dt className="text-[9px] leading-tight text-muted">Service</dt>
                <dd className="mt-0.5 font-mono text-[10px] tabular-nums text-ink">
                  {formatLatency(hop.serviceTimeMs)}
                </dd>
              </div>
              <div>
                <dt className="text-[9px] leading-tight text-muted">
                  Configured latency
                </dt>
                <dd className="mt-0.5 font-mono text-[10px] tabular-nums text-ink">
                  {formatLatency(hop.configuredLatencyMs)}
                </dd>
              </div>
            </dl>
            {hop.reason && (
              <p className="mt-1.5 text-[10px] leading-relaxed text-alarm-ink">
                {TRACE_REASON_LABELS[hop.reason]}
              </p>
            )}
          </li>
        ))}
      </ol>

      {trace.hops.length === 0 && (
        <p className="mt-1 text-[11px] leading-relaxed text-muted">
          This request ended before reaching a component.
        </p>
      )}

      <p className="mt-3 border-l-2 border-rule-strong pl-2.5 text-[10px] leading-relaxed text-muted">
        Configured latency is separate from queue and service time. Run again
        reuses the seed. Replay requires the same graph and component settings;
        manual outages are not replayed.
      </p>
    </section>
  );
}

export default function ChallengePanel({
  phase,
  elapsedMs,
  attempt,
  baseline,
  result,
  thresholds,
  isSharedScenario,
  dailyLabel,
  shareNotice,
  benchmark,
  benchmarkRunning,
  fixCandidates,
  fixLabRunning,
  onStart,
  onScaleBottleneck,
  onBenchmark,
  onApplyFix,
  onChangeThresholds,
  onCopyLink,
  onDownloadCard,
  xShareHref,
}: ChallengePanelProps) {
  const [mobileDockState, setMobileDockState] =
    useState<MobileChallengeDockState>('collapsed');
  const isExpanded = mobileDockState === 'expanded';
  const progress = Math.min(100, (elapsedMs / SPIKE_CHALLENGE_DURATION_MS) * 100);
  const phaseLabel =
    phase === 'running'
      ? 'Running'
      : phase === 'complete'
        ? result?.passed
          ? 'Passed'
          : 'Failed'
        : 'Ready';
  const phaseColor =
    phase === 'running'
      ? 'border-live/30 bg-live/10 text-live-ink'
      : phase === 'complete'
        ? result?.passed
          ? 'border-live/30 bg-live/10 text-live-ink'
          : 'border-alarm/30 bg-alarm/10 text-alarm-ink'
        : 'border-rule bg-paper text-muted';
  const failureReasons = result
    ? [
        result.generatedRps <= 0 ? 'No traffic reached the system.' : null,
        result.p95Latency > thresholds.maxP95LatencyMs
          ? `p95 ${formatLatency(result.p95Latency)} exceeded ${formatLatency(thresholds.maxP95LatencyMs)}.`
          : null,
        result.errorRate > thresholds.maxErrorRate
          ? `Errors ${formatPercent(result.errorRate)} exceeded the ${formatPercent(thresholds.maxErrorRate)} budget.`
          : null,
        result.maxCostPerHour !== undefined &&
        result.costPerHour > result.maxCostPerHour
          ? `Run cost ${formatCost(result.costPerHour)} exceeded the ${formatCost(result.maxCostPerHour)} cap.`
          : null,
      ].filter((reason): reason is string => reason !== null)
    : [];
  const challengeSeconds = SPIKE_CHALLENGE_DURATION_MS / 1000;
  const benchmarkValue = benchmark ? summarizeBenchmark(benchmark) : null;

  return (
    <aside
      className={`col-start-1 row-start-3 z-20 flex h-full w-full shrink-0 flex-col border-t border-rule bg-surface lg:col-start-2 lg:row-start-2 xl:static xl:col-start-3 xl:row-start-1 xl:max-h-none xl:w-full xl:border-l xl:border-t-0 ${
        isExpanded
          ? 'fixed inset-x-0 bottom-0 z-40 h-[min(72dvh,28rem)] max-h-[72dvh] shadow-[0_-12px_40px_rgba(21,34,44,0.16)] xl:static xl:inset-auto xl:h-full xl:shadow-none'
          : 'relative h-full xl:static'
      }`}
    >
      <header className="flex h-[52px] shrink-0 items-center justify-between gap-2 border-b border-rule px-3 xl:h-auto xl:px-5 xl:py-4">
        <div className="min-w-0 xl:hidden">
          <p className="text-[13px] font-semibold text-ink">
            {dailyLabel ?? 'Spike absorption'}
          </p>
          <p className="truncate font-mono text-[10px] text-muted">
            {dailyLabel ? 'DAILY' : 'TEST 01'}
          </p>
        </div>
        <div className="hidden min-w-0 xl:block">
          <p className="font-mono text-[10px] tracking-[0.04em] text-muted">
            {dailyLabel ? 'DAILY CHALLENGE' : 'TEST 01'}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span
            className={`rounded-[2px] border px-2 py-1.5 font-mono text-[9px] uppercase tracking-[0.08em] xl:px-2.5 xl:text-[10px] ${phaseColor}`}
            aria-live="polite"
          >
            {phaseLabel}
          </span>
          <button
            type="button"
            aria-label={isExpanded ? 'Close challenge details' : 'Open challenge details'}
            aria-expanded={isExpanded}
            aria-controls="mobile-challenge-content"
            onClick={() =>
              setMobileDockState((current) =>
                current === 'collapsed' ? 'expanded' : 'collapsed'
              )
            }
            className="flex min-h-11 shrink-0 items-center gap-1 rounded-[3px] border border-rule px-2.5 text-[11px] font-semibold text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live xl:hidden"
          >
            {isExpanded ? 'Close' : 'Details'}
            <span aria-hidden="true">{isExpanded ? '−' : '+'}</span>
          </button>
        </div>
      </header>

      <section
        id="mobile-challenge-content"
        aria-labelledby="challenge-title"
        tabIndex={0}
        className={`min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overscroll-contain px-4 py-4 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-live xl:px-5 xl:py-5 ${
          isExpanded ? 'flex' : 'hidden xl:flex'
        }`}
      >
        <h2
          id="challenge-title"
          className="text-[24px] font-semibold leading-[1.08] tracking-[-0.03em] text-ink text-balance"
        >
          {dailyLabel ?? 'Spike absorption'}
        </h2>
        <p className="mt-2.5 text-[12.5px] leading-relaxed text-muted">
          {dailyLabel
            ? 'One fixed seed, one fixed architecture, everyone runs the same spike.'
            : 'Prove the architecture can absorb a sudden 3× increase in demand.'}
        </p>

        {isSharedScenario && (
          <p className="mt-4 border-l-2 border-live bg-live/[0.06] px-3 py-2.5 text-[12px] leading-relaxed text-live-ink">
            Shared architecture loaded. Run it or make it your own.
          </p>
        )}

        {phase === 'ready' && (
          <button
            type="button"
            onClick={onStart}
            className="mt-5 flex min-h-11 w-full items-center justify-between rounded-[3px] bg-ink px-4 py-3 text-left text-[13px] font-semibold text-surface transition-colors hover:bg-[#243642] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live"
          >
            <span>Run {challengeSeconds}-second test</span>
          </button>
        )}

        {phase === 'running' && (
          <div className="mt-5 border-l-2 border-live bg-live/[0.06] p-3.5" aria-live="polite">
            <div className="flex items-center justify-between gap-2 text-[12px]">
              <span className="flex items-center gap-2 font-semibold text-live-ink">
                <span className="h-2 w-2 animate-pulse rounded-[1px] bg-live" />
                Traffic in progress
              </span>
              <span className="font-mono tabular-nums text-muted">
                {Math.min(challengeSeconds, Math.floor(elapsedMs / 1000))}
                /{challengeSeconds}s
              </span>
            </div>
            <div
              className="mt-3 h-1.5 overflow-hidden rounded-[1px] bg-rule"
              role="progressbar"
              aria-label="Challenge progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progress)}
            >
              <div
                className="sim-progress-fill h-full w-full origin-left rounded-[1px] bg-live"
                style={{ transform: `scaleX(${progress / 100})` }}
              />
            </div>
            <p className="mt-2.5 text-[12px] leading-relaxed text-muted">
              Watch the graph and telemetry. Pause or tune a component from the
              canvas.
            </p>
          </div>
        )}

        {phase === 'complete' && result && (
          <div
            className={`mt-5 border-l-2 p-3.5 ${
              result.passed
                ? 'border-live bg-live/[0.06]'
                : 'border-alarm bg-alarm/[0.06]'
            }`}
            aria-live="polite"
          >
            <p
              className={`text-[15px] font-semibold ${
                result.passed ? 'text-live-ink' : 'text-alarm-ink'
              }`}
            >
              {result.passed ? 'Test passed' : 'Bottleneck found'}
            </p>
            <p className="mt-1.5 text-[12px] leading-relaxed text-muted">
              {result.passed
                ? 'The system stayed within its latency, error, and cost targets.'
                : failureReasons.length > 0
                  ? failureReasons.join(' ')
                  : 'The system exceeded a challenge target. Adjust a component and retry.'}
            </p>
            {!result.passed && result.bottleneckName && (
              <p className="mt-3 border-t border-rule pt-2.5 text-[12px] text-muted">
                Focused in canvas:{' '}
                <span className="font-semibold text-ink">
                  {result.bottleneckName}
                </span>
              </p>
            )}
          </div>
        )}

        {phase !== 'running' && (
          <section
            aria-labelledby="benchmark-title"
            className="mt-4 border border-rule bg-paper/60 p-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3
                  id="benchmark-title"
                  className="text-[12px] font-semibold text-ink"
                >
                  Breaking-point benchmark
                </h3>
                <p className="mt-0.5 text-[10.5px] leading-snug text-muted">
                  Headless binary search for the highest sustained rate that
                  still meets the targets.
                </p>
              </div>
              <button
                type="button"
                onClick={onBenchmark}
                disabled={benchmarkRunning}
                className="min-h-8 shrink-0 rounded-[2px] border border-data/40 bg-surface px-2.5 text-[10px] font-semibold text-data transition-colors hover:bg-data/[0.06] disabled:cursor-wait disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live"
              >
                {benchmarkRunning ? 'Searching…' : benchmark ? 'Re-run' : 'Find limit'}
              </button>
            </div>
            {benchmark && benchmarkValue ? (
              <div className="mt-2.5 border-t border-rule pt-2.5">
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-[22px] font-semibold tabular-nums tracking-tight text-ink">
                    {benchmarkValue}
                  </span>
                  <span className="text-[10px] text-muted">
                    {benchmark.capped
                      ? `searched to ${benchmark.searchedMaxRps} rps`
                      : 'sustained'}
                  </span>
                </div>
                <p className="mt-1 text-[10.5px] leading-snug text-muted">
                  {benchmark.capped
                    ? 'The architecture did not break within the search range.'
                    : benchmark.bottleneckName
                      ? `${benchmark.bottleneckName} gives out first.`
                      : 'Latency or errors cross the target above this rate.'}
                  {!benchmark.capped && benchmark.p95AtBreak > 0
                    ? ` p95 at break ${formatLatency(benchmark.p95AtBreak)}.`
                    : ''}
                </p>
              </div>
            ) : benchmarkRunning ? (
              <p className="mt-2.5 border-t border-rule pt-2.5 text-[10.5px] text-muted">
                Running deterministic 6-second trials across the rate range…
              </p>
            ) : null}
          </section>
        )}

        {phase === 'complete' &&
          result &&
          !result.passed &&
          (result.representativeTrace ? (
            <RequestPath trace={result.representativeTrace} />
          ) : (
            <p className="mt-4 border-y border-rule py-3 text-[11px] leading-relaxed text-muted">
              No representative request was captured in the 6–9 second spike
              window.
            </p>
          ))}

        {phase === 'complete' && result && !result.passed && (
          <section aria-labelledby="evidence-title" className="mt-4">
            <div className="flex items-baseline justify-between gap-2">
              <h3 id="evidence-title" className="text-[12px] font-semibold text-ink">
                Pressure points
              </h3>
              <span className="font-mono text-[9px] uppercase tracking-[0.06em] text-faint">
                peak / window
              </span>
            </div>
            {result.evidence.length > 0 ? (
              <ul className="mt-2 border-y border-rule">
                {result.evidence.map((evidence) => (
                  <li
                    key={evidence.nodeId}
                    className="flex items-start justify-between gap-3 border-b border-rule/70 py-2 last:border-b-0"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[11.5px] font-medium text-ink">
                        {evidence.nodeName}
                      </p>
                      <p className="mt-0.5 font-mono text-[9.5px] tabular-nums text-muted">
                        queue {evidence.peakQueueDepth} · util{' '}
                        {formatPercent(evidence.peakUtilization, 0)} · dropped{' '}
                        {Math.round(evidence.dropped)}
                      </p>
                    </div>
                    <span className="shrink-0 font-mono text-[9px] text-faint">
                      {evidence.firstFailureAt !== null
                        ? `t ${(evidence.firstFailureAt / 1000).toFixed(0)}s`
                        : '—'}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 border-y border-rule py-2 text-[11px] text-muted">
                No node-level pressure was recorded in the window.
              </p>
            )}
          </section>
        )}

        {phase === 'complete' && result && !result.passed && (
          <section aria-labelledby="fixlab-title" className="mt-4">
            <h3 id="fixlab-title" className="text-[12px] font-semibold text-ink">
              Fix Lab
            </h3>
            <p className="mt-0.5 text-[10.5px] leading-snug text-muted">
              Same seed, same traffic shape. Applying a fix replaces the canvas
              so you can verify it yourself.
            </p>
            {fixLabRunning ? (
              <p className="mt-2 border-y border-rule py-2 text-[10.5px] text-muted">
                Projecting candidate fixes…
              </p>
            ) : fixCandidates.length > 0 ? (
              <ul className="mt-2 space-y-1.5">
                {fixCandidates.map((candidate) => (
                  <li key={candidate.id}>
                    <button
                      type="button"
                      onClick={() => onApplyFix(candidate)}
                      className="w-full border border-rule bg-surface p-2.5 text-left transition-colors hover:border-live/50 hover:bg-live/[0.04] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-live"
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-[11.5px] font-semibold text-ink">
                          {candidate.label}
                        </span>
                        <span
                          className={`shrink-0 rounded-[2px] px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-[0.06em] ${
                            candidate.projected.passed
                              ? 'bg-live/10 text-live-ink'
                              : 'bg-warning/10 text-warning-ink'
                          }`}
                        >
                          {candidate.projected.passed
                            ? 'projected pass'
                            : 'still tight'}
                        </span>
                      </span>
                      <span className="mt-0.5 block text-[10px] leading-snug text-muted">
                        {candidate.description}
                      </span>
                      <span className="mt-1 block font-mono text-[9.5px] tabular-nums text-muted">
                        p95 {formatLatency(candidate.projected.p95Latency)} ·
                        errors {formatPercent(candidate.projected.errorRate)} ·
                        cost {formatCost(candidate.projected.costPerHour)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 border-y border-rule py-2 text-[10.5px] text-muted">
                No candidate fixes were generated for this bottleneck.
              </p>
            )}
          </section>
        )}

        <details className="mt-4 border-y border-rule py-2.5">
          <summary className="cursor-pointer list-none text-[12px] font-medium text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live">
            Challenge targets
            <span className="ml-2 font-mono text-[10px] font-normal text-muted">
              p95 ≤ {formatLatency(thresholds.maxP95LatencyMs)} · errors ≤{' '}
              {formatPercent(thresholds.maxErrorRate)}
              {thresholds.maxCostPerHour !== undefined
                ? ` · cost ≤ ${formatCost(thresholds.maxCostPerHour)}`
                : ''}
            </span>
          </summary>
          <div className="mt-2.5 grid grid-cols-3 gap-2">
            <TargetInput
              label="p95 limit"
              value={thresholds.maxP95LatencyMs}
              suffix="ms"
              step={50}
              onChange={(value) =>
                onChangeThresholds({
                  ...thresholds,
                  maxP95LatencyMs: value === '' ? 0 : value,
                })
              }
            />
            <TargetInput
              label="Error budget"
              value={Math.round(thresholds.maxErrorRate * 1000) / 10}
              suffix="%"
              step={0.5}
              onChange={(value) =>
                onChangeThresholds({
                  ...thresholds,
                  maxErrorRate: (value === '' ? 0 : value) / 100,
                })
              }
            />
            <TargetInput
              label="Cost cap"
              value={thresholds.maxCostPerHour ?? ''}
              suffix="$/hr"
              step={1}
              placeholder="none"
              onChange={(value) =>
                onChangeThresholds({
                  ...thresholds,
                  maxCostPerHour: value === '' ? undefined : value,
                })
              }
            />
          </div>
        </details>

        <div className="mt-5 grid grid-cols-[2fr_1fr] gap-3 border-y border-rule py-3" aria-label="Traffic profile">
          <div className="px-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[11px] font-medium text-muted">Steady</span>
              <span className="font-mono text-[10px] text-faint">
                0–{SPIKE_WINDOW_START_MS / 1000}s
              </span>
            </div>
            <div className="mt-2.5 h-1 overflow-hidden rounded-[1px] bg-rule">
              <div className="h-full w-2/3 rounded-[1px] bg-faint" />
            </div>
          </div>
          <div className="border-l border-rule pl-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="whitespace-nowrap text-[11px] font-medium text-warning-ink">
                Spike 3×
              </span>
            </div>
            <div className="mt-2.5 h-1 overflow-hidden rounded-[1px] bg-warning/15">
              <div className="h-full w-full rounded-[1px] bg-warning" />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 border-b border-rule py-3">
          <div>
            <p className="text-[11px] text-muted">Latency target</p>
            <p className="mt-1 font-mono text-[13px] font-semibold text-ink">
              p95 ≤ {formatLatency(thresholds.maxP95LatencyMs)}
            </p>
          </div>
          <div className="border-l border-rule pl-3">
            <p className="text-[11px] text-muted">Error budget</p>
            <p className="mt-1 font-mono text-[13px] font-semibold text-ink">
              ≤ {formatPercent(thresholds.maxErrorRate)}
            </p>
          </div>
        </div>

        {phase === 'complete' && result && (
          <div className="mt-4" aria-live="polite">
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              <Metric label="p95 latency" value={formatLatency(result.p95Latency)} />
              <Metric label="Error rate" value={formatPercent(result.errorRate)} />
              <Metric label="Delivered" value={`${formatRate(result.completedRps)}/s`} />
              <Metric label="Dropped" value={Math.round(result.dropped).toLocaleString()} />
              <Metric label="Run cost" value={formatCost(result.costPerHour)} />
              <Metric
                label="Cost cap"
                value={
                  result.maxCostPerHour !== undefined
                    ? formatCost(result.maxCostPerHour)
                    : 'none'
                }
              />
            </div>

            {attempt > 1 && baseline && (
              <div className="mt-4 border-t border-rule pt-3">
                <p className="text-[11px] text-muted">Attempt comparison</p>
                <p className="mt-2 font-mono text-[12px] tabular-nums text-ink">
                  p95 {formatLatency(baseline.p95Latency)} →{' '}
                  {formatLatency(result.p95Latency)}
                  <span className="mx-1.5 text-faint">/</span>
                  errors {formatPercent(baseline.errorRate)} →{' '}
                  {formatPercent(result.errorRate)}
                </p>
              </div>
            )}

            <div
              className={`mt-2 grid gap-1.5 ${
                !result.passed && result.bottleneckId && result.canScaleBottleneck
                  ? 'grid-cols-2'
                  : 'grid-cols-1'
              }`}
            >
              {!result.passed && result.bottleneckId && result.canScaleBottleneck && (
                <button
                  type="button"
                  onClick={onScaleBottleneck}
                  className="min-h-11 rounded-[3px] border border-warning/40 bg-warning/[0.07] px-2.5 py-2.5 text-[12px] font-semibold text-warning-ink transition-colors hover:bg-warning/[0.12] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-warning"
                >
                  Scale bottleneck
                </button>
              )}
              <button
                type="button"
                onClick={onStart}
                className="min-h-11 rounded-[3px] bg-ink px-2.5 py-2.5 text-[12px] font-semibold text-surface transition-colors hover:bg-[#243642] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live"
              >
                Run again
              </button>
            </div>

            <div className="mt-4 grid grid-cols-3 divide-x divide-rule border-y border-rule">
              <button
                type="button"
                onClick={onCopyLink}
                className="min-h-10 px-1 py-2 text-[11px] font-medium text-muted transition-colors hover:bg-paper hover:text-ink focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-live"
              >
                Copy link
              </button>
              <button
                type="button"
                onClick={onDownloadCard}
                className="min-h-10 px-1 py-2 text-[11px] font-medium text-muted transition-colors hover:bg-paper hover:text-ink focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-live"
              >
                Download card
              </button>
              {xShareHref ? (
                <a
                  href={xShareHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-10 px-1 py-2 text-center text-[11px] font-semibold text-live-ink transition-colors hover:bg-paper focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-live"
                >
                  Share on X
                </a>
              ) : (
                <span className="px-1 py-2 text-center text-[11px] text-faint">
                  Share on X
                </span>
              )}
            </div>
          </div>
        )}

        {phase === 'ready' && (
          <button
            type="button"
            onClick={onCopyLink}
            className="mt-2 min-h-10 w-full rounded-[3px] px-3 py-2 text-[12px] font-medium text-muted transition-colors hover:bg-paper hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live"
          >
            Copy challenge link
          </button>
        )}

        {shareNotice && (
          <p className="mt-3 text-center text-[12px] text-live-ink" aria-live="polite">
            {shareNotice}
          </p>
        )}
      </section>
    </aside>
  );
}
