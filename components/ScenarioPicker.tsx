'use client';

import { useEffect, useRef, useState } from 'react';
import { CHAOS_SCENARIOS, TEMPLATE_SCENARIOS, type ScenarioDefinition } from '@/lib/scenarios';
import type { DailyChallenge } from '@/lib/daily';

export interface ScenarioPickerProps {
  activeId: string | null;
  daily: DailyChallenge | null;
  onSelect: (scenario: ScenarioDefinition) => void;
  onDaily: () => void;
}

function ScenarioRow({
  scenario,
  active,
  onSelect,
}: {
  scenario: ScenarioDefinition;
  active: boolean;
  onSelect: () => void;
}) {
  const chaos = scenario.kind === 'chaos';
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`group flex w-full items-start gap-2.5 border-l-2 px-3 py-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-live ${
        active
          ? 'border-live bg-live/[0.06]'
          : chaos
            ? 'border-alarm/40 hover:bg-alarm/[0.04]'
            : 'border-transparent hover:bg-paper'
      }`}
    >
      <span className="mt-0.5 shrink-0 font-mono text-[8px] uppercase tracking-[0.06em] text-faint">
        {scenario.tag}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-[12px] font-semibold text-ink">
            {scenario.name}
          </span>
          {active ? (
            <span className="shrink-0 rounded-[2px] bg-live/10 px-1 py-0.5 font-mono text-[8px] uppercase tracking-[0.06em] text-live-ink">
              loaded
            </span>
          ) : null}
        </span>
        <span className="mt-0.5 block text-[10.5px] leading-snug text-muted">
          {scenario.description}
        </span>
      </span>
    </button>
  );
}

export default function ScenarioPicker({
  activeId,
  daily,
  onSelect,
  onDaily,
}: ScenarioPickerProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className="relative shrink-0" ref={wrapperRef}>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="sim-control-button flex items-center gap-1.5 whitespace-nowrap rounded-[3px] border border-rule bg-surface px-2.5 text-[11px] font-medium text-ink transition-colors hover:bg-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live"
      >
        Scenarios
        <span aria-hidden="true" className="text-[8px] text-muted">
          ▾
        </span>
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Scenario library"
          className="absolute left-0 top-[calc(100%+6px)] z-40 flex max-h-[min(70dvh,560px)] w-[340px] max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden border border-rule-strong bg-surface shadow-[4px_4px_0_rgba(21,34,44,0.1)]"
        >
          <div className="shrink-0 border-b border-rule bg-paper px-3 py-2">
            <p className="font-mono text-[9px] uppercase tracking-[0.08em] text-muted">
              Scenario library
            </p>
            <p className="mt-0.5 text-[10.5px] text-muted">
              Replaces the canvas and resets the run.
            </p>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {daily ? (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onDaily();
                }}
                className="flex w-full items-start justify-between gap-2 border-b border-rule bg-[#f3f7f9] px-3 py-2.5 text-left transition-colors hover:bg-live/[0.06] focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-live"
              >
                <span className="min-w-0">
                  <span className="block text-[12px] font-semibold text-live-ink">
                    {daily.label}
                  </span>
                  <span className="mt-0.5 block text-[10.5px] leading-snug text-muted">
                    Same seed for everyone. Fixed 3× spike, three-tier stack.
                  </span>
                </span>
                <span className="shrink-0 font-mono text-[9px] text-faint">
                  {daily.dateKey}
                </span>
              </button>
            ) : (
              <div className="border-b border-rule bg-[#f3f7f9] px-3 py-2.5 text-[11px] text-muted">
                Loading the daily challenge…
              </div>
            )}

            <p className="border-b border-rule bg-paper px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.08em] text-muted">
              Templates
            </p>
            {TEMPLATE_SCENARIOS.map((scenario) => (
              <ScenarioRow
                key={scenario.id}
                scenario={scenario}
                active={activeId === scenario.id}
                onSelect={() => {
                  setOpen(false);
                  onSelect(scenario);
                }}
              />
            ))}

            <p className="border-y border-rule bg-paper px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.08em] text-alarm-ink">
              Chaos recipes
            </p>
            {CHAOS_SCENARIOS.map((scenario) => (
              <ScenarioRow
                key={scenario.id}
                scenario={scenario}
                active={activeId === scenario.id}
                onSelect={() => {
                  setOpen(false);
                  onSelect(scenario);
                }}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
