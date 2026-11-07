import { Handle, Position } from '@xyflow/react';

export default function TrafficGeneratorNode({ data, id }: { data: any, id: string }) {
  const onChange = (evt: React.ChangeEvent<HTMLInputElement>) => {
    data.updateNodeData(id, { rps: Number(evt.target.value) });
  };

  return (
    <div className="p-4 bg-white border border-blue-500 rounded-lg shadow-lg">
      <h3 className="font-bold text-blue-700">Traffic Generator</h3>
      <label className="text-sm block mt-2">
        RPS:
        <input 
          type="number" 
          defaultValue={data.rps} 
          onChange={onChange}
          className="border rounded p-1 w-20 ml-2"
        />
      </label>
      <p className="text-sm mt-1 text-gray-600">Processed: {data.metrics || 0}</p>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
