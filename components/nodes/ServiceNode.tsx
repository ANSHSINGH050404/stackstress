import { NodeProps } from '@xyflow/react';
import { SimNode } from '@/lib/store';
import BaseNode from './BaseNode';

export default function ServiceNode(props: NodeProps<SimNode>) {
  return <BaseNode {...props} />;
}
