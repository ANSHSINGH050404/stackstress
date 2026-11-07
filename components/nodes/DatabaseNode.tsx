import { Handle, Position } from '@xyflow/react';

export default function DatabaseNode({ data }: { data: any }) {
  return (
    <div className="p-4 bg-white border border-green-500 rounded-lg shadow-lg">
      <h3 className="font-bold text-green-700">Database</h3>
      <p className="text-sm">Latency: {data.latency || 10}ms</p>
      <Handle type="target" position={Position.Top} />
    </div>
  );
}
