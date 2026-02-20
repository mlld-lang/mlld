import { describe, expect, it } from 'vitest';
import type { ExeBlockNode } from '@core/types';
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
});
