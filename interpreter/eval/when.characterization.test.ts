import { beforeEach, describe, expect, it } from 'vitest';
import { parse } from '@grammar/parser';
import { Environment } from '@interpreter/env/Environment';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { createSimpleTextVariable } from '@core/types/variable';
import type { WhenBlockNode, WhenMatchNode, WhenSimpleNode, AugmentedAssignmentNode } from '@core/types/when';
import type { ExeBlockNode, ExeReturnNode, ExecInvocation } from '@core/types';
import { extractVariableValue } from '@interpreter/utils/variable-resolution';
import { evaluate } from '@interpreter/core/interpreter';
import { evaluateWhen, evaluateCondition } from './when';
import { evaluateExeBlock } from './exe';
import type { IfNode } from '@core/types/if';

function createEnvironment(): Environment {
  return new Environment(new MemoryFileSystem(), new PathService(), '/');
}

function createAppendAction(identifier: string, text: string, nodeId: string): AugmentedAssignmentNode {
  return {
    type: 'AugmentedAssignment',
    nodeId,
    identifier,
    operator: '+=',
    value: [{ type: 'Text', nodeId: `${nodeId}-rhs`, content: text }]
  } as AugmentedAssignmentNode;
}

function execInvocation(identifier: string, args: unknown[] = []): ExecInvocation {
  return {
    type: 'ExecInvocation',
    nodeId: `exec-${identifier}`,
    commandRef: {
      type: 'CommandReference',
      nodeId: `exec-${identifier}-ref`,
      identifier,
      args
    }
  } as ExecInvocation;
}

describe('when evaluator characterization', () => {
  let env: Environment;

  beforeEach(() => {
    env = createEnvironment();
  });

  it('keeps simple when action execution behavior stable', async () => {
    const node: WhenSimpleNode = {
      type: 'Directive',
      kind: 'when',
      subtype: 'whenSimple',
      nodeId: 'when-simple',
      values: {
        condition: [{ type: 'Text', nodeId: 'cond', content: 'true' }],
        action: [{ type: 'Text', nodeId: 'action', content: 'simple-hit' }]
      }
    };

    const result = await evaluateWhen(node, env);
    expect(result.value).toBe('simple-hit');
  });

  it('keeps match-form first matching branch behavior stable', async () => {
    env.setVariable(
      'marker',
      createSimpleTextVariable('marker', 'seed', {
        directive: 'var',
        syntax: 'quoted',
        hasInterpolation: false,
        isMultiLine: false
      })
    );

    const node: WhenMatchNode = {
      type: 'Directive',
      kind: 'when',
      subtype: 'whenMatch',
      nodeId: 'when-match',
      values: {
        expression: [{ type: 'Text', nodeId: 'expr', content: 'beta' }],
        conditions: [
          {
            condition: [{ type: 'Text', nodeId: 'cond-alpha', content: 'alpha' }],
            action: [createAppendAction('marker', '-alpha', 'append-alpha')]
          },
          {
            condition: [{ type: 'Text', nodeId: 'cond-beta', content: 'beta' }],
            action: [createAppendAction('marker', '-beta', 'append-beta')]
          },
          {
            condition: [{ type: 'Literal', nodeId: 'cond-none', value: 'none', valueType: 'none' } as any],
            action: [createAppendAction('marker', '-none', 'append-none')]
          }
        ] as any
      }
    };

    const result = await evaluateWhen(node, env);
    expect(result.value).toBe('');

    const marker = await extractVariableValue(env.getVariable('marker')!, env);
    expect(marker).toBe('seed-beta');
  });

  it('keeps block-form first-match behavior and none fallback stable', async () => {
    env.setVariable(
      'marker',
      createSimpleTextVariable('marker', 'seed', {
        directive: 'var',
        syntax: 'quoted',
        hasInterpolation: false,
        isMultiLine: false
      })
    );

    const node: WhenBlockNode = {
      type: 'Directive',
      kind: 'when',
      subtype: 'whenBlock',
      nodeId: 'when-block',
      values: {
        conditions: [
          {
            condition: [{ type: 'Text', nodeId: 'block-false', content: 'false' }],
            action: [createAppendAction('marker', '-false', 'append-false')]
          },
          {
            condition: [{ type: 'Text', nodeId: 'block-true', content: 'true' }],
            action: [createAppendAction('marker', '-true', 'append-true')]
          },
          {
            condition: [{ type: 'Literal', nodeId: 'block-none', value: 'none', valueType: 'none' } as any],
            action: [createAppendAction('marker', '-none', 'append-none')]
          }
        ] as any
      },
      meta: {
        modifier: 'default',
        hasVariable: false,
        conditionCount: 3
      }
    };

    const result = await evaluateWhen(node, env);
    expect(result.value).toBeUndefined();

    const marker = await extractVariableValue(env.getVariable('marker')!, env);
    expect(marker).toBe('seed-true');
  });

  it('keeps none placement validation in when blocks stable', async () => {
    const node: WhenBlockNode = {
      type: 'Directive',
      kind: 'when',
      subtype: 'whenBlock',
      nodeId: 'when-invalid-none-placement',
      values: {
        conditions: [
          {
            condition: [{ type: 'Literal', nodeId: 'none-first', value: 'none', valueType: 'none' } as any],
            action: [{ type: 'Text', nodeId: 'none-action', content: 'fallback' }]
          },
          {
            condition: [{ type: 'Text', nodeId: 'cond-after-none', content: 'true' }],
            action: [{ type: 'Text', nodeId: 'invalid-action', content: 'invalid' }]
          }
        ] as any
      },
      meta: {
        modifier: 'default',
        hasVariable: false,
        conditionCount: 2
      }
    };

    await expect(evaluateWhen(node, env)).rejects.toThrow(
      'The "none" keyword can only appear as the last condition(s) in a when block'
    );
  });

  it('keeps none-with-operator validation stable for simple conditions', async () => {
    const node: WhenSimpleNode = {
      type: 'Directive',
      kind: 'when',
      subtype: 'whenSimple',
      nodeId: 'when-none-operator',
      values: {
        condition: [{
          type: 'UnaryExpression',
          nodeId: 'unary-none',
          operator: '!',
          operand: { type: 'Literal', nodeId: 'none-literal', value: 'none', valueType: 'none' } as any
        } as any],
        action: [{ type: 'Text', nodeId: 'action', content: 'never' }]
      }
    };

    await expect(evaluateWhen(node, env)).rejects.toThrow(
      "The 'none' keyword cannot be used with operators"
    );
  });

  it('keeps exec-in-condition truthiness behavior stable', async () => {
    const { ast } = await parse([
      '/exe @emitEmpty() = js { return ""; }',
      '/exe @emitText() = js { return "ok"; }'
    ].join('\n'));
    await evaluate(ast, env);

    const emptyResult = await evaluateCondition([execInvocation('emitEmpty') as any], env);
    const textResult = await evaluateCondition([execInvocation('emitText') as any], env);

    expect(emptyResult).toBe(false);
    expect(textResult).toBe(true);
  });

  it('keeps implicit variable forwarding for exec-in-condition stable', async () => {
    const { ast } = await parse('/exe @isOk(value) = js { return value === "ok"; }');
    await evaluate(ast, env);

    env.setVariable(
      'probe',
      createSimpleTextVariable('probe', 'ok', {
        directive: 'var',
        syntax: 'quoted',
        hasInterpolation: false,
        isMultiLine: false
      })
    );

    const result = await evaluateCondition([execInvocation('isOk') as any], env, 'probe');
    expect(result).toBe(true);
  });

  it('keeps exe return-control propagation through when action sequences stable', async () => {
    env.setVariable(
      'message',
      createSimpleTextVariable('message', 'start', {
        directive: 'var',
        syntax: 'quoted',
        hasInterpolation: false,
        isMultiLine: false
      })
    );

    const returnNode: ExeReturnNode = {
      type: 'ExeReturn',
      nodeId: 'return',
      values: [{ type: 'Text', nodeId: 'return-value', content: 'done' }],
      meta: { hasValue: true }
    } as ExeReturnNode;

    const returnIfNode: IfNode = {
      type: 'Directive',
      kind: 'if',
      subtype: 'ifBlock',
      nodeId: 'if-return',
      values: {
        condition: [{ type: 'Text', nodeId: 'if-cond', content: 'true' }],
        then: [returnNode as any]
      },
      meta: {
        hasReturn: true
      }
    };

    const whenNode: WhenSimpleNode = {
      type: 'Directive',
      kind: 'when',
      subtype: 'whenSimple',
      nodeId: 'when-return-control',
      values: {
        condition: [{ type: 'Text', nodeId: 'condition', content: 'true' }],
        action: [returnIfNode as any]
      }
    };

    const appendNode: AugmentedAssignmentNode = createAppendAction('message', '-after', 'append-after');
    const block: ExeBlockNode = {
      type: 'ExeBlock',
      nodeId: 'exe-block',
      values: { statements: [whenNode as any, appendNode as any] }
    } as ExeBlockNode;

    const result = await evaluateExeBlock(block, env);
    expect(result.value).toBe('done');

    const message = await extractVariableValue(env.getVariable('message')!, env);
    expect(message).toBe('start');
  });
});
