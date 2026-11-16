import type { Edge } from '@xyflow/react';
import type { SimNode } from './store';

export type GraphIssueKind =
  | 'empty'
  | 'no-generator'
  | 'orphan'
  | 'zero-capacity'
  | 'cycle';

export interface GraphIssue {
  id: string;
  kind: GraphIssueKind;
  message: string;
  nodeIds: string[];
}

export function analyzeGraph(nodes: SimNode[], edges: Edge[]): GraphIssue[] {
  if (nodes.length === 0) {
    return [
      {
        id: 'empty',
        kind: 'empty',
        message: 'Canvas is empty',
        nodeIds: [],
      },
    ];
  }

  const issues: GraphIssue[] = [];
  const ids = new Set(nodes.map((node) => node.id));
  const connected = new Set<string>();
  for (const edge of edges) {
    if (!ids.has(edge.source) || !ids.has(edge.target)) continue;
    connected.add(edge.source);
    connected.add(edge.target);
  }

  const hasGenerator = nodes.some(
    (node) => node.data.component.type === 'traffic-generator'
  );
  if (!hasGenerator) {
    issues.push({
      id: 'no-generator',
      kind: 'no-generator',
      message: 'No traffic generator',
      nodeIds: [],
    });
  }

  const orphans = nodes
    .filter((node) => !connected.has(node.id))
    .map((node) => node.id);
  if (orphans.length > 0) {
    issues.push({
      id: 'orphans',
      kind: 'orphan',
      message: `${orphans.length} disconnected ${orphans.length === 1 ? 'node' : 'nodes'}`,
      nodeIds: orphans,
    });
  }

  const zeroCapacity = nodes
    .filter(
      (node) =>
        node.data.component.type !== 'traffic-generator' &&
        node.data.component.throughputLimit <= 0
    )
    .map((node) => node.id);
  if (zeroCapacity.length > 0) {
    issues.push({
      id: 'zero-capacity',
      kind: 'zero-capacity',
      message: `${zeroCapacity.length} ${zeroCapacity.length === 1 ? 'node has' : 'nodes have'} zero capacity`,
      nodeIds: zeroCapacity,
    });
  }

  const indegree = new Map<string, number>();
  const outgoing = new Map<string, string[]>();
  for (const node of nodes) {
    indegree.set(node.id, 0);
    outgoing.set(node.id, []);
  }
  for (const edge of edges) {
    if (!ids.has(edge.source) || !ids.has(edge.target)) continue;
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
    outgoing.get(edge.source)?.push(edge.target);
  }
  const queue = nodes
    .filter((node) => (indegree.get(node.id) ?? 0) === 0)
    .map((node) => node.id);
  const visited = new Set(queue);
  for (let index = 0; index < queue.length; index += 1) {
    for (const target of outgoing.get(queue[index]) ?? []) {
      if (visited.has(target)) continue;
      const next = (indegree.get(target) ?? 0) - 1;
      indegree.set(target, next);
      if (next === 0) {
        visited.add(target);
        queue.push(target);
      }
    }
  }
  const cycleNodes = nodes
    .filter((node) => !visited.has(node.id))
    .map((node) => node.id);
  if (cycleNodes.length > 0) {
    issues.push({
      id: 'cycle',
      kind: 'cycle',
      message: 'Cycle detected',
      nodeIds: cycleNodes,
    });
  }

  return issues;
}
