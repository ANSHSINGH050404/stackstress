import { Handle, Position } from '@xyflow/react';

export default function DatabaseNode({ data, id }: { data: any, id: string }) {
  const onChange = (evt: React.ChangeEvent<HTMLInputElement>) => {
    data.updateNodeData(id, { latency: Number(evt.target.value) });
  };

  return (
    <div className="p-4 bg-white border border-green-500 rounded-lg shadow-lg">
      <h3 className="font-bold text-green-700">Database</h3>
      <label className="text-sm block mt-2">
        Latency (ms):
        <input 
          type="number" 
          defaultValue={data.latency} 
          onChange={onChange}
          className="border rounded p-1 w-20 ml-2"
        />
      </label>
      <p className="text-sm mt-1 text-gray-600">Processed: {data.metrics || 0}</p>
      <Handle type="target" position={Position.Top} />
    </div>
  );
}
