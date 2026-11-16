import type { XYPosition } from '@xyflow/react';
import type { SimNode } from './store';
import type { Edge } from '@xyflow/react';

const X_GAP = 280;
const Y_GAP = 210;
const ORIGIN_X = 60;
const CENTER_Y = 320;

/**
 * Simple layered layout. No dependency, deterministic, and good enough for
 * the topologies this simulator uses.
 */
export function tidyPositions(
  nodes: SimNode[],
  edges: Edge[]
): Record<string, XYPosition> {
  if (nodes.length === 0) return {};

  const ids = new Set(nodes.map((node) => node.id));
  const incoming = new Map<string, number>();
  const outgoing = new Map<string, string[]>();
  for (const node of nodes) {
    incoming.set(node.id, 0);
    outgoing.set(node.id, []);
  }
  for (const edge of edges) {
    if (!ids.has(edge.source) || !ids.has(edge.target)) continue;
    incoming.set(edge.target, (incoming.get(edge.target) ?? 0) + 1);
    outgoing.get(edge.source)?.push(edge.target);
  }

  const levelById = new Map<string, number>();
  const roots = nodes
    .filter((node) => (incoming.get(node.id) ?? 0) === 0)
    .map((node) => node.id);
  const queue = roots.length > 0 ? [...roots] : [nodes[0].id];
  for (const id of queue) levelById.set(id, 0);

  for (let index = 0; index < queue.length; index += 1) {
    const id = queue[index];
    const level = levelById.get(id) ?? 0;
    for (const target of outgoing.get(id) ?? []) {
      if (levelById.has(target)) continue;
      levelById.set(target, level + 1);
      queue.push(target);
    }
  }

  let fallbackLevel = 0;
  for (const node of nodes) {
    if (levelById.has(node.id)) continue;
    levelById.set(node.id, fallbackLevel);
    fallbackLevel += 1;
  }

  const groups = new Map<number, string[]>();
  for (const node of nodes) {
    const level = levelById.get(node.id) ?? 0;
    const group = groups.get(level) ?? [];
    group.push(node.id);
    groups.set(level, group);
  }

  const positions: Record<string, XYPosition> = {};
  for (const [level, group] of groups) {
    group.forEach((id, index) => {
      positions[id] = {
        x: ORIGIN_X + level * X_GAP,
        y: CENTER_Y - ((group.length - 1) * Y_GAP) / 2 + index * Y_GAP,
      };
    });
  }

  return positions;
}
