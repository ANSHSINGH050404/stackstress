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
import { useState, useCallback, useEffect } from 'react';
import TrafficGeneratorNode from './nodes/TrafficGeneratorNode';
import DatabaseNode from './nodes/DatabaseNode';

const nodeTypes = {
  trafficGenerator: TrafficGeneratorNode,
  database: DatabaseNode,
};

const initialEdges: Edge[] = [{ id: 'e1-2', source: '1', target: '2' }];

export default function SimulationCanvas() {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>(initialEdges);

  const updateNodeData = useCallback((id: string, newData: any) => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === id) {
          return {
            ...node,
            data: { ...node.data, ...newData },
          };
        }
        return node;
      })
    );
  }, []);

  useEffect(() => {
    // Initialize Web Worker
    const worker = new Worker(new URL('./simulation.worker.ts', import.meta.url));

    // Send initial state to worker
    worker.postMessage({
      type: 'INIT',
      payload: {
        components: {
          '1': { id: '1', type: 'traffic-generator', name: 'Gen', throughputLimit: 100, latency: 0, failureRate: 0, queueCapacity: 100 },
          '2': { id: '2', type: 'database', name: 'DB', throughputLimit: 100, latency: 50, failureRate: 0, queueCapacity: 100 },
        },
        events: [],
        currentTime: 0,
      }
    });

    // Start simulation loop
    const interval = setInterval(() => {
      worker.postMessage({ type: 'TICK', payload: { duration: 1000 } });
    }, 1000);

    worker.onmessage = (e) => {
      if (e.data.type === 'UPDATE') {
        const newState = e.data.state;
        setNodes((nds) => 
          nds.map(node => {
            if (newState.components[node.id]) {
              return {
                ...node,
                data: { ...node.data, metrics: newState.components[node.id].throughputLimit }
              };
            }
            return node;
          })
        );
      }
    };

    return () => {
      worker.terminate();
      clearInterval(interval);
    };
  }, []);

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
