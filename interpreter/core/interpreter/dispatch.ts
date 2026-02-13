import type { MlldNode } from '@core/types';
import { isExecInvocation, isLiteralNode } from '@core/types';

export type DispatchTarget =
  | 'document'
  | 'directive'
  | 'text'
  | 'newline'
  | 'comment'
  | 'frontmatter'
  | 'codeFence'
  | 'mlldRunBlock'
  | 'variableReference'
  | 'execInvocation'
  | 'variableReferenceWithTail'
  | 'newExpression'
  | 'labelModification'
  | 'unifiedExpression'
  | 'literal'
  | 'whenExpression'
  | 'exeBlock'
  | 'exeReturn'
  | 'foreach'
  | 'forExpression'
  | 'loopExpression'
  | 'dataValue'
  | 'loadContent'
  | 'fileReference'
  | 'code'
  | 'command'
  | 'unknown';

export function getDispatchTarget(node: MlldNode): DispatchTarget {
  switch (node.type) {
    case 'Document':
      return 'document';
    case 'Directive':
      return 'directive';
    case 'Text':
      return 'text';
    case 'Newline':
      return 'newline';
    case 'Comment':
      return 'comment';
    case 'Frontmatter':
      return 'frontmatter';
    case 'CodeFence':
      return 'codeFence';
    case 'MlldRunBlock':
      return 'mlldRunBlock';
    case 'VariableReference':
      return 'variableReference';
    case 'VariableReferenceWithTail':
      return 'variableReferenceWithTail';
    case 'NewExpression':
      return 'newExpression';
    case 'LabelModification':
      return 'labelModification';
    case 'BinaryExpression':
    case 'TernaryExpression':
    case 'UnaryExpression':
      return 'unifiedExpression';
    case 'WhenExpression':
      return 'whenExpression';
    case 'ExeBlock':
      return 'exeBlock';
    case 'ExeReturn':
      return 'exeReturn';
    case 'foreach':
    case 'foreach-command':
      return 'foreach';
    case 'ForExpression':
      return 'forExpression';
    case 'LoopExpression':
      return 'loopExpression';
    case 'array':
    case 'object':
      return 'dataValue';
    case 'load-content':
      return 'loadContent';
    case 'FileReference':
      return 'fileReference';
    case 'code':
      return 'code';
    case 'command':
      return 'command';
    default:
      if (isExecInvocation(node)) {
        return 'execInvocation';
      }
      if (isLiteralNode(node)) {
        return 'literal';
      }
      return 'unknown';
  }
}

export function createUnknownNodeTypeError(node: MlldNode): Error {
  return new Error(`Unknown node type: ${node.type}`);
}
