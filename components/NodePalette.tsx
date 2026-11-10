'use client';

import { useReactFlow } from '@xyflow/react';
import { COMPONENT_META, useSimulationStore } from '@/lib/store';
import type { ComponentType } from '@/types';

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
    <aside className="sim-sidebar-enter z-20 flex h-[104px] w-full shrink-0 flex-col border-b border-[#D8D4C9] bg-[#F4F1E8] text-[#202B29] md:h-full md:max-h-none md:w-[236px] md:border-b-0 md:border-r">
      <header className="flex h-[43px] shrink-0 items-center justify-between border-b border-[#D8D4C9] px-3.5 md:h-auto md:px-5 md:py-4">
        <div className="min-w-0">
          <p className="hidden font-mono text-[11px] uppercase tracking-[0.12em] text-[#65706B] md:block">
            Systems / 01
          </p>
          <h1 className="text-[15px] font-semibold tracking-tight text-[#202B29]">
            System Simulator
          </h1>
          <p className="hidden text-[13px] text-[#65706B] md:block">
            Architecture workbench
          </p>
        </div>
        <span className="shrink-0 border border-[#D8D4C9] px-2 py-1 font-mono text-[11px] uppercase tracking-wider text-[#65706B]">
          Draft
        </span>
      </header>

      <div className="h-[60px] shrink-0 px-2 py-1 md:h-auto md:min-h-0 md:flex-1 md:overflow-x-hidden md:overflow-y-auto md:px-4 md:py-5">
        <div className="mb-2 hidden items-center justify-between px-1 md:flex md:mb-3">
          <h2 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#202B29]">
            Component index
          </h2>
          <span className="text-[11px] text-[#65706B]">Drag or select</span>
        </div>

        <div className="grid h-full min-w-0 grid-cols-5 gap-1 md:h-auto md:grid-cols-1 md:gap-0">
          {TYPES.map((type, index) => {
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
                className="group flex h-full min-h-0 min-w-0 cursor-grab flex-col items-center justify-center gap-0.5 border-b border-l-[3px] border-[#D8D4C9] px-0.5 text-center transition-colors hover:bg-[#FBFAF5] active:cursor-grabbing focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#267A68] md:h-auto md:min-h-[68px] md:flex-row md:justify-start md:gap-3 md:px-3 md:py-3 md:text-left"
                style={{ borderLeftColor: meta.color }}
              >
                <span
                  className="flex shrink-0 items-center justify-center gap-1.5 md:w-9 md:justify-start"
                  aria-hidden="true"
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full md:h-2 md:w-2"
                    style={{ backgroundColor: meta.color }}
                  />
                  <span className="hidden font-mono text-[11px] tabular-nums text-[#65706B] md:inline">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                </span>
                <span className="min-w-0 w-full md:flex-1">
                  <span className="block whitespace-normal break-words text-[9px] font-medium leading-[1.1] text-[#202B29] md:truncate md:text-[13px] md:leading-normal">
                    {meta.label}
                  </span>
                  <span className="hidden truncate text-[13px] text-[#65706B] md:block">
                    {meta.description}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-7 hidden border-t border-[#D8D4C9] pt-4 md:block">
          <p className="text-[13px] font-semibold text-[#202B29]">
            Build the request path
          </p>
          <ol className="mt-3 space-y-2 text-[13px] leading-relaxed text-[#65706B]">
            <li className="flex gap-2">
              <span className="font-mono text-[11px] text-[#65706B]">01</span>
              Drag components onto the canvas.
            </li>
            <li className="flex gap-2">
              <span className="font-mono text-[11px] text-[#65706B]">02</span>
              Connect outputs to inputs.
            </li>
            <li className="flex gap-2">
              <span className="font-mono text-[11px] text-[#65706B]">03</span>
              Tune capacity and run a spike.
            </li>
          </ol>
          <p className="mt-3 border-t border-[#D8D4C9] pt-3 text-[13px] leading-relaxed text-[#65706B]">
            Queues grow above 70% utilization. When demand exceeds capacity, latency rises fast.
          </p>
        </div>
      </div>

      <footer className="hidden items-center justify-between border-t border-[#D8D4C9] px-5 py-3 text-[12px] text-[#65706B] md:flex">
        <span>Nodes on canvas</span>
        <span className="font-mono tabular-nums text-[#202B29]">
          {String(nodeCount).padStart(2, '0')}
        </span>
      </footer>
    </aside>
  );
}

export { DRAG_MIME };
