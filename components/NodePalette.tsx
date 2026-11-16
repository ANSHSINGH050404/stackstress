'use client';

import { useReactFlow } from '@xyflow/react';
import { COMPONENT_META, useSimulationStore } from '@/lib/store';
import type { ComponentType } from '@/types';
import ComponentIcon from './nodes/ComponentIcon';

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
    <aside className="z-20 flex h-full w-full shrink-0 flex-col border-b border-rule bg-paper text-ink lg:col-start-1 lg:row-span-2 lg:border-b-0 lg:border-r xl:row-span-1">
      <header className="flex h-[44px] shrink-0 items-center justify-between border-b border-rule px-3.5 lg:h-auto lg:px-5 lg:py-5">
        <div className="min-w-0">
          <h1 className="text-[15px] font-semibold tracking-tight text-ink">
            StackStress
          </h1>
          <p className="hidden text-[12px] text-muted lg:block">
            Architecture workbench
          </p>
        </div>
        <span className="sim-designator hidden lg:inline-flex">SS</span>
      </header>

      <div className="h-[60px] shrink-0 px-2 py-1 lg:h-auto lg:min-h-0 lg:flex-1 lg:overflow-x-hidden lg:overflow-y-auto lg:px-4 lg:py-5">
        <div className="mb-2 hidden items-baseline justify-between px-1 lg:mb-3 lg:flex">
          <h2 className="text-[12px] font-medium text-ink">Components</h2>
          <span className="text-[11px] text-muted">Drag to place</span>
        </div>

        <div className="grid h-full min-w-0 grid-cols-5 gap-1 lg:h-auto lg:grid-cols-1 lg:gap-0">
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
                className="group flex h-full min-h-0 min-w-0 cursor-grab flex-col items-center justify-center gap-1 rounded-[2px] border-b border-rule px-0.5 text-center transition-colors hover:bg-surface active:cursor-grabbing focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live lg:h-auto lg:min-h-[62px] lg:flex-row lg:justify-start lg:gap-3 lg:px-2 lg:py-2.5 lg:text-left"
              >
                <span
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-[2px] border bg-surface"
                  style={{ borderColor: `${meta.color}66`, color: meta.color }}
                  aria-hidden="true"
                >
                  <ComponentIcon type={type} size={17} />
                </span>
                <span className="min-w-0 w-full lg:flex-1">
                  <span className="block whitespace-normal break-words text-[9px] font-medium leading-[1.1] text-ink lg:truncate lg:text-[12.5px] lg:leading-normal">
                    {meta.label}
                  </span>
                  <span className="hidden truncate text-[11.5px] text-muted lg:block">
                    {meta.description}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-6 hidden border-t border-rule pt-4 lg:block">
          <p className="text-[12px] font-medium text-ink">Build the request path</p>
          <ol className="mt-2.5 space-y-2 text-[12px] leading-relaxed text-muted">
            <li className="flex gap-2.5">
              <span className="font-mono text-[10px] leading-5 text-faint">1</span>
              Drag components onto the canvas.
            </li>
            <li className="flex gap-2.5">
              <span className="font-mono text-[10px] leading-5 text-faint">2</span>
              Connect outputs to inputs.
            </li>
            <li className="flex gap-2.5">
              <span className="font-mono text-[10px] leading-5 text-faint">3</span>
              Tune capacity and run a spike.
            </li>
          </ol>
          <p className="mt-3 border-t border-rule pt-3 text-[12px] leading-relaxed text-muted">
            Queues grow above 70% utilization. When demand exceeds capacity, latency
            rises fast.
          </p>
        </div>
      </div>

      <footer className="hidden items-center justify-between border-t border-rule px-5 py-3 text-[11px] text-muted lg:flex">
        <span>Nodes on canvas</span>
        <span className="font-mono tabular-nums text-ink">
          {String(nodeCount).padStart(2, '0')}
        </span>
      </footer>
    </aside>
  );
}

export { DRAG_MIME };
