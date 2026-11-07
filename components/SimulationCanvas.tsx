'use client';

import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  applyEdgeChanges,
  applyNodeChanges,
  addEdge,
  Node,
  Edge,
  OnNodesChange,
  OnEdgesChange,
  OnConnect,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useState, useCallback } from 'react';
import TrafficGeneratorNode from './nodes/TrafficGeneratorNode';
import DatabaseNode from './nodes/DatabaseNode';

const nodeTypes = {
  trafficGenerator: TrafficGeneratorNode,
  database: DatabaseNode,
};

const initialNodes: Node[] = [
  { 
    id: '1', 
    type: 'trafficGenerator', 
    data: { rps: 500 }, 
    position: { x: 250, y: 5 } 
  },
  { 
    id: '2', 
    type: 'database', 
    data: { latency: 50 }, 
    position: { x: 250, y: 150 } 
  },
];

const initialEdges: Edge[] = [{ id: 'e1-2', source: '1', target: '2' }];

export default function SimulationCanvas() {
  const [nodes, setNodes] = useState<Node[]>(initialNodes);
  const [edges, setEdges] = useState<Edge[]>(initialEdges);

  const onNodesChange: OnNodesChange = useCallback(
    (changes) => setNodes((nds) => applyNodeChanges(changes, nds)),
    []
  );
  const onEdgesChange: OnEdgesChange = useCallback(
    (changes) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    []
  );
  const onConnect: OnConnect = useCallback(
    (params) => setEdges((eds) => addEdge(params, eds)),
    []
  );

  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
      >
        <Background />
        <Controls />
        <MiniMap />
      </ReactFlow>
    </div>
  );
}
