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
    <div className="border-t border-rule pt-2.5">
      <div className="text-[11px] text-muted">{label}</div>
      <div className="mt-1 font-mono text-[16px] font-semibold tabular-nums tracking-tight text-ink">
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
        result.p95Latency > CHALLENGE_MAX_P95_MS
          ? `p95 ${formatLatency(result.p95Latency)} exceeded ${formatLatency(CHALLENGE_MAX_P95_MS)}.`
          : null,
        result.errorRate > CHALLENGE_MAX_ERROR_RATE
          ? `Errors ${formatPercent(result.errorRate)} exceeded the ${formatPercent(CHALLENGE_MAX_ERROR_RATE)} budget.`
          : null,
      ].filter((reason): reason is string => reason !== null)
    : [];
  const challengeSeconds = SPIKE_CHALLENGE_DURATION_MS / 1000;

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
          <p className="text-[13px] font-semibold text-ink">Spike absorption</p>
          <p className="truncate font-mono text-[10px] text-muted">TEST 01</p>
        </div>
        <div className="hidden xl:block">
          <p className="font-mono text-[10px] tracking-[0.04em] text-muted">
            TEST 01
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
          Spike absorption
        </h2>
        <p className="mt-2.5 text-[12.5px] leading-relaxed text-muted">
          Prove the architecture can absorb a sudden 3× increase in demand.
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
                {Math.min(
                  challengeSeconds,
                  Math.floor(elapsedMs / 1000)
                )}
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
              Watch the graph and telemetry. Pause or tune a component from the canvas.
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
                ? 'The system stayed within both challenge targets.'
                : failureReasons.length > 0
                  ? failureReasons.join(' ')
                  : 'The system exceeded a challenge target. Adjust a component and retry.'}
            </p>
            {!result.passed && result.bottleneckName && (
              <p className="mt-3 border-t border-rule pt-2.5 text-[12px] text-muted">
                Focused in canvas:{' '}
                <span className="font-semibold text-ink">{result.bottleneckName}</span>
              </p>
            )}
          </div>
        )}

        <div className="mt-6 grid grid-cols-[2fr_1fr] gap-3 border-y border-rule py-3" aria-label="Traffic profile">
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
              p95 ≤ {formatLatency(CHALLENGE_MAX_P95_MS)}
            </p>
          </div>
          <div className="border-l border-rule pl-3">
            <p className="text-[11px] text-muted">Error budget</p>
            <p className="mt-1 font-mono text-[13px] font-semibold text-ink">
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
              <div className="mt-4 border-t border-rule pt-3">
                <p className="text-[11px] text-muted">Attempt comparison</p>
                <p className="mt-2 font-mono text-[12px] tabular-nums text-ink">
                  p95 {formatLatency(baseline.p95Latency)} → {formatLatency(result.p95Latency)}
                  <span className="mx-1.5 text-faint">/</span>
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
