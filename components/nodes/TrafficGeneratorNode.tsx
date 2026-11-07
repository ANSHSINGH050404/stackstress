import { NodeProps } from '@xyflow/react';
import { SimNode } from '@/lib/store';
import BaseNode from './BaseNode';

export default function TrafficGeneratorNode(props: NodeProps<SimNode>) {
  return <BaseNode {...props} />;
}
