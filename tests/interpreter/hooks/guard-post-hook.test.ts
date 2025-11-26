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
import { isVariable } from '@interpreter/utils/variable-resolution';
import { guardPostHook } from '@interpreter/hooks/guard-post-hook';
import type { PipelineContextSnapshot } from '@interpreter/env/ContextManager';

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

  it('chains allow transforms across after guards and preserves metadata', async () => {
    const env = createEnv();
    const guards = parseSync(`
/guard after @first for secret = when [ * => allow "step1" ]
/guard after @second for secret = when [
  @input == "step1" => allow "step2"
  * => deny "missing transform"
]
    `).filter(node => (node as DirectiveNode)?.kind === 'guard') as DirectiveNode[];
    for (const directive of guards) {
      await evaluateDirective(directive, env);
    }

    const outputVar = createSecretVariable('secretVar', 'original');
    const result = { value: outputVar, env };
    const node: ExecInvocation = {
      type: 'ExecInvocation',
      commandRef: { type: 'CommandReference', identifier: 'emit', args: [] }
    };

    const transformed = await guardPostHook(node, result, [outputVar], env, {
      type: 'exe',
      name: 'emit'
    });
    const finalValue = transformed.value;
    const finalVar = isVariable(finalValue) ? finalValue : undefined;

    expect((finalVar?.value ?? (isStructuredValue(finalValue) && finalValue.text) ?? finalValue)).toContain(
      'step2'
    );
    const ctx = (finalVar ?? (isStructuredValue(finalValue) ? (finalValue as any) : undefined))?.ctx;
  expect(ctx?.labels).toContain('secret');
  expect(Array.isArray(ctx?.sources) && ctx.sources.some((source: string) => source.includes('guard:first'))).toBe(
    true
  );
  });

  it('emits a retry signal for after guard retry decisions', async () => {
    const env = createEnv();
    const guardDirective = parseSync(
      '/guard after for secret = when [ * => retry "try again" ]'
    )[0] as DirectiveNode;
    await evaluateDirective(guardDirective, env);

    const outputVar = createSecretVariable('secretVar', 'needs-retry');
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
    expect(guardErr.decision).toBe('retry');
    expect(guardErr.retryHint ?? guardErr.reason ?? guardErr.details.reason).toMatch(/try again/i);
  });

  it('denies retry inside pipelines when the source is not retryable', async () => {
    const env = createEnv();
    const guardDirective = parseSync(
      '/guard after for secret = when [ * => retry "again" ]'
    )[0] as DirectiveNode;
    await evaluateDirective(guardDirective, env);

    const outputVar = createSecretVariable('secretVar', 'pipeline-output');
    const result = { value: outputVar, env };
    const node: ExecInvocation = {
      type: 'ExecInvocation',
      commandRef: { type: 'CommandReference', identifier: 'emit', args: [] }
    };
    const pipelineContext: PipelineContextSnapshot = {
      stage: 1,
      totalStages: 1,
      currentCommand: 'emit',
      input: 'input',
      previousOutputs: [],
      attemptCount: 1,
      attemptHistory: [],
      hint: null,
      hintHistory: [],
      sourceRetryable: false,
      guards: []
    };
    env.setPipelineContext(pipelineContext);

    await expect(
      guardPostHook(node, result, [outputVar], env, { type: 'exe', name: 'emit' })
    ).rejects.toBeInstanceOf(GuardError);

    env.clearPipelineContext();
  });

  it('suppresses nested guard evaluation invoked inside guard actions', async () => {
    const env = createEnv();
    const directives = parseSync(`
/exe @helper(value) = js {
  const val = value && typeof value === 'object' && 'value' in value ? value.value : value;
  return "helper:" + val;
}
/guard after @wrap for op:exe = when [ * => allow @helper(@output) ]
    `).filter(node => (node as DirectiveNode)?.kind === 'guard' || (node as DirectiveNode)?.kind === 'exe') as DirectiveNode[];

    for (const directive of directives) {
      await evaluateDirective(directive, env);
    }

    const outputVar = createSecretVariable('secretVar', 'raw');
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
    expect(String(rawValue)).toContain('helper:');
  });

  it('rejects after-guards when streaming is enabled', async () => {
    const env = createEnv();
    const guardDirective = parseSync(
      '/guard after for secret = when [ * => allow "ok" ]'
    )[0] as DirectiveNode;
    await evaluateDirective(guardDirective, env);

    const outputVar = createSecretVariable('secretVar', 'streaming-output');
    const result = { value: outputVar, env };
    const node: ExecInvocation = {
      type: 'ExecInvocation',
      commandRef: { type: 'CommandReference', identifier: 'emit', args: [] }
    };

    await expect(
      guardPostHook(node, result, [outputVar], env, {
        type: 'exe',
        name: 'emit',
        metadata: { streaming: true }
      })
    ).rejects.toBeInstanceOf(GuardError);
  });
});
