import { describe, expect, it, vi } from 'vitest';
import { parseSync } from '@grammar/parser';
import { isDirectiveNode, type DirectiveNode } from '@core/types';
import { MlldWhenExpressionError } from '@core/errors';
import type { Variable } from '@core/types/variable';
import { createSimpleTextVariable } from '@core/types/variable';
import { makeSecurityDescriptor } from '@core/types/security';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import type { OperationContext } from '@interpreter/env/ContextManager';
import { Environment } from '@interpreter/env/Environment';
import { TestEffectHandler } from '@interpreter/env/EffectHandler';
import { evaluateDirective } from '@interpreter/eval/directive';
import { evaluateGuardBlock } from '@interpreter/hooks/guard-block-evaluator';
import { guardPreHook } from '@interpreter/hooks/guard-pre-hook';
import { evaluateGuardReplacement, resolveGuardEnvConfig } from '@interpreter/hooks/guard-action-evaluator';
import * as interpreterCore from '@interpreter/core/interpreter';

function createEnv(): Environment {
  const env = new Environment(new MemoryFileSystem(), new PathService(), '/');
  env.setEffectHandler(new TestEffectHandler());
  return env;
}

function createSecretInput(name: string, value: string): Variable {
  return createSimpleTextVariable(
    name,
    value,
    {
      directive: 'var',
      syntax: 'quoted',
      hasInterpolation: false,
      isMultiLine: false
    },
    {
      security: makeSecurityDescriptor({ labels: ['secret'], sources: ['test'] })
    }
  );
}

function asVariableText(value: unknown): string {
  if (!value || typeof value !== 'object') {
    return String(value ?? '');
  }
  const variable = value as { value?: unknown };
  return String(variable.value ?? '');
}

describe('guard block/action evaluator integration slices', () => {
  it('supports replacement + env config in the same pre-hook evaluation path', async () => {
    const env = createEnv();
    const directives = parseSync(`
/guard @rewrite for secret = when [
  let @sanitized = "echo cleaned"
  @sanitized == "echo cleaned" => allow "echo cleaned"
  * => deny "sanitized guard setup failed"
]
/guard @pickEnv for op:run = when [
  * => env "sandbox-profile"
]
    `).filter(isDirectiveNode) as DirectiveNode[];

    for (const directive of directives) {
      await evaluateDirective(directive, env);
    }

    const runDirective = parseSync('/run {echo raw-secret}')[0] as DirectiveNode;
    const inputVariable = createSecretInput('input', 'echo raw-secret');
    const operation: OperationContext = {
      type: 'run',
      subtype: 'runCommand',
      opLabels: ['op:cmd'],
      metadata: { runSubtype: 'runCommand' }
    };

    const decision = await guardPreHook(runDirective, [inputVariable], env, operation);
    const guardResults = decision.metadata?.guardResults as Array<{ decision: string }> | undefined;
    const transformedInputs = decision.metadata?.transformedInputs as Variable[] | undefined;

    expect(decision.action).toBe('continue');
    expect(decision.metadata?.envGuard).toBe('pickEnv');
    expect(decision.metadata?.envConfig).toBe('sandbox-profile');
    expect(guardResults?.map(entry => entry.decision)).toEqual(['allow', 'env']);
    expect(transformedInputs).toHaveLength(1);
    expect(asVariableText(transformedInputs?.[0])).toBe('echo cleaned');
  });

  it('keeps let and augmented replacement flows aligned on downstream value', async () => {
    const letEnv = createEnv();
    const letEffects = letEnv.getEffectHandler() as TestEffectHandler;
    const letDirective = parseSync(`
/guard @letFlow for secret = when [
  let @replacement = "scrubbed"
  @replacement == "scrubbed" => allow "scrubbed"
  * => deny "let setup failed"
]`).filter(isDirectiveNode)[0] as DirectiveNode;
    await evaluateDirective(letDirective, letEnv);
    letEnv.setVariable('secretVar', createSecretInput('secretVar', 'raw-secret'));
    await evaluateDirective(parseSync('/show @secretVar')[0] as DirectiveNode, letEnv);
    const letOutput = letEffects.getOutput().trim();

    const augmentedEnv = createEnv();
    const guardDirectives = parseSync(`
/guard @augTemplate for secret = when [
  let @replacement = "scrub"
  @replacement == "scrubbed" => allow "scrubbed"
  * => deny "augmented setup failed"
]
/guard @rhsSource for secret = when [
  let @rhs = "bed"
  * => allow "ok"
]`).filter(isDirectiveNode) as DirectiveNode[];
    for (const directive of guardDirectives) {
      await evaluateDirective(directive, augmentedEnv);
    }

    const guard = augmentedEnv.getGuardRegistry().getByName('augTemplate');
    const rhsGuard = augmentedEnv.getGuardRegistry().getByName('rhsSource');
    expect(guard).toBeDefined();
    expect(rhsGuard).toBeDefined();
    if (!guard || !rhsGuard) {
      return;
    }

    const letEntry = guard.block.rules[0] as any;
    const conditionAndFallback = guard.block.rules.slice(1);
    const rhsValue = (rhsGuard.block.rules[0] as any).value;
    const augmentedEntry = {
      ...letEntry,
      type: 'AugmentedAssignment',
      operator: '+=',
      value: rhsValue
    };
    const augmentedBlock = {
      ...guard.block,
      rules: [letEntry, augmentedEntry, ...conditionAndFallback]
    };

    const action = await evaluateGuardBlock(augmentedBlock as any, augmentedEnv.createChild());
    expect(action?.decision).toBe('allow');

    const replacement = await evaluateGuardReplacement(
      action,
      augmentedEnv.createChild(),
      guard,
      createSecretInput('secretVar', 'raw-secret')
    );

    expect(letOutput).toBe('scrubbed');
    expect(asVariableText(replacement)).toBe('scrubbed');
  });

  it('handles label-modification-only paths without text replacement drift', async () => {
    const env = createEnv();
    const guardDirective = parseSync(
      '/guard @labelOnly for secret = when [ * => allow with { addLabels: ["blessed"] } ]'
    )[0] as DirectiveNode;
    await evaluateDirective(guardDirective, env);

    const showDirective = parseSync('/show @secretVar')[0] as DirectiveNode;
    const inputVariable = createSecretInput('secretVar', 'raw-secret');
    const operation: OperationContext = {
      type: 'show',
      subtype: 'show'
    };

    const decision = await guardPreHook(showDirective, [inputVariable], env, operation);
    const guardResults = decision.metadata?.guardResults as Array<{
      decision: string;
      replacement?: Variable;
    }> | undefined;
    const replacement = guardResults?.[0]?.replacement;

    expect(decision.action).toBe('continue');
    expect(guardResults?.[0]?.decision).toBe('allow');
    expect(replacement).toBeDefined();
    expect(asVariableText(replacement)).toBe('raw-secret');
  });
});

describe('guard action helper failures', () => {
  it('preserves replacement-evaluation errors and locations', async () => {
    const env = createEnv();
    env.setCurrentFilePath('/tmp/replacement-failure.mld');

    const guardDirective = parseSync(
      '/guard @replacementFail for secret = when [ * => allow "clean" ]'
    )[0] as DirectiveNode;
    await evaluateDirective(guardDirective, env);
    const guard = env.getGuardRegistry().getByName('replacementFail');
    expect(guard).toBeDefined();
    if (!guard) {
      return;
    }

    const action = guard.block.rules[0]?.action;
    expect(action).toBeDefined();
    if (!action) {
      return;
    }

    const location = {
      filePath: '/tmp/replacement-failure.mld',
      line: 4,
      column: 3
    };
    const expected = new MlldWhenExpressionError(
      'replacement failure',
      location,
      undefined,
      { env }
    );
    const evaluateSpy = vi
      .spyOn(interpreterCore, 'evaluate')
      .mockRejectedValue(expected);

    try {
      await expect(
        evaluateGuardReplacement(
          action,
          env,
          guard,
          createSecretInput('secretVar', 'raw-secret')
        )
      ).rejects.toBe(expected);
    } finally {
      evaluateSpy.mockRestore();
    }
  });

  it('throws MlldWhenExpressionError with source location when env config is missing', async () => {
    const env = createEnv();
    env.setCurrentFilePath('/tmp/env-config-failure.mld');

    const guardDirective = parseSync(
      '/guard @envGuard for op:run = when [ * => env "profile-a" ]'
    )[0] as DirectiveNode;
    await evaluateDirective(guardDirective, env);
    const guard = env.getGuardRegistry().getByName('envGuard');
    expect(guard).toBeDefined();
    if (!guard) {
      return;
    }

    const baseAction = guard.block.rules[0]?.action as any;
    const malformedAction = {
      ...baseAction,
      value: [],
      location: {
        start: { offset: 15, line: 3, column: 9 },
        end: { offset: 18, line: 3, column: 12 }
      }
    };

    let thrown: unknown;
    try {
      await resolveGuardEnvConfig(malformedAction, env);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(MlldWhenExpressionError);
    const mlldError = thrown as MlldWhenExpressionError & {
      sourceLocation?: { filePath?: string; line?: number; column?: number };
    };
    expect(mlldError.sourceLocation?.filePath).toBe('/tmp/env-config-failure.mld');
    expect(typeof mlldError.sourceLocation?.line).toBe('number');
    expect(typeof mlldError.sourceLocation?.column).toBe('number');
  });
});
