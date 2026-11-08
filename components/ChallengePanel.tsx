'use client';

import { formatLatency, formatPercent, formatRate } from '@/lib/format';
import {
  SPIKE_CHALLENGE_DURATION_MS,
  type ChallengePhase,
  type ChallengeResult,
} from '@/lib/challenges';

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
    <div className="rounded-lg border border-slate-800/80 bg-slate-950/50 px-2.5 py-2">
      <div className="text-[9px] font-medium uppercase tracking-wider text-slate-500">
        {label}
      </div>
      <div className="mt-0.5 text-xs font-semibold tabular-nums text-slate-100">
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
  const progress = Math.min(100, (elapsedMs / SPIKE_CHALLENGE_DURATION_MS) * 100);

  return (
    <section
      aria-labelledby="challenge-title"
      className="mx-3 mb-4 rounded-xl border border-sky-400/20 bg-gradient-to-br from-sky-400/[0.09] via-slate-900/80 to-slate-950/90 p-3 shadow-lg shadow-black/20"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-sky-300">
          System design challenge
        </p>
        <span className="rounded-full border border-slate-700/80 px-1.5 py-0.5 text-[9px] font-semibold tracking-wider text-slate-400">
          3× LOAD
        </span>
      </div>
      <h2 id="challenge-title" className="mt-1.5 text-[15px] font-semibold tracking-tight text-white">
        Survive the spike
      </h2>
      <p className="mt-1 text-[10px] leading-relaxed text-slate-400">
        Six seconds steady, then 3× traffic for three seconds. Keep p95 under 800 ms and errors below 5%.
      </p>
      {isSharedScenario && (
        <p className="mt-2 rounded-md bg-sky-400/10 px-2 py-1 text-[10px] text-sky-200">
          Shared architecture loaded. Run it or make it your own.
        </p>
      )}

      {phase === 'ready' && (
        <button
          type="button"
          onClick={onStart}
          className="mt-3 w-full rounded-lg bg-sky-400 px-3 py-2 text-[11px] font-bold text-slate-950 transition-colors hover:bg-sky-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300"
        >
          Start 9-second challenge
        </button>
      )}

      {phase === 'running' && (
        <div className="mt-3" aria-live="polite">
          <div className="flex items-center justify-between text-[10px]">
            <span className="font-medium text-emerald-300">Traffic is running</span>
            <span className="tabular-nums text-slate-400">
              {Math.min(9, Math.floor(elapsedMs / 1000))} / 9s
            </span>
          </div>
          <div
            className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-800"
            role="progressbar"
            aria-label="Challenge progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress)}
          >
            <div
              className="sim-progress-fill h-full w-full origin-left rounded-full bg-sky-400"
              style={{ transform: `scaleX(${progress / 100})` }}
            />
          </div>
          <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
            Watch the queues and p95 latency. You can pause, tune a component, then resume.
          </p>
        </div>
      )}

      {phase === 'complete' && result && (
        <div className="mt-3" aria-live="polite">
          <div
            className={`rounded-lg border px-2.5 py-2 ${
              result.passed
                ? 'border-emerald-400/20 bg-emerald-400/[0.08]'
                : 'border-rose-400/20 bg-rose-400/[0.08]'
            }`}
          >
            <p
              className={`text-[11px] font-semibold ${
                result.passed ? 'text-emerald-300' : 'text-rose-300'
              }`}
            >
              {result.passed ? 'System survived' : 'Bottleneck found'}
            </p>
            <p className="mt-0.5 text-[10px] leading-relaxed text-slate-400">
              {result.passed
                ? 'The system stayed within both challenge targets.'
                : result.bottleneckName
                  ? result.canScaleBottleneck
                    ? `${result.bottleneckName} struggled under the spike. Scale it and try again.`
                    : `${result.bottleneckName} struggled. Check its health and failure settings.`
                  : result.generatedRps <= 0 || result.completedRps <= 0
                    ? 'No requests completed. Check the connections and retry.'
                    : 'The system exceeded a challenge target. Adjust a component and retry.'}
            </p>
          </div>

          <div
            className={`mt-2 grid gap-1.5 ${
              result.passed ? 'grid-cols-1' : 'grid-cols-2'
            }`}
          >
            <Metric label="p95 latency" value={formatLatency(result.p95Latency)} />
            <Metric label="Error rate" value={formatPercent(result.errorRate)} />
            <Metric label="Completed" value={`${formatRate(result.completedRps)}/s`} />
            <Metric label="Dropped" value={Math.round(result.dropped).toLocaleString()} />
          </div>

          {attempt > 1 && baseline && (
            <div className="mt-2 rounded-lg border border-slate-800 bg-slate-950/40 px-2.5 py-2">
              <p className="text-[9px] font-medium uppercase tracking-wider text-slate-500">
                Before → after
              </p>
              <p className="mt-1 text-[10px] text-slate-300">
                p95 {formatLatency(baseline.p95Latency)} → {formatLatency(result.p95Latency)}
                <span className="mx-1.5 text-slate-700">/</span>
                errors {formatPercent(baseline.errorRate)} → {formatPercent(result.errorRate)}
              </p>
            </div>
          )}

          <div className="mt-2 grid grid-cols-2 gap-1.5">
            {!result.passed && result.bottleneckId && result.canScaleBottleneck && (
              <button
                type="button"
                onClick={onScaleBottleneck}
                className="rounded-lg border border-amber-400/20 bg-amber-400/10 px-2 py-2 text-[10px] font-semibold text-amber-200 transition-colors hover:bg-amber-400/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300"
              >
                Scale bottleneck
              </button>
            )}
            <button
              type="button"
              onClick={onStart}
              className="rounded-lg border border-slate-700 bg-slate-800/70 px-2 py-2 text-[10px] font-semibold text-slate-100 transition-colors hover:bg-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300"
            >
              Run again
            </button>
          </div>

          <div className="mt-2 grid grid-cols-3 gap-1.5">
            <button
              type="button"
              onClick={onCopyLink}
              className="rounded-md px-1 py-1.5 text-[9px] font-medium text-slate-300 transition-colors hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300"
            >
              Copy link
            </button>
            <button
              type="button"
              onClick={onDownloadCard}
              className="rounded-md px-1 py-1.5 text-[9px] font-medium text-slate-300 transition-colors hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300"
            >
              Download card
            </button>
            {xShareHref ? (
              <a
                href={xShareHref}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-md px-1 py-1.5 text-center text-[9px] font-semibold text-sky-300 transition-colors hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300"
              >
                Share on X
              </a>
            ) : (
              <span className="py-1.5 text-center text-[9px] text-slate-600">
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
          className="mt-1 w-full rounded-md px-2 py-1.5 text-[10px] font-medium text-slate-400 transition-colors hover:bg-slate-800/70 hover:text-slate-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300"
        >
          Copy challenge link
        </button>
      )}

      {shareNotice && (
        <p className="mt-1 text-center text-[10px] text-sky-200" aria-live="polite">
          {shareNotice}
        </p>
      )}
    </section>
  );
}
