import type { DirectiveNode, ExecInvocation } from './primitives';
import type { PipelineCommand } from './run';
import type { SourceLocation } from './index';

export type ExecInvocationNode = ExecInvocation;

export interface EffectHookNode extends PipelineCommand {
  type: 'Effect';
  location?: SourceLocation | null;
}

export type HookableNode = DirectiveNode | ExecInvocationNode | EffectHookNode;

export function isDirectiveHookTarget(node: HookableNode): node is DirectiveNode {
  return (node as DirectiveNode).kind !== undefined;
}

export function isExecHookTarget(node: HookableNode): node is ExecInvocationNode {
  return node.type === 'ExecInvocation';
}

export function isEffectHookTarget(node: HookableNode): node is EffectHookNode {
  return (node as EffectHookNode).type === 'Effect';
}
