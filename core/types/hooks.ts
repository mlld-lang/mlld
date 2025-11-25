import type { DirectiveNode, ExecInvocation } from './primitives';

export type ExecInvocationNode = ExecInvocation;

export type HookableNode = DirectiveNode | ExecInvocationNode;

export function isDirectiveHookTarget(node: HookableNode): node is DirectiveNode {
  return (node as DirectiveNode).kind !== undefined;
}

export function isExecHookTarget(node: HookableNode): node is ExecInvocationNode {
  return node.type === 'ExecInvocation';
}
