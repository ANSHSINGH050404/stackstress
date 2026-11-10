'use client';

import { useState } from 'react';
import { formatLatency, formatPercent, formatRate } from '@/lib/format';
import {
  CHALLENGE_MAX_ERROR_RATE,
  CHALLENGE_MAX_P95_MS,
  SPIKE_CHALLENGE_DURATION_MS,
  SPIKE_WINDOW_START_MS,
  type ChallengePhase,
  type ChallengeResult,
} from '@/lib/challenges';

type MobileChallengeDockState = 'collapsed' | 'expanded';

export interface ChallengePanelProps {
  phase: ChallengePhase;
  elapsedMs: number;
  attempt: number;
  baseline: ChallengeResult | null;
  result: ChallengeResult | null;
  isSharedScenario: boolean;
  shareNotice: string | null;
  onStart: () => void;
  onScaleBottleneck: () => void;
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
    <div className="border-t border-[#d8d4c9] pt-2.5">
      <div className="text-[11px] font-medium uppercase tracking-[0.1em] text-[#65706b]">
        {label}
      </div>
      <div className="mt-1 text-[17px] font-semibold tabular-nums tracking-tight text-[#202b29]">
        {value}
      </div>
    </div>
  );
}

export default function ChallengePanel({
  phase,
  elapsedMs,
  attempt,
  baseline,
  result,
  isSharedScenario,
  shareNotice,
  onStart,
  onScaleBottleneck,
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
      ? 'Live run'
      : phase === 'complete'
        ? result?.passed
          ? 'Passed'
          : 'Needs work'
        : 'Ready';
  const phaseColor =
    phase === 'running'
      ? 'border-[#267a68]/25 bg-[#267a68]/10 text-[#176454]'
      : phase === 'complete'
        ? result?.passed
          ? 'border-[#267a68]/25 bg-[#267a68]/10 text-[#176454]'
          : 'border-[#b63e35]/25 bg-[#b63e35]/10 text-[#9c3029]'
        : 'border-[#d8d4c9] bg-[#f4f1e8] text-[#65706b]';
  const failureReasons = result
    ? [
        result.generatedRps <= 0 ? 'No traffic reached the system.' : null,
        result.p95Latency > CHALLENGE_MAX_P95_MS
          ? `p95 ${formatLatency(result.p95Latency)} exceeded ${formatLatency(CHALLENGE_MAX_P95_MS)}.`
          : null,
        result.errorRate > CHALLENGE_MAX_ERROR_RATE
          ? `Errors ${formatPercent(result.errorRate)} exceeded the ${formatPercent(CHALLENGE_MAX_ERROR_RATE)} budget.`
          : null,
      ].filter((reason): reason is string => reason !== null)
    : [];

  return (
    <aside
      className={`sim-inspector-enter z-20 flex w-full shrink-0 flex-col border-t border-[#d8d4c9] bg-[#fbfaf5] md:relative md:h-full md:max-h-none md:w-[320px] md:border-l md:border-t-0 ${
        isExpanded
        ? 'fixed inset-x-0 bottom-0 z-40 h-[min(72dvh,28rem)] max-h-[72dvh] shadow-[0_-12px_40px_rgba(32,43,41,0.16)] md:inset-auto md:shadow-none'
          : 'relative h-[52px]'
      }`}
    >
      <header className="flex h-[52px] shrink-0 items-center justify-between gap-2 border-b border-[#d8d4c9] px-3 md:h-auto md:px-5 md:py-3.5">
        <div className="min-w-0 md:hidden">
          <p className="text-[13px] font-semibold text-[#202b29]">Challenge</p>
          <p className="truncate text-[11px] text-[#65706b]">Survive the spike</p>
        </div>
        <div className="hidden md:block">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#65706b]">
            Run inspector
          </p>
          <p className="mt-1 text-[12px] text-[#65706b]">
            Scenario <span className="font-mono text-[#202b29]">01</span>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span
            className={`rounded border px-2 py-1.5 text-[9px] font-semibold uppercase tracking-[0.08em] md:px-2.5 md:text-[10px] md:tracking-[0.1em] ${phaseColor}`}
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
            className="flex min-h-11 shrink-0 items-center gap-1 rounded-md border border-[#d8d4c9] px-2.5 text-[11px] font-semibold text-[#263a36] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#267a68] md:hidden"
          >
            {isExpanded ? 'Close' : 'Details'}
            <span aria-hidden="true">{isExpanded ? '−' : '+'}</span>
          </button>
        </div>
      </header>

      <section
        id="mobile-challenge-content"
        aria-labelledby="challenge-title"
        className={`min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overscroll-contain px-4 py-4 md:px-5 md:py-5 ${
          isExpanded ? 'flex' : 'hidden md:flex'
        }`}
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#267a68]">
          Traffic spike
        </p>
        <h2
          id="challenge-title"
          className="mt-2 text-[24px] font-semibold leading-[1.08] tracking-[-0.04em] text-[#202b29] text-balance"
        >
          Survive the spike
        </h2>
        <p className="mt-2.5 text-[13px] leading-relaxed text-[#65706b]">
          Prove the architecture can absorb a sudden 3× increase in demand.
        </p>

        {isSharedScenario && (
          <p className="mt-4 border-l-2 border-[#267a68] bg-[#267a68]/[0.06] px-3 py-2.5 text-[12px] leading-relaxed text-[#355c52]">
            Shared architecture loaded. Run it or make it your own.
          </p>
        )}

        {phase === 'ready' && (
          <button
            type="button"
            onClick={onStart}
            className="mt-5 flex min-h-11 w-full items-center justify-between rounded-md bg-[#263a36] px-4 py-3 text-left text-[13px] font-semibold text-white transition-colors hover:bg-[#1e302c] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#267a68]"
          >
            <span>Run {SPIKE_CHALLENGE_DURATION_MS / 1000}-second challenge</span>
            <span aria-hidden="true" className="text-sm">↗</span>
          </button>
        )}

        {phase === 'running' && (
          <div className="mt-5 border-l-2 border-[#267a68] bg-[#267a68]/[0.06] p-3.5" aria-live="polite">
            <div className="flex items-center justify-between gap-2 text-[12px]">
              <span className="flex items-center gap-2 font-semibold text-[#176454]">
                <span className="h-2 w-2 animate-pulse rounded-full bg-[#267a68]" />
                Traffic in progress
              </span>
              <span className="font-mono tabular-nums text-[#65706b]">
                {Math.min(
                  SPIKE_CHALLENGE_DURATION_MS / 1000,
                  Math.floor(elapsedMs / 1000)
                )}
                /{SPIKE_CHALLENGE_DURATION_MS / 1000}s
              </span>
            </div>
            <div
              className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#d8d4c9]"
              role="progressbar"
              aria-label="Challenge progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progress)}
            >
              <div
                className="sim-progress-fill h-full w-full origin-left rounded-full bg-[#267a68]"
                style={{ transform: `scaleX(${progress / 100})` }}
              />
            </div>
            <p className="mt-2.5 text-[12px] leading-relaxed text-[#65706b]">
              Watch the graph and telemetry. Pause or tune a component from the canvas.
            </p>
          </div>
        )}

        {phase === 'complete' && result && (
          <div
            className={`mt-5 border-l-2 p-3.5 ${
              result.passed
                ? 'border-[#267a68] bg-[#267a68]/[0.06]'
                : 'border-[#b63e35] bg-[#b63e35]/[0.06]'
            }`}
            aria-live="polite"
          >
            <p
              className={`text-[15px] font-semibold ${
                result.passed ? 'text-[#176454]' : 'text-[#9c3029]'
              }`}
            >
              {result.passed ? 'System survived' : 'Bottleneck found'}
            </p>
            <p className="mt-1.5 text-[12px] leading-relaxed text-[#4f5e57]">
              {result.passed
                ? 'The system stayed within both challenge targets.'
                : failureReasons.length > 0
                  ? failureReasons.join(' ')
                  : 'The system exceeded a challenge target. Adjust a component and retry.'}
            </p>
            {!result.passed && result.bottleneckName && (
              <p className="mt-3 border-t border-[#d8d4c9] pt-2.5 text-[12px] text-[#65706b]">
                Focused in canvas:{' '}
                <span className="font-semibold text-[#202b29]">{result.bottleneckName}</span>
              </p>
            )}
          </div>
        )}

        <div className="mt-6 grid grid-cols-[2fr_1fr] gap-3 border-y border-[#d8d4c9] py-3" aria-label="Traffic profile">
          <div className="px-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#65706b]">
                Steady
              </span>
              <span className="font-mono text-[10px] text-[#7c857e]">
                0–{SPIKE_WINDOW_START_MS / 1000}s
              </span>
            </div>
            <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-[#e3e0d6]">
              <div className="h-full w-2/3 rounded-full bg-[#89938b]" />
            </div>
          </div>
          <div className="border-l border-[#d8d4c9] pl-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#9a6a16]">
              Spike · 3×
            </div>
            <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-[#ead9b7]">
              <div className="h-full w-full rounded-full bg-[#b98025]" />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 border-b border-[#d8d4c9] py-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.08em] text-[#65706b]">Latency budget</p>
            <p className="mt-1 text-[13px] font-semibold text-[#202b29]">
              p95 ≤ {formatLatency(CHALLENGE_MAX_P95_MS)}
            </p>
          </div>
          <div className="border-l border-[#d8d4c9] pl-3">
            <p className="text-[11px] uppercase tracking-[0.08em] text-[#65706b]">Error budget</p>
            <p className="mt-1 text-[13px] font-semibold text-[#202b29]">
              ≤ {formatPercent(CHALLENGE_MAX_ERROR_RATE)}
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
            </div>

            {attempt > 1 && baseline && (
              <div className="mt-4 border-t border-[#d8d4c9] pt-3">
                <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-[#65706b]">
                  Attempt comparison
                </p>
                <p className="mt-2 text-[12px] tabular-nums text-[#4f5e57]">
                  p95 {formatLatency(baseline.p95Latency)} → {formatLatency(result.p95Latency)}
                  <span className="mx-1.5 text-[#9ca39b]">/</span>
                  errors {formatPercent(baseline.errorRate)} → {formatPercent(result.errorRate)}
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
                  className="min-h-11 rounded-md border border-[#9a6a16]/35 bg-[#9a6a16]/[0.07] px-2.5 py-2.5 text-[12px] font-semibold text-[#80540e] transition-colors hover:bg-[#9a6a16]/[0.12] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9a6a16]"
                >
                  Scale bottleneck
                </button>
              )}
              <button
                type="button"
                onClick={onStart}
                className="min-h-11 rounded-md bg-[#263a36] px-2.5 py-2.5 text-[12px] font-semibold text-white transition-colors hover:bg-[#1e302c] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#267a68]"
              >
                Run again
              </button>
            </div>

            <div className="mt-4 grid grid-cols-3 divide-x divide-[#d8d4c9] border-y border-[#d8d4c9]">
              <button
                type="button"
                onClick={onCopyLink}
                className="min-h-10 px-1 py-2 text-[11px] font-medium text-[#4f5e57] transition-colors hover:bg-[#efede4] focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-[#267a68]"
              >
                Copy link
              </button>
              <button
                type="button"
                onClick={onDownloadCard}
                className="min-h-10 px-1 py-2 text-[11px] font-medium text-[#4f5e57] transition-colors hover:bg-[#efede4] focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-[#267a68]"
              >
                Download card
              </button>
              {xShareHref ? (
                <a
                  href={xShareHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-10 px-1 py-2 text-center text-[11px] font-semibold text-[#176454] transition-colors hover:bg-[#efede4] focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-[#267a68]"
                >
                  Share on X
                </a>
              ) : (
                <span className="px-1 py-2 text-center text-[11px] text-[#899089]">
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
            className="mt-2 min-h-10 w-full rounded-md px-3 py-2 text-[12px] font-medium text-[#65706b] transition-colors hover:bg-[#efede4] hover:text-[#202b29] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#267a68]"
          >
            Copy challenge link
          </button>
        )}

        {shareNotice && (
          <p className="mt-3 text-center text-[12px] text-[#176454]" aria-live="polite">
            {shareNotice}
          </p>
        )}
      </section>
    </aside>
  );
}
