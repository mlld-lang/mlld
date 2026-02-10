import { describe, expect, it } from 'vitest';
import {
  createUnknownNodeTypeError,
  getDispatchTarget
} from '@interpreter/core/interpreter/dispatch';
import {
  DISPATCH_TARGET_TO_HANDLER_FAMILY,
  getSpecializedHandlerFamily
} from '@interpreter/core/interpreter/handlers/handler-registry';

function node(type: string, extra: Record<string, unknown> = {}): any {
  return { type, nodeId: `${type}-node`, ...extra };
}

describe('interpreter dispatch routing', () => {
  it('routes representative node families to stable dispatch targets', () => {
    expect(getDispatchTarget(node('Document', { nodes: [] }))).toBe('document');
    expect(getDispatchTarget(node('Directive'))).toBe('directive');
    expect(getDispatchTarget(node('Text', { content: 'alpha' }))).toBe('text');
    expect(getDispatchTarget(node('Newline', { content: '\n' }))).toBe('newline');
    expect(getDispatchTarget(node('Comment', { content: 'skip' }))).toBe('comment');
    expect(getDispatchTarget(node('Frontmatter', { content: 'title: Demo' }))).toBe('frontmatter');
    expect(getDispatchTarget(node('CodeFence', { content: 'console.log(1);' }))).toBe('codeFence');
    expect(getDispatchTarget(node('MlldRunBlock', { content: [], raw: '' }))).toBe('mlldRunBlock');
    expect(getDispatchTarget(node('VariableReference', { identifier: 'name' }))).toBe('variableReference');
    expect(getDispatchTarget(node('VariableReferenceWithTail', { identifier: 'name' }))).toBe('variableReferenceWithTail');
    expect(getDispatchTarget(node('NewExpression'))).toBe('newExpression');
    expect(getDispatchTarget(node('LabelModification'))).toBe('labelModification');
    expect(getDispatchTarget(node('BinaryExpression'))).toBe('unifiedExpression');
    expect(getDispatchTarget(node('WhenExpression'))).toBe('whenExpression');
    expect(getDispatchTarget(node('ExeBlock'))).toBe('exeBlock');
    expect(getDispatchTarget(node('foreach'))).toBe('foreach');
    expect(getDispatchTarget(node('foreach-command'))).toBe('foreach');
    expect(getDispatchTarget(node('ForExpression'))).toBe('forExpression');
    expect(getDispatchTarget(node('LoopExpression'))).toBe('loopExpression');
    expect(getDispatchTarget(node('array'))).toBe('dataValue');
    expect(getDispatchTarget(node('object'))).toBe('dataValue');
    expect(getDispatchTarget(node('load-content'))).toBe('loadContent');
    expect(getDispatchTarget(node('FileReference'))).toBe('fileReference');
    expect(getDispatchTarget(node('code'))).toBe('code');
    expect(getDispatchTarget(node('command'))).toBe('command');
  });

  it('preserves special routing branches for exec invocations and literals', () => {
    expect(
      getDispatchTarget(node('ExecInvocation', {
        commandRef: { identifier: 'echo', args: [] }
      }))
    ).toBe('execInvocation');
    expect(
      getDispatchTarget(node('Literal', {
        valueType: 'string',
        value: 'alpha'
      }))
    ).toBe('literal');
  });

  it('keeps unknown-node target and error message contract stable', () => {
    const unknown = node('DefinitelyUnknownNode');
    expect(getDispatchTarget(unknown)).toBe('unknown');
    expect(createUnknownNodeTypeError(unknown).message).toBe(
      'Unknown node type: DefinitelyUnknownNode'
    );
  });

  it('keeps dispatch-to-specialized-handler identities stable', () => {
    expect(getSpecializedHandlerFamily('execInvocation')).toBe('execInvocation');
    expect(getSpecializedHandlerFamily('variableReferenceWithTail')).toBe('variableReferenceWithTail');
    expect(getSpecializedHandlerFamily('newExpression')).toBe('newExpression');
    expect(getSpecializedHandlerFamily('labelModification')).toBe('labelModification');
    expect(getSpecializedHandlerFamily('unifiedExpression')).toBe('unifiedExpression');
    expect(getSpecializedHandlerFamily('whenExpression')).toBe('controlFlow');
    expect(getSpecializedHandlerFamily('foreach')).toBe('controlFlow');
    expect(getSpecializedHandlerFamily('forExpression')).toBe('controlFlow');
    expect(getSpecializedHandlerFamily('loopExpression')).toBe('controlFlow');
    expect(getSpecializedHandlerFamily('loadContent')).toBe('loadContent');
    expect(getSpecializedHandlerFamily('fileReference')).toBe('fileReference');
    expect(getSpecializedHandlerFamily('code')).toBe('code');
    expect(getSpecializedHandlerFamily('command')).toBe('command');
    expect(getSpecializedHandlerFamily('directive')).toBeUndefined();

    expect(DISPATCH_TARGET_TO_HANDLER_FAMILY).toMatchObject({
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
    });
  });
});
