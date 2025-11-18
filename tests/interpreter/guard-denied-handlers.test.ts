import { describe, it, expect } from 'vitest';
import { parseSync } from '@grammar/parser';
import type { DirectiveNode } from '@core/types';
import type { WhenExpressionNode } from '@core/types/when';
import { Environment } from '@interpreter/env/Environment';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { TestEffectHandler } from '@interpreter/env/EffectHandler';
import { GuardError } from '@core/errors/GuardError';
import { handleExecGuardDenial, formatGuardWarning } from '@interpreter/eval/guard-denial-handler';
import { createSimpleTextVariable } from '@core/types/variable';
import type { VariableSource } from '@core/types/variable';
import { setExpressionProvenance } from '@core/types/provenance/ExpressionProvenance';
import { makeSecurityDescriptor } from '@core/types/security';

function createEnv(): {
  env: Environment;
  execEnv: Environment;
  effects: TestEffectHandler;
} {
  const env = new Environment(new MemoryFileSystem(), new PathService(), '/');
  const effects = new TestEffectHandler();
  env.setEffectHandler(effects);
  const execEnv = env.createChild();
  execEnv.setEffectHandler(effects);
  return { env, execEnv, effects };
}

function parseWhenExpression(source: string): WhenExpressionNode {
  const directive = parseSync(source.trim())[0] as DirectiveNode;
  const whenExpr = directive.values?.content?.[0];
  if (!whenExpr || whenExpr.type !== 'WhenExpression') {
    throw new Error('Expected WhenExpression in directive content');
  }
  return whenExpr;
}

describe('handleExecGuardDenial', () => {
  it('runs denied handlers and surfaces warning without aborting', async () => {
    const { env, execEnv, effects } = createEnv();
    const whenExpr = parseWhenExpression(`
/exe @process() = when [
  denied => show "Operation blocked by policy"
  denied => "Denied fallback"
  * => show "Process"
]
    `);

    const error = new GuardError({
      decision: 'deny',
      reason: 'Displays disabled',
      guardFilter: 'op:show'
    });

    const result = await handleExecGuardDenial(error, { execEnv, env, whenExprNode: whenExpr });
    console.log('RESULT', result);
    expect(result).not.toBeNull();
    expect(result?.value).toBe('Denied fallback');
    expect(result?.internal?.deniedHandlerRan).toBe(true);
    expect(effects.getErrors()).toContain('[Guard Warning] Displays disabled');
    const handlerOutputs = effects
      .getAll()
      .filter(effect => effect.type === 'both')
      .map(effect => effect.content.trim());
    expect(handlerOutputs).toContain('Operation blocked by policy');
  });

  it('returns null when no denied handlers exist', async () => {
    const { env, execEnv, effects } = createEnv();
    const whenExpr = parseWhenExpression(`
/exe @process() = when [
  * => show "Process"
]
    `);

    const error = new GuardError({
      decision: 'deny',
      reason: 'Displays disabled',
      guardFilter: 'op:show'
    });

    const result = await handleExecGuardDenial(error, { execEnv, env, whenExprNode: whenExpr });
    expect(result).toBeNull();
    expect(effects.getErrors()).toContain('[Guard Warning] Displays disabled');
  });

  it('executes multiple denied handlers sequentially', async () => {
    const { env, execEnv, effects } = createEnv();
    const whenExpr = parseWhenExpression(`
/exe @process() = when [
  denied => show "first denied handler"
  denied => show "second denied handler"
  * => show "Process"
]
    `);

    const error = new GuardError({
      decision: 'deny',
      reason: 'Displays disabled',
      guardFilter: 'op:show'
    });

    const result = await handleExecGuardDenial(error, { execEnv, env, whenExprNode: whenExpr });
    expect(result).not.toBeNull();
    const outputs = effects
      .getAll()
      .filter(effect => effect.type === 'both')
      .map(effect => effect.content.trim());
    const firstIndex = outputs.indexOf('first denied handler');
    const secondIndex = outputs.indexOf('second denied handler');
    expect(firstIndex).toBeGreaterThanOrEqual(0);
    expect(secondIndex).toBeGreaterThan(firstIndex);
    expect(result?.internal?.deniedHandlerRan).toBe(true);
  });

  it('exposes guard context inside denied handlers', async () => {
    const { env, execEnv, effects } = createEnv();
    const whenExpr = parseWhenExpression(`
/exe @process(value) = when [
  denied => show "Guard input: @ctx.guard.input"
  denied => show "Param value: @value"
  * => show "Process"
]
    `);

    const source: VariableSource = {
      directive: 'var',
      syntax: 'quoted',
      hasInterpolation: false,
      isMultiLine: false
    };
    const guardInput = createSimpleTextVariable(
      'value',
      'sk-live-ctx',
      source,
      {
        ctx: {},
        internal: { isSystem: true, isReserved: true }
      }
    );
    execEnv.setParameterVariable('value', guardInput);

    const guardContext = {
      name: '@secretGuard',
      attempt: 1,
      try: 1,
      tries: [],
      max: 3,
      input: guardInput,
      labels: ['secret'],
      sources: [],
      hintHistory: []
    };

    const error = new GuardError({
      decision: 'deny',
      reason: 'Secret blocked',
      guardFilter: 'data:secret',
      guardContext,
      guardInput
    });

    const result = await handleExecGuardDenial(error, { execEnv, env, whenExprNode: whenExpr });
    expect(result).not.toBeNull();
    const outputs = effects
      .getAll()
      .filter(effect => effect.type === 'both')
      .map(effect => effect.content.trim());
    expect(outputs).toContain('Guard input: sk-live-ctx');
    expect(outputs).toContain('Param value: sk-live-ctx');
  });

  it('materializes provenance-only guard inputs for denied handlers', async () => {
    const { env, execEnv, effects } = createEnv();
    const whenExpr = parseWhenExpression(`
/exe @process() = when [
  denied => "Guard input seen: @ctx.guard.input"
  * => "Process"
]
    `);

    const expressionValue = {
      text: 'trimmed-secret',
      toString() {
        return this.text;
      },
      toJSON() {
        return this.text;
      }
    };
    setExpressionProvenance(expressionValue, makeSecurityDescriptor({ labels: ['secret'] }));

    const error = new GuardError({
      decision: 'deny',
      reason: 'Secret blocked',
      guardFilter: 'data:secret',
      guardInput: expressionValue
    });

    const result = await handleExecGuardDenial(error, { execEnv, env, whenExprNode: whenExpr });
    expect(result).not.toBeNull();
    const injectedInput = execEnv.getVariable('input');
    expect(injectedInput?.ctx?.labels).toEqual(['secret']);
    expect(String(injectedInput?.value)).toContain('trimmed-secret');
  });

  it('formats guard warnings with fallback identifier', () => {
    expect(formatGuardWarning(undefined, 'op:show', null)).toBe(
      '[Guard Warning] Guard for op:show prevented operation due to policy violation'
    );
    expect(formatGuardWarning('Blocked', undefined, undefined)).toBe('[Guard Warning] Blocked');
  });
});
