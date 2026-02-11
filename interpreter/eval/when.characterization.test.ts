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
import { evaluateWhen, evaluateCondition, evaluateLetAssignment, evaluateAugmentedAssignment } from './when';
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

  it('keeps denied literal condition handling stable', async () => {
    const deniedLiteral = [{
      type: 'Literal',
      nodeId: 'denied-literal',
      value: 'denied',
      valueType: 'string'
    } as any];

    const defaultResult = await evaluateCondition(deniedLiteral, env);
    expect(defaultResult).toBe(false);

    const deniedResult = await env.withDeniedContext(
      { denied: true, reason: 'blocked by guard', guardName: 'test-guard' },
      () => evaluateCondition(deniedLiteral, env)
    );
    expect(deniedResult).toBe(true);

    const negatedDenied = await env.withDeniedContext(
      { denied: true, reason: 'blocked by guard', guardName: 'test-guard' },
      () =>
        evaluateCondition(
          [{
            type: 'UnaryExpression',
            nodeId: 'negated-denied',
            operator: '!',
            operand: deniedLiteral[0]
          } as any],
          env
        )
    );
    expect(negatedDenied).toBe(false);
  });

  it('keeps condition-expression error wrapping stable', async () => {
    const condition = [{
      type: 'BinaryExpression',
      nodeId: 'bad-expression',
      operator: '^',
      left: {
        type: 'Text',
        nodeId: 'left-text',
        content: 'left'
      },
      right: {
        type: 'Text',
        nodeId: 'right-text',
        content: 'ok'
      }
    } as any];

    await expect(evaluateCondition(condition, env)).rejects.toThrow(
      'Failed to evaluate condition expression'
    );
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

  it('keeps mixed action-sequence ordering stable for let, +=, and directive actions', async () => {
    env.setVariable(
      'log',
      createSimpleTextVariable('log', 'start', {
        directive: 'var',
        syntax: 'quoted',
        hasInterpolation: false,
        isMultiLine: false
      })
    );

    const node: WhenSimpleNode = {
      type: 'Directive',
      kind: 'when',
      subtype: 'whenSimple',
      nodeId: 'when-mixed-actions',
      values: {
        condition: [{ type: 'Text', nodeId: 'condition', content: 'true' }],
        action: [
          {
            type: 'LetAssignment',
            nodeId: 'let-temp',
            identifier: 'temp',
            value: [{ type: 'Text', nodeId: 'let-rhs', content: 'inner' }]
          } as any,
          createAppendAction('log', '-a', 'append-a'),
          createAppendAction('log', '-b', 'append-b'),
          { type: 'Text', nodeId: 'tail', content: 'done' } as any
        ]
      }
    };

    const result = await evaluateWhen(node, env);
    expect(result.value).toBe('done');
    expect(result.env.hasVariable('temp')).toBe(true);

    const log = await extractVariableValue(env.getVariable('log')!, env);
    expect(log).toBe('start-a-b');
  });

  it('keeps let redefinition guard behavior stable for non-block-scoped variables', async () => {
    env.setVariable(
      'existing',
      createSimpleTextVariable('existing', 'v1', {
        directive: 'var',
        syntax: 'quoted',
        hasInterpolation: false,
        isMultiLine: false
      })
    );

    const letNode = {
      type: 'LetAssignment',
      nodeId: 'let-redef',
      identifier: 'existing',
      value: [{ type: 'Text', nodeId: 'rhs', content: 'v2' }]
    } as any;

    await expect(evaluateLetAssignment(letNode, env)).rejects.toThrow(
      "Variable 'existing' is already defined and cannot be redefined"
    );
  });

  it('keeps let shadowing behavior stable for block-scoped and imported variables', async () => {
    const blockScoped = createSimpleTextVariable('shadowed', 'outer', {
      directive: 'var',
      syntax: 'quoted',
      hasInterpolation: false,
      isMultiLine: false
    });
    (blockScoped as any).mx = { ...(blockScoped as any).mx, importPath: 'let' };
    env.setVariable('shadowed', blockScoped);

    const blockScopedLet = {
      type: 'LetAssignment',
      nodeId: 'let-shadow-block',
      identifier: 'shadowed',
      value: [{ type: 'Text', nodeId: 'rhs', content: 'inner' }]
    } as any;
    const blockScopedEnv = await evaluateLetAssignment(blockScopedLet, env);
    const blockScopedValue = await extractVariableValue(blockScopedEnv.getVariable('shadowed')!, blockScopedEnv);
    expect(blockScopedValue).toBe('inner');

    const imported = createSimpleTextVariable('imported', 'outer', {
      directive: 'var',
      syntax: 'quoted',
      hasInterpolation: false,
      isMultiLine: false
    });
    (imported as any).mx = { ...(imported as any).mx, isImported: true };
    env.setVariable('imported', imported);

    const importedLet = {
      type: 'LetAssignment',
      nodeId: 'let-shadow-imported',
      identifier: 'imported',
      value: [{ type: 'Text', nodeId: 'rhs-imported', content: 'inner' }]
    } as any;
    const importedEnv = await evaluateLetAssignment(importedLet, env);
    const importedValue = await extractVariableValue(importedEnv.getVariable('imported')!, importedEnv);
    expect(importedValue).toBe('inner');
  });

  it('keeps when-expression shadowing override behavior stable', async () => {
    env.setVariable(
      'ctxVar',
      createSimpleTextVariable('ctxVar', 'outer', {
        directive: 'var',
        syntax: 'quoted',
        hasInterpolation: false,
        isMultiLine: false
      })
    );

    const letNode = {
      type: 'LetAssignment',
      nodeId: 'let-shadow-context',
      identifier: 'ctxVar',
      value: [{ type: 'Text', nodeId: 'rhs', content: 'inner' }]
    } as any;

    const childEnv = await env.withExecutionContext(
      'when-expression',
      { allowLetShadowing: true },
      async () => evaluateLetAssignment(letNode, env)
    );
    const value = await extractVariableValue(childEnv.getVariable('ctxVar')!, childEnv);
    expect(value).toBe('inner');
  });

  it('keeps parallel isolation-root mutation denial stable for +=', async () => {
    env.setVariable(
      'shared',
      createSimpleTextVariable('shared', 'root', {
        directive: 'var',
        syntax: 'quoted',
        hasInterpolation: false,
        isMultiLine: false
      })
    );

    const isolationRoot = env.createChild();
    (isolationRoot as any).__parallelIsolationRoot = isolationRoot;
    const isolatedChild = isolationRoot.createChild();

    const appendNode = createAppendAction('shared', '-inner', 'append-isolated');
    await expect(evaluateAugmentedAssignment(appendNode, isolatedChild)).rejects.toThrow(
      'Parallel for block cannot mutate outer variable @shared.'
    );
  });

  it('keeps parallel isolation-root local mutation behavior stable for +=', async () => {
    const isolationRoot = env.createChild();
    (isolationRoot as any).__parallelIsolationRoot = isolationRoot;
    isolationRoot.setVariable(
      'localShared',
      createSimpleTextVariable('localShared', 'root', {
        directive: 'var',
        syntax: 'quoted',
        hasInterpolation: false,
        isMultiLine: false
      })
    );

    const isolatedChild = isolationRoot.createChild();
    const appendNode = createAppendAction('localShared', '-inner', 'append-local-isolated');
    await evaluateAugmentedAssignment(appendNode, isolatedChild);

    const value = await extractVariableValue(isolationRoot.getVariable('localShared')!, isolationRoot);
    expect(value).toBe('root-inner');
  });
});
