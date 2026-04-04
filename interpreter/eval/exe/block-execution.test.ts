import { describe, expect, it } from 'vitest';
import type { ExeBlockNode } from '@core/types';
import type { WhenExpressionNode } from '@core/types/when';
import { Environment } from '@interpreter/env/Environment';
import { PathService } from '@services/fs/PathService';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { isExeReturnControl } from '../exe-return';
import { evaluateExeBlock } from './block-execution';

function createEnvironment(): Environment {
  return new Environment(new MemoryFileSystem(), new PathService(), '/');
}

function createText(content: string): any {
  return {
    type: 'Text',
    nodeId: `text-${content.replace(/\W+/g, '-') || 'node'}`,
    content
  };
}

function createReturn(value: string): any {
  return {
    type: 'ExeReturn',
    nodeId: `return-${value}`,
    values: [createText(value)],
    meta: { hasValue: true }
  };
}

function createWhenExpressionWithNestedCondition(): WhenExpressionNode {
  return {
    type: 'WhenExpression',
    nodeId: 'nested-when-condition',
    conditions: [
      {
        condition: [[{
          type: 'UnaryExpression',
          nodeId: 'negated-x',
          operator: '!',
          operand: {
            type: 'VariableReference',
            nodeId: 'var-x',
            valueType: 'varIdentifier',
            identifier: 'x'
          },
          meta: {
            isWhenCondition: true,
            isSimple: true,
            negated: true
          }
        }]],
        action: [
          {
            content: [
              {
                type: 'Literal',
                nodeId: 'missing-literal',
                value: 'missing',
                valueType: 'string'
              }
            ],
            wrapperType: 'doubleQuote',
            hasInterpolation: false
          }
        ]
      }
    ],
    withClause: null,
    meta: {
      conditionCount: 1,
      isValueReturning: true,
      evaluationType: 'expression',
      hasTailModifiers: false,
      modifier: null,
      hasBoundValue: false
    }
  } as WhenExpressionNode;
}

function createWhenExpressionWithReturn(): WhenExpressionNode {
  return {
    type: 'WhenExpression',
    nodeId: 'when-return-control',
    conditions: [
      {
        condition: [[{
          type: 'Literal',
          nodeId: 'truthy-condition',
          value: true,
          valueType: 'boolean'
        }]],
        action: [createReturn('returned-from-when')]
      }
    ],
    withClause: null,
    meta: {
      conditionCount: 1,
      isValueReturning: true,
      evaluationType: 'expression',
      hasTailModifiers: false,
      modifier: null,
      hasBoundValue: false
    }
  } as WhenExpressionNode;
}

function createInlineWhenExpression(value: string): WhenExpressionNode {
  return {
    type: 'WhenExpression',
    nodeId: `inline-when-${value}`,
    conditions: [
      {
        condition: [[{
          type: 'Literal',
          nodeId: `inline-condition-${value}`,
          value: true,
          valueType: 'boolean'
        }]],
        action: [{
          type: 'Literal',
          nodeId: `inline-value-${value}`,
          value,
          valueType: 'string'
        } as any]
      }
    ],
    withClause: null,
    meta: {
      conditionCount: 1,
      isValueReturning: true,
      evaluationType: 'expression',
      hasTailModifiers: false,
      form: 'inline',
      modifier: null,
      hasBoundValue: false
    }
  } as WhenExpressionNode;
}


describe('exe block execution module', () => {
  it('keeps return bubbling stable across function and nested block scopes', async () => {
    const env = createEnvironment();
    const blockNode: ExeBlockNode = {
      type: 'ExeBlock',
      nodeId: 'scope-return',
      values: {
        statements: [createReturn('done')]
      },
      meta: {
        statementCount: 1,
        hasReturn: false
      }
    } as ExeBlockNode;

    const functionScopeResult = await evaluateExeBlock(blockNode, env, {}, { scope: 'function' });
    expect(functionScopeResult.value).toBe('done');

    env.pushExecutionContext('exe', { allowReturn: true, scope: 'function', hasFunctionBoundary: true });
    try {
      const nestedBlockResult = await evaluateExeBlock(blockNode, env, {}, { scope: 'block' });
      expect(isExeReturnControl(nestedBlockResult.value)).toBe(true);
      expect((nestedBlockResult.value as any).value).toBe('done');
    } finally {
      env.popExecutionContext('exe');
    }
  });

  it('keeps loop-control short-circuit behavior stable for continue literals in loop contexts', async () => {
    const env = createEnvironment();
    const loopControlBlock: ExeBlockNode = {
      type: 'ExeBlock',
      nodeId: 'loop-control-continue',
      values: {
        statements: [createText('continue'), createReturn('done')]
      },
      meta: {
        statementCount: 2,
        hasReturn: false
      }
    } as ExeBlockNode;

    const noLoopContextResult = await evaluateExeBlock(loopControlBlock, env);
    expect(noLoopContextResult.value).toBe('done');

    env.pushExecutionContext('for', { inLoop: true });
    try {
      const loopContextResult = await evaluateExeBlock(loopControlBlock, env);
      expect(loopContextResult.value).toBe('continue');
    } finally {
      env.popExecutionContext('for');
    }
  });

  it('keeps retry loop-control handling stable inside loop contexts', async () => {
    const env = createEnvironment();
    const retryControlBlock: ExeBlockNode = {
      type: 'ExeBlock',
      nodeId: 'loop-control-retry',
      values: {
        statements: [createText('retry'), createReturn('done')]
      },
      meta: {
        statementCount: 2,
        hasReturn: false
      }
    } as ExeBlockNode;

    env.pushExecutionContext('while', { inLoop: true });
    try {
      const result = await evaluateExeBlock(retryControlBlock, env);
      expect(result.value).toBe('retry');
    } finally {
      env.popExecutionContext('while');
    }
  });

  it('discards non-final when expression values and keeps later returns reachable', async () => {
    const env = createEnvironment();
    const blockNode: ExeBlockNode = {
      type: 'ExeBlock',
      nodeId: 'nested-when-nonfinal-discard',
      values: {
        statements: [createWhenExpressionWithNestedCondition()],
        return: createReturn('ok')
      },
      meta: {
        statementCount: 1,
        hasReturn: true
      }
    } as ExeBlockNode;

    const missingResult = await evaluateExeBlock(blockNode, env, { x: null });
    expect(missingResult.value).toBe('ok');

    const okResult = await evaluateExeBlock(blockNode, env, { x: 'hello' });
    expect(okResult.value).toBe('ok');
  });

  it('keeps final when expressions as implicit returns', async () => {
    const env = createEnvironment();
    const blockNode: ExeBlockNode = {
      type: 'ExeBlock',
      nodeId: 'nested-when-final-return',
      values: {
        statements: [createWhenExpressionWithNestedCondition()]
      },
      meta: {
        statementCount: 1,
        hasReturn: false
      }
    } as ExeBlockNode;

    const missingResult = await evaluateExeBlock(blockNode, env, { x: null });
    expect(missingResult.value).toBe('missing');

    const okResult = await evaluateExeBlock(blockNode, env, { x: 'hello' });
    expect(okResult.value).toBeUndefined();
  });

  it('preserves explicit returns bubbling out of non-final when expressions', async () => {
    const env = createEnvironment();
    const blockNode: ExeBlockNode = {
      type: 'ExeBlock',
      nodeId: 'when-explicit-return',
      values: {
        statements: [createWhenExpressionWithReturn(), createReturn('unreachable')]
      },
      meta: {
        statementCount: 2,
        hasReturn: false
      }
    } as ExeBlockNode;

    const result = await evaluateExeBlock(blockNode, env);
    expect(result.value).toBe('returned-from-when');
  });

  it('keeps inline when guard forms as early returns inside exe blocks', async () => {
    const env = createEnvironment();
    const blockNode: ExeBlockNode = {
      type: 'ExeBlock',
      nodeId: 'inline-when-guard',
      values: {
        statements: [createInlineWhenExpression('guard-hit')],
        return: createReturn('fallback')
      },
      meta: {
        statementCount: 1,
        hasReturn: true
      }
    } as ExeBlockNode;

    const result = await evaluateExeBlock(blockNode, env);
    expect(result.value).toBe('guard-hit');
  });
});
