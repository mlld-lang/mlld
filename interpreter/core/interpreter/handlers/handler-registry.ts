import type { DispatchTarget } from '@interpreter/core/interpreter/dispatch';

export type SpecializedHandlerFamily =
  | 'execInvocation'
  | 'variableReferenceWithTail'
  | 'newExpression'
  | 'labelModification'
  | 'unifiedExpression'
  | 'controlFlow'
  | 'loadContent'
  | 'fileReference'
  | 'code'
  | 'command';

export const DISPATCH_TARGET_TO_HANDLER_FAMILY: Partial<Record<DispatchTarget, SpecializedHandlerFamily>> = {
  execInvocation: 'execInvocation',
  variableReferenceWithTail: 'variableReferenceWithTail',
  newExpression: 'newExpression',
  labelModification: 'labelModification',
  unifiedExpression: 'unifiedExpression',
  whenExpression: 'controlFlow',
  exeBlock: 'controlFlow',
  foreach: 'controlFlow',
  forExpression: 'controlFlow',
  loopExpression: 'controlFlow',
  loadContent: 'loadContent',
  fileReference: 'fileReference',
  code: 'code',
  command: 'command'
};

export function getSpecializedHandlerFamily(
  dispatchTarget: DispatchTarget
): SpecializedHandlerFamily | undefined {
  return DISPATCH_TARGET_TO_HANDLER_FAMILY[dispatchTarget];
}
