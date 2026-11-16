'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';

export interface PaletteCommand {
  id: string;
  label: string;
  hint?: string;
  group: string;
  keywords?: string;
  disabled?: boolean;
  run: () => void;
}

export interface CommandPaletteProps {
  open: boolean;
  commands: PaletteCommand[];
  onClose: () => void;
}

export default function CommandPalette({
  open,
  commands,
  onClose,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return commands;
    return commands.filter((command) =>
      `${command.label} ${command.group} ${command.keywords ?? ''}`
        .toLowerCase()
        .includes(needle)
    );
  }, [commands, query]);

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  if (!open) return null;

  const runCommand = (command: PaletteCommand | undefined) => {
    if (!command || command.disabled) return;
    onClose();
    command.run();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-ink/30 px-3 pt-[12vh] backdrop-blur-[1px]"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="w-full max-w-[520px] overflow-hidden border border-rule-strong bg-surface shadow-[6px_6px_0_rgba(21,34,44,0.14)]"
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            onClose();
          } else if (event.key === 'ArrowDown') {
            event.preventDefault();
            setActiveIndex((index) =>
              filtered.length === 0 ? 0 : (index + 1) % filtered.length
            );
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActiveIndex((index) =>
              filtered.length === 0
                ? 0
                : (index - 1 + filtered.length) % filtered.length
            );
          } else if (event.key === 'Enter') {
            event.preventDefault();
            runCommand(filtered[activeIndex]);
          }
        }}
      >
        <div className="flex items-center gap-2 border-b border-rule px-3 py-2">
          <span aria-hidden="true" className="font-mono text-[10px] text-faint">
            &gt;
          </span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            placeholder="Run a command…"
            aria-controls={listId}
            aria-activedescendant={
              filtered[activeIndex] ? `cmd-${filtered[activeIndex].id}` : undefined
            }
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            className="min-h-8 w-full bg-transparent text-[13px] text-ink outline-none placeholder:text-faint"
          />
          <kbd className="shrink-0 rounded-[2px] border border-rule bg-paper px-1.5 py-0.5 font-mono text-[9px] text-muted">
            esc
          </kbd>
        </div>

        <ul
          id={listId}
          role="listbox"
          aria-label="Commands"
          className="max-h-[min(52dvh,420px)] overflow-y-auto overscroll-contain py-1"
        >
          {filtered.length === 0 ? (
            <li className="px-3 py-6 text-center text-[12px] text-muted">
              No matching commands.
            </li>
          ) : (
            filtered.map((command, index) => (
              <li
                key={command.id}
                id={`cmd-${command.id}`}
                role="option"
                aria-selected={index === activeIndex}
              >
                <button
                  type="button"
                  disabled={command.disabled}
                  onPointerMove={() => setActiveIndex(index)}
                  onClick={() => runCommand(command)}
                  className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                    index === activeIndex ? 'bg-live/[0.07]' : 'hover:bg-paper'
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[12px] font-medium text-ink">
                      {command.label}
                    </span>
                    <span className="block truncate text-[9px] uppercase tracking-[0.06em] text-faint">
                      {command.group}
                    </span>
                  </span>
                  {command.hint ? (
                    <span className="shrink-0 font-mono text-[9px] text-muted">
                      {command.hint}
                    </span>
                  ) : null}
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
