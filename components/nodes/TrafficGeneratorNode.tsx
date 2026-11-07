import { Handle, Position } from '@xyflow/react';

export default function TrafficGeneratorNode({ data }: { data: any }) {
  return (
    <div className="p-4 bg-white border border-blue-500 rounded-lg shadow-lg">
      <h3 className="font-bold text-blue-700">Traffic Generator</h3>
      <p className="text-sm">RPS: {data.rps || 100}</p>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
