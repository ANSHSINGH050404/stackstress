'use client';

import { useReactFlow } from '@xyflow/react';
import { COMPONENT_META, useSimulationStore } from '@/lib/store';
import { ComponentType } from '@/types';

const TYPES: ComponentType[] = [
  'traffic-generator',
  'load-balancer',
  'service',
  'cache',
  'database',
];

const DRAG_MIME = 'application/x-sim-node';

export default function NodePalette() {
  const addNode = useSimulationStore((state) => state.addNode);
  const nodeCount = useSimulationStore((state) => state.nodes.length);
  const { screenToFlowPosition } = useReactFlow();

  const addAtCenter = (type: ComponentType) => {
    const offset = (nodeCount % 5) * 36;
    addNode(
      type,
      screenToFlowPosition({
        x: window.innerWidth / 2 + offset,
        y: window.innerHeight / 2 - 80 + offset,
      })
    );
  };

  return (
    <aside className="z-20 flex w-60 shrink-0 flex-col border-r border-slate-800/80 bg-[#0a111a]">
      <div className="border-b border-slate-800/80 px-4 py-4">
        <h1 className="text-sm font-semibold tracking-tight text-slate-100">
          System Simulator
        </h1>
        <p className="mt-0.5 text-[11px] text-slate-500">
          Draw an architecture, then run traffic through it.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        <p className="px-1 pb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          Components
        </p>
        <div className="flex flex-col gap-2">
          {TYPES.map((type) => {
            const meta = COMPONENT_META[type];
            return (
              <button
                key={type}
                type="button"
                draggable
                aria-label={`Add ${meta.label} node to canvas`}
                onDragStart={(event) => {
                  event.dataTransfer.setData(DRAG_MIME, type);
                  event.dataTransfer.effectAllowed = 'move';
                }}
                onClick={() => addAtCenter(type)}
                className="group flex cursor-grab items-center gap-3 rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2.5 text-left transition-colors hover:border-slate-600 hover:bg-slate-900 active:cursor-grabbing"
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: meta.color, boxShadow: `0 0 8px ${meta.color}66` }}
                />
                <span className="min-w-0">
                  <span className="block text-[12px] font-medium text-slate-200">
                    {meta.label}
                  </span>
                  <span className="block truncate text-[10px] text-slate-500">
                    {meta.description}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        <p className="px-1 pt-4 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          How it works
        </p>
        <ol className="mt-2 space-y-1.5 px-1 text-[10px] leading-relaxed text-slate-500">
          <li>1. Drag components onto the canvas.</li>
          <li>2. Connect outputs to inputs.</li>
          <li>3. Watch queues, p95 latency, and errors react.</li>
        </ol>

        <div className="mt-4 rounded-lg border border-sky-500/20 bg-sky-500/5 p-2.5">
          <p className="text-[10px] leading-relaxed text-sky-200/70">
            Tip: push a node past ~70% utilization and its queue starts growing.
            When demand passes capacity, p95 latency explodes.
          </p>
        </div>
      </div>

      <div className="border-t border-slate-800/80 px-4 py-2.5 text-[10px] text-slate-600">
        {nodeCount} {nodeCount === 1 ? 'component' : 'components'} on canvas
      </div>
    </aside>
  );
}

export { DRAG_MIME };
