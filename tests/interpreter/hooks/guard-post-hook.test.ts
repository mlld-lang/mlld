import { describe, it, expect } from 'vitest';
import { parseSync } from '@grammar/parser';
import type { DirectiveNode, ExecInvocation } from '@core/types';
import { GuardError } from '@core/errors/GuardError';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { Environment } from '@interpreter/env/Environment';
import { evaluateDirective } from '@interpreter/eval/directive';
import { createSimpleTextVariable } from '@core/types/variable';
import { makeSecurityDescriptor } from '@core/types/security';
import { TestEffectHandler } from '@interpreter/env/EffectHandler';
import { isStructuredValue } from '@interpreter/utils/structured-value';
import { guardPostHook } from '@interpreter/hooks/guard-post-hook';

function createEnv(): Environment {
  const env = new Environment(new MemoryFileSystem(), new PathService(), '/');
  env.setEffectHandler(new TestEffectHandler());
  return env;
}

function createSecretVariable(name: string, value: string) {
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

describe('guard post-hook integration', () => {
  it('denies after guards and exposes output context', async () => {
    const env = createEnv();
    const guardDirective = parseSync(
      '/guard after for secret = when [ * => deny "after blocked" ]'
    )[0] as DirectiveNode;
    await evaluateDirective(guardDirective, env);

    const outputVar = createSecretVariable('secretVar', 'after-secret');
    const result = { value: outputVar, env };
    const node: ExecInvocation = {
      type: 'ExecInvocation',
      commandRef: { type: 'CommandReference', identifier: 'emit', args: [] }
    };

    let error: unknown;
    try {
      await guardPostHook(node, result, [outputVar], env, { type: 'exe', name: 'emit' });
    } catch (err) {
      error = err;
    }

    expect(error).toBeInstanceOf(GuardError);
    const guardErr = error as GuardError;
    expect(guardErr.details.timing).toBe('after');
    expect(guardErr.details.outputPreview).toContain('after-secret');
    expect((guardErr.details.guardContext as any)?.timing).toBe('after');
    expect((guardErr.details.guardContext as any)?.output).toBeTruthy();
  });

  it('applies allow @value transforms in after guards to outputs', async () => {
    const env = createEnv();
    const guardDirective = parseSync(
      '/guard after for secret = when [ * => allow "sanitized-output" ]'
    )[0] as DirectiveNode;
    await evaluateDirective(guardDirective, env);

    const outputVar = createSecretVariable('secretVar', 'raw-output');
    const result = { value: outputVar, env };
    const node: ExecInvocation = {
      type: 'ExecInvocation',
      commandRef: { type: 'CommandReference', identifier: 'emit', args: [] }
    };

    const transformed = await guardPostHook(node, result, [outputVar], env, {
      type: 'exe',
      name: 'emit'
    });
    const rawValue =
      (isStructuredValue(transformed.value) && transformed.value.text) ||
      ((transformed.value as any)?.value ?? transformed.value);
    expect(String(rawValue)).toContain('sanitized-output');
  });
});
