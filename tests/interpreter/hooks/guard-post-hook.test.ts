import { describe, it, expect } from 'vitest';
import { parseSync } from '@grammar/parser';
import type { DirectiveNode, ExecInvocation } from '@core/types';
import { GuardError } from '@core/errors/GuardError';
import { MlldSecurityError } from '@core/errors';
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

function createLabeledVariable(name: string, value: string, labels: string[]) {
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
      security: makeSecurityDescriptor({ labels, sources: ['test'] })
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

  it('applies label additions from after guards', async () => {
    const env = createEnv();
    const guardDirective = parseSync(
      '/guard after @bless for secret = when [ * => allow with { addLabels: ["blessed"] } ]'
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
    const finalValue = transformed.value;
    const finalVar = isVariable(finalValue) ? finalValue : undefined;
    const mx = (finalVar ?? (isStructuredValue(finalValue) ? finalValue : undefined))?.mx;

    expect(mx?.labels).toEqual(expect.arrayContaining(['secret', 'blessed']));
    expect(mx?.taint).toEqual(expect.arrayContaining(['blessed']));
  });

  it('blocks protected label removal for non-privileged after guards', async () => {
    const env = createEnv();
    const guardDirective = parseSync(
      '/guard after @bless for secret = when [ * => allow with { removeLabels: ["src:mcp"] } ]'
    )[0] as DirectiveNode;
    await evaluateDirective(guardDirective, env);

    const outputVar = createSimpleTextVariable(
      'secretVar',
      'raw-output',
      {
        directive: 'var',
        syntax: 'quoted',
        hasInterpolation: false,
        isMultiLine: false
      },
      {
        security: makeSecurityDescriptor({
          labels: ['secret'],
          taint: ['src:mcp'],
          sources: ['mcp:test']
        })
      }
    );
    const result = { value: outputVar, env };
    const node: ExecInvocation = {
      type: 'ExecInvocation',
      commandRef: { type: 'CommandReference', identifier: 'emit', args: [] }
    };

    await expect(
      guardPostHook(node, result, [outputVar], env, { type: 'exe', name: 'emit' })
    ).rejects.toBeInstanceOf(MlldSecurityError);
  });

  it('allows privileged after guards to remove protected labels', async () => {
    const env = createEnv();
    const guardDirective = parseSync(
      '/guard after @bless for secret = when [ * => allow with { removeLabels: ["src:mcp"] } ]'
    )[0] as DirectiveNode;
    await evaluateDirective(guardDirective, env);

    const guardDef = env.getGuardRegistry().getByName('bless');
    expect(guardDef).toBeTruthy();
    if (guardDef) {
      guardDef.privileged = true;
    }

    const outputVar = createSimpleTextVariable(
      'secretVar',
      'raw-output',
      {
        directive: 'var',
        syntax: 'quoted',
        hasInterpolation: false,
        isMultiLine: false
      },
      {
        security: makeSecurityDescriptor({
          labels: ['secret'],
          taint: ['src:mcp'],
          sources: ['mcp:test']
        })
      }
    );
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
    const mx = (finalVar ?? (isStructuredValue(finalValue) ? finalValue : undefined))?.mx;
    expect(mx?.taint).not.toEqual(expect.arrayContaining(['src:mcp']));
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
    const mx = (finalVar ?? (isStructuredValue(finalValue) ? (finalValue as any) : undefined))?.mx;
  expect(mx?.labels).toContain('secret');
  expect(Array.isArray(mx?.sources) && mx.sources.some((source: string) => source.includes('guard:first'))).toBe(
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

  it('preserves retry payload shapes for retryable and non-retryable pipeline sources', async () => {
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

    const runWithRetryable = async (sourceRetryable: boolean): Promise<GuardError> => {
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
        sourceRetryable,
        guards: []
      };
      env.setPipelineContext(pipelineContext);

      let caught: unknown;
      try {
        await guardPostHook(node, result, [outputVar], env, { type: 'exe', name: 'emit' });
      } catch (error) {
        caught = error;
      } finally {
        env.clearPipelineContext();
      }

      expect(caught).toBeInstanceOf(GuardError);
      return caught as GuardError;
    };

    const retryError = await runWithRetryable(true);
    expect(retryError.decision).toBe('retry');
    expect(retryError.details.timing).toBe('after');
    expect(retryError.details.reasons).toEqual(expect.arrayContaining(['again']));
    expect(Array.isArray(retryError.details.hints)).toBe(true);
    expect(Array.isArray(retryError.details.guardResults)).toBe(true);

    const deniedError = await runWithRetryable(false);
    expect(deniedError.decision).toBe('deny');
    expect(deniedError.details.reason).toMatch(/Cannot retry/i);
    expect(deniedError.details.retryHint).toMatch(/again/i);
    expect(deniedError.details.reasons).toEqual(expect.arrayContaining(['again']));
    expect(Array.isArray(deniedError.details.hints)).toBe(true);
    expect(Array.isArray(deniedError.details.guardResults)).toBe(true);
  });

  it('enforces retryability consistently when retry is requested after output transformation', async () => {
    const env = createEnv();
    const guards = parseSync(`
/guard after @step for secret = when [ * => allow "step1" ]
/guard after @retry for secret = when [ * => retry "retry after transform" ]
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

    const runWithRetryable = async (sourceRetryable: boolean): Promise<GuardError> => {
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
        sourceRetryable,
        guards: []
      };
      env.setPipelineContext(pipelineContext);

      let caught: unknown;
      try {
        await guardPostHook(node, result, [outputVar], env, { type: 'exe', name: 'emit' });
      } catch (error) {
        caught = error;
      } finally {
        env.clearPipelineContext();
      }

      expect(caught).toBeInstanceOf(GuardError);
      return caught as GuardError;
    };

    const retrySignal = await runWithRetryable(true);
    expect(retrySignal.decision).toBe('retry');
    expect(retrySignal.details.outputPreview ?? '').toContain('step1');
    expect(retrySignal.details.reasons).toEqual(expect.arrayContaining(['retry after transform']));

    const deniedRetry = await runWithRetryable(false);
    expect(deniedRetry.decision).toBe('deny');
    expect(deniedRetry.details.reason).toMatch(/Cannot retry/i);
    expect(deniedRetry.details.outputPreview ?? '').toContain('step1');
    expect(deniedRetry.details.reasons).toEqual(expect.arrayContaining(['retry after transform']));
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

  it('uses input fallback selection when output labels do not match any after-guard', async () => {
    const env = createEnv();
    const guardDirective = parseSync(
      '/guard after for secret = when [ * => deny "blocked via input fallback" ]'
    )[0] as DirectiveNode;
    await evaluateDirective(guardDirective, env);

    const outputVar = createLabeledVariable('outputVar', 'public-output', ['public']);
    const inputVar = createSecretVariable('secretInput', 'secret-input');
    const result = { value: outputVar, env };
    const node: ExecInvocation = {
      type: 'ExecInvocation',
      commandRef: { type: 'CommandReference', identifier: 'emit', args: [] }
    };

    await expect(
      guardPostHook(node, result, [inputVar], env, { type: 'exe', name: 'emit' })
    ).rejects.toMatchObject({
      details: {
        reasons: expect.arrayContaining(['blocked via input fallback'])
      }
    });
  });

  it('prefers output-label selection over input fallback when output already matches', async () => {
    const env = createEnv();
    const outputGuard = parseSync(
      '/guard after @outputPath for secret = when [ * => deny "blocked via output labels" ]'
    )[0] as DirectiveNode;
    const inputGuard = parseSync(
      '/guard after @inputPath for confidential = when [ * => deny "blocked via input labels" ]'
    )[0] as DirectiveNode;
    await evaluateDirective(outputGuard, env);
    await evaluateDirective(inputGuard, env);

    const outputVar = createSecretVariable('secretOutput', 'output-secret');
    const inputVar = createLabeledVariable('confidentialInput', 'input-secret', ['confidential']);
    const result = { value: outputVar, env };
    const node: ExecInvocation = {
      type: 'ExecInvocation',
      commandRef: { type: 'CommandReference', identifier: 'emit', args: [] }
    };

    await expect(
      guardPostHook(node, result, [inputVar], env, { type: 'exe', name: 'emit' })
    ).rejects.toMatchObject({
      details: {
        reasons: expect.arrayContaining(['blocked via output labels'])
      }
    });
  });

  it('selects operation-label guards even when output labels do not match', async () => {
    const env = createEnv();
    const guardDirective = parseSync(
      '/guard after @opPublish for op:publish = when [ * => deny "operation label blocked" ]'
    )[0] as DirectiveNode;
    await evaluateDirective(guardDirective, env);

    const outputVar = createLabeledVariable('publicOutput', 'ok', ['public']);
    const result = { value: outputVar, env };
    const node: ExecInvocation = {
      type: 'ExecInvocation',
      commandRef: { type: 'CommandReference', identifier: 'emit', args: [] }
    };

    await expect(
      guardPostHook(node, result, [outputVar], env, {
        type: 'exe',
        name: 'emit',
        opLabels: ['publish']
      })
    ).rejects.toMatchObject({
      details: {
        reasons: expect.arrayContaining(['operation label blocked'])
      }
    });
  });

  it('keeps deny precedence when retry and deny actions both match', async () => {
    const env = createEnv();
    const retryGuard = parseSync(
      '/guard after @retryFirst for secret = when [ * => retry "retry requested" ]'
    )[0] as DirectiveNode;
    const denyGuard = parseSync(
      '/guard after @denySecond for secret = when [ * => deny "deny wins" ]'
    )[0] as DirectiveNode;
    await evaluateDirective(retryGuard, env);
    await evaluateDirective(denyGuard, env);

    const outputVar = createSecretVariable('secretVar', 'post-output');
    const result = { value: outputVar, env };
    const node: ExecInvocation = {
      type: 'ExecInvocation',
      commandRef: { type: 'CommandReference', identifier: 'emit', args: [] }
    };

    await expect(
      guardPostHook(node, result, [outputVar], env, { type: 'exe', name: 'emit' })
    ).rejects.toMatchObject({
      decision: 'deny',
      details: {
        reasons: expect.arrayContaining(['retry requested', 'deny wins'])
      }
    });
  });

  it('keeps retry behavior when pipeline source is retryable', async () => {
    const env = createEnv();
    const guardDirective = parseSync(
      '/guard after for secret = when [ * => retry "retry allowed" ]'
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
      sourceRetryable: true,
      guards: []
    };
    env.setPipelineContext(pipelineContext);

    await expect(
      guardPostHook(node, result, [outputVar], env, { type: 'exe', name: 'emit' })
    ).rejects.toMatchObject({
      decision: 'retry',
      retryHint: expect.stringMatching(/retry allowed/i)
    });

    env.clearPipelineContext();
  });

  it('propagates descriptor and label modifications for transformed outputs', async () => {
    const env = createEnv();
    const guardDirective = parseSync(
      '/guard after @sanitize for secret = when [ * => allow "masked-output" with { addLabels: ["sanitized"] } ]'
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

    expect(isStructuredValue(transformed.value)).toBe(true);
    const structured = transformed.value as any;
    expect(structured.text).toContain('masked-output');
    expect(structured.mx?.labels).toEqual(expect.arrayContaining(['secret', 'sanitized']));
    expect(structured.mx?.taint).toEqual(expect.arrayContaining(['sanitized']));
  });

  it('keeps transformed-output retry enforcement parity across multi-guard after flows', async () => {
    const env = createEnv();
    const guards = parseSync(`
/guard after @sanitize for secret = when [ * => allow "step1" with { addLabels: ["sanitized"] } ]
/guard after @retry for secret = when [ @input == "step1" => retry "retry-after-transform" ]
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

    let error: unknown;
    try {
      await guardPostHook(node, result, [outputVar], env, {
        type: 'exe',
        name: 'emit',
        opLabels: ['op:emit']
      });
    } catch (caught) {
      error = caught;
    } finally {
      env.clearPipelineContext();
    }

    expect(error).toBeInstanceOf(GuardError);
    const guardError = error as GuardError;
    expect(guardError.decision).toBe('deny');
    expect(guardError.details.reason).toMatch(/Cannot retry/i);
    expect(guardError.details.reasons).toEqual(expect.arrayContaining(['retry-after-transform']));
    expect(guardError.details.outputPreview ?? '').toContain('step1');
  });

  it('keeps output-selection precedence stable when guard registration order changes', async () => {
    const runScenario = async (directives: string[]) => {
      const env = createEnv();
      for (const source of directives) {
        await evaluateDirective(parseSync(source)[0] as DirectiveNode, env);
      }

      const outputVar = createSecretVariable('secretOutput', 'output-secret');
      const inputVar = createLabeledVariable('confidentialInput', 'input-secret', ['confidential']);
      const result = { value: outputVar, env };
      const node: ExecInvocation = {
        type: 'ExecInvocation',
        commandRef: { type: 'CommandReference', identifier: 'emit', args: [] }
      };

      await expect(
        guardPostHook(node, result, [inputVar], env, { type: 'exe', name: 'emit' })
      ).rejects.toMatchObject({
        decision: 'deny',
        details: {
          reasons: expect.arrayContaining(['blocked via output labels'])
        }
      });
    };

    await runScenario([
      '/guard after @outputPath for secret = when [ * => deny "blocked via output labels" ]',
      '/guard after @inputPath for confidential = when [ * => deny "blocked via input labels" ]'
    ]);

    await runScenario([
      '/guard after @inputPath for confidential = when [ * => deny "blocked via input labels" ]',
      '/guard after @outputPath for secret = when [ * => deny "blocked via output labels" ]'
    ]);
  });

  it('propagates label modifications into both deny and retry guard contexts', async () => {
    const runDecision = async (
      decisionGuardSource: string,
      sourceRetryable: boolean
    ): Promise<GuardError> => {
      const env = createEnv();
      const directives = parseSync(`
/guard after @mark for secret = when [ * => allow with { addLabels: ["sanitized"] } ]
${decisionGuardSource}
      `).filter(node => (node as DirectiveNode)?.kind === 'guard') as DirectiveNode[];
      for (const directive of directives) {
        await evaluateDirective(directive, env);
      }

      const outputVar = createSecretVariable('secretVar', 'raw-output');
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
        sourceRetryable,
        guards: []
      };
      env.setPipelineContext(pipelineContext);

      let error: unknown;
      try {
        await guardPostHook(node, result, [outputVar], env, { type: 'exe', name: 'emit' });
      } catch (caught) {
        error = caught;
      } finally {
        env.clearPipelineContext();
      }

      expect(error).toBeInstanceOf(GuardError);
      return error as GuardError;
    };

    const denyError = await runDecision(
      '/guard after @deny for secret = when [ * => deny "blocked after label update" ]',
      false
    );
    const denyTrace = (denyError.details.guardResults ?? []) as Array<{ decision?: string; metadata?: any }>;
    const denyEntry = denyTrace.find(entry => entry.decision === 'deny');
    expect(denyEntry?.metadata?.guardContext?.labels ?? []).toEqual(
      expect.arrayContaining(['secret', 'sanitized'])
    );

    const retryError = await runDecision(
      '/guard after @retry for secret = when [ * => retry "retry after label update" ]',
      true
    );
    const retryTrace = (retryError.details.guardResults ?? []) as Array<{ decision?: string; metadata?: any }>;
    const retryEntry = retryTrace.find(entry => entry.decision === 'retry');
    expect(retryError.decision).toBe('retry');
    expect(retryEntry?.metadata?.guardContext?.labels ?? []).toEqual(
      expect.arrayContaining(['secret', 'sanitized'])
    );
  });

  it('supports runtime action blocks with after-helper injection in integration flows', async () => {
    const env = createEnv();
    const guardDirective = parseSync(`
/guard after @helperFlow for secret = when [
  @opIs("exe") && @opHas("op:emit") && @inputHas("secret")
    => allow @prefixWith("helper", @tagValue("after", @output, @input))
  * => deny "helper integration failed"
]
    `).filter(node => (node as DirectiveNode)?.kind === 'guard')[0] as DirectiveNode;
    await evaluateDirective(guardDirective, env);

    const outputVar = createSecretVariable('secretVar', 'raw-output');
    const result = { value: outputVar, env };
    const node: ExecInvocation = {
      type: 'ExecInvocation',
      commandRef: { type: 'CommandReference', identifier: 'emit', args: [] }
    };

    const transformed = await guardPostHook(node, result, [outputVar], env, {
      type: 'exe',
      name: 'emit',
      opLabels: ['op:emit']
    });
    const rawValue =
      (isStructuredValue(transformed.value) && transformed.value.text) ||
      ((transformed.value as any)?.value ?? transformed.value);
    expect(String(rawValue)).toContain('helper:after:raw-output');
  });
});
