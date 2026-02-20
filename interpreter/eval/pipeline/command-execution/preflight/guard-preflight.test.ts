import { describe, expect, it } from 'vitest';
import { parseSync } from '@grammar/parser';
import type { DirectiveNode } from '@core/types';
import type { WhenExpressionNode } from '@core/types/when';
import type { OperationContext } from '@interpreter/env/ContextManager';
import { Environment } from '@interpreter/env/Environment';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { createSimpleTextVariable } from '@core/types/variable';
import type { VariableSource } from '@core/types/variable';
import {
  buildGuardPreflightContext,
  executeGuardPreflight
} from './guard-preflight';

const TEXT_SOURCE: VariableSource = {
  directive: 'var',
  syntax: 'quoted',
  hasInterpolation: false,
  isMultiLine: false
};

function createEnv(): Environment {
  return new Environment(new MemoryFileSystem(), new PathService(), '/');
}

function parseWhenExpression(source: string): WhenExpressionNode {
  const directive = parseSync(source.trim())[0] as DirectiveNode;
  const whenExpr = directive.values?.content?.[0];
  if (!whenExpr || whenExpr.type !== 'WhenExpression') {
    throw new Error('Expected WhenExpression in directive content');
  }
  return whenExpr;
}

function buildHookNode(): any {
  return {
    type: 'ExecInvocation',
    commandRef: {
      type: 'CommandReference',
      identifier: 'probe',
      args: []
    }
  };
}

function buildOperationContext(): OperationContext {
  return {
    type: 'exe',
    name: 'probe',
    opLabels: ['op:exe']
  };
}

describe('guard preflight extraction parity', () => {
  it('preserves guard pre-hook denial behavior when no denied handler exists', async () => {
    const env = createEnv();
    const execEnv = env.createChild();

    env.getHookManager().registerPre(async () => ({
      action: 'deny',
      metadata: {
        guardName: 'preflight-deny',
        guardFilter: 'op:exe',
        reason: 'blocked in preflight'
      }
    }));

    const { guardInputs } = buildGuardPreflightContext({
      env,
      execEnv,
      stageInputs: [],
      baseParamNames: []
    });

    await expect(
      executeGuardPreflight({
        env,
        execEnv,
        guardInputs,
        hookNode: buildHookNode(),
        operationContext: buildOperationContext(),
        whenExprNode: null
      })
    ).rejects.toMatchObject({
      decision: 'deny',
      reason: 'blocked in preflight'
    });
  });

  it('preserves denied-handler fallback behavior and guard-input injection for when expressions', async () => {
    const env = createEnv();
    const execEnv = env.createChild();
    const guardInput = createSimpleTextVariable('secretValue', 'sk-live', TEXT_SOURCE);

    env.getHookManager().registerPre(async () => ({
      action: 'deny',
      metadata: {
        guardName: 'preflight-deny',
        guardFilter: 'op:exe',
        reason: 'blocked in preflight',
        guardInput
      }
    }));

    const whenExprNode = parseWhenExpression(`
/exe @process() = when [
  denied => "Denied fallback"
  * => "Process"
]
    `);

    const { guardInputs } = buildGuardPreflightContext({
      env,
      execEnv,
      stageInputs: [],
      baseParamNames: []
    });

    const result = await executeGuardPreflight({
      env,
      execEnv,
      guardInputs,
      hookNode: buildHookNode(),
      operationContext: buildOperationContext(),
      whenExprNode
    });

    expect(result.hasFallbackResult).toBe(true);
    expect(result.fallbackValue).toBe('Denied fallback');
    expect(execEnv.getVariable('input')?.value).toBe('sk-live');
  });
});
