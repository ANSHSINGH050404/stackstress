'use client';

import { useMemo, useState } from 'react';
import { useReactFlow } from '@xyflow/react';
import { analyzeGraph } from '@/lib/graph-health';
import { useSimulationStore } from '@/lib/store';

export default function GraphHealth() {
  const nodes = useSimulationStore((state) => state.nodes);
  const edges = useSimulationStore((state) => state.edges);
  const selectNode = useSimulationStore((state) => state.selectNode);
  const { fitView } = useReactFlow();
  const [open, setOpen] = useState(false);

  const issues = useMemo(() => analyzeGraph(nodes, edges), [nodes, edges]);
  const empty = issues.some((issue) => issue.kind === 'empty');

  if (empty) {
    return (
      <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center px-4">
        <div className="pointer-events-auto max-w-[340px] border border-rule-strong bg-surface p-5 text-center shadow-[4px_4px_0_rgba(21,34,44,0.08)]">
          <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-muted">
            Empty sheet
          </p>
          <p className="mt-2 text-[15px] font-semibold text-ink">
            Start with a scenario
          </p>
          <p className="mt-1.5 text-[12px] leading-relaxed text-muted">
            Pick a template from the toolbar, or drag a traffic generator from
            the component palette.
          </p>
        </div>
      </div>
    );
  }

  if (issues.length === 0) {
    return (
      <div className="pointer-events-none absolute left-3 top-3 z-10 hidden items-center gap-1.5 border border-rule bg-surface/95 px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.06em] text-live-ink lg:flex">
        <span className="h-1.5 w-1.5 rounded-[1px] bg-live" aria-hidden="true" />
        Graph connected
      </div>
    );
  }

  return (
    <div className="absolute left-3 top-3 z-10 w-[min(300px,calc(100%-1.5rem))] border border-warning/40 bg-surface/97 shadow-[2px_2px_0_rgba(21,34,44,0.06)]">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-live"
      >
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-[1px] bg-warning"
          aria-hidden="true"
        />
        <span className="min-w-0 flex-1 truncate font-mono text-[9px] uppercase tracking-[0.06em] text-warning-ink">
          {issues.length} {issues.length === 1 ? 'warning' : 'warnings'} ·{' '}
          {issues[0].message}
        </span>
        <span aria-hidden="true" className="shrink-0 text-[9px] text-muted">
          {open ? '−' : '+'}
        </span>
      </button>
      {open ? (
        <ul className="border-t border-warning/25">
          {issues.map((issue) => (
            <li key={issue.id} className="border-b border-rule last:border-b-0">
              {issue.nodeIds.length > 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    selectNode(issue.nodeIds[0] ?? null);
                    void fitView({
                      nodes: issue.nodeIds.map((id) => ({ id })),
                      padding: 0.7,
                      maxZoom: 1,
                      duration: 450,
                    });
                  }}
                  className="flex w-full items-center justify-between gap-3 px-2.5 py-2 text-left transition-colors hover:bg-paper focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-live"
                >
                  <span className="text-[11px] text-ink">{issue.message}</span>
                  <span className="shrink-0 font-mono text-[9px] text-faint">
                    show
                  </span>
                </button>
              ) : (
                <div className="px-2.5 py-2 text-[11px] text-ink">
                  {issue.message}
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
