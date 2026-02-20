import type { BaseMlldNode, LiteralNode } from './primitives';

export interface DoneLiteralNode extends LiteralNode {
  valueType: 'done';
  value: BaseMlldNode[] | string;
}

export interface ContinueLiteralNode extends LiteralNode {
  valueType: 'continue';
  value: BaseMlldNode[] | string;
}

export function isDoneLiteral(node: BaseMlldNode): node is DoneLiteralNode {
  return node != null && node.type === 'Literal' && (node as any).valueType === 'done';
}

export function isContinueLiteral(node: BaseMlldNode): node is ContinueLiteralNode {
  return node != null && node.type === 'Literal' && (node as any).valueType === 'continue';
}
