import { describe, expect, it } from 'vitest';
import { parseSync } from '@grammar/parser';
import type { DirectiveNode } from '@core/types';
import { GuardError } from '@core/errors/GuardError';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { Environment } from '@interpreter/env/Environment';
import { evaluateDirective } from '@interpreter/eval/directive';
import { createSimpleTextVariable } from '@core/types/variable';
import { makeSecurityDescriptor } from '@core/types/security';
import type {
  OperationContext,
  PipelineContextSnapshot
} from '@interpreter/env/ContextManager';
import { TestEffectHandler } from '@interpreter/env/EffectHandler';
import { guardPreHook } from '@interpreter/hooks/guard-pre-hook';

function createEnv(): Environment {
  const env = new Environment(new MemoryFileSystem(), new PathService(), '/');
  env.setEffectHandler(new TestEffectHandler());
  return env;
}

function createShowOperation(): OperationContext {
  return {
    type: 'show',
    subtype: 'effect',
    labels: ['op:show'],
    opLabels: ['op:show'],
    metadata: { effectName: 'show' }
  };
}

function createRetryablePipelineSnapshot(): PipelineContextSnapshot {
  return {
    stage: 1,
    totalStages: 1,
    currentCommand: 'stage-1',
    input: 'value',
    previousOutputs: [],
    format: undefined,
    attemptCount: 1,
    attemptHistory: [],
    hint: null,
    hintHistory: [],
    sourceRetryable: true
  };
}

function extractTextValue(value: unknown): string {
  const asAny = value as any;
  if (typeof asAny === 'string') {
    return asAny;
  }
  if (typeof asAny?.value?.text === 'string') {
    return asAny.value.text;
  }
  if (typeof asAny?.text === 'string') {
    return asAny.text;
  }
  if (typeof asAny?.value === 'string') {
    return asAny.value;
  }
  return String(asAny ?? '');
}

describe('guard-pre cross-module integration matrix', () => {
  it('combines retry, replacement, and env decisions across attempts', async () => {
    const env = createEnv();
    const retryAndReplace = parseSync(
      '/guard @retryReplace for secret = when [ @mx.guard.try < 2 => retry "retry-once" \n * => allow @prefixWith("masked", @output) ]'
    )[0] as DirectiveNode;
    const pickEnv = parseSync(
      '/guard @envChooser for op:show = when [ * => env @prefixWith("profile", @tagValue("before", @output, @input)) ]'
    )[0] as DirectiveNode;
    await evaluateDirective(retryAndReplace, env);
    await evaluateDirective(pickEnv, env);

    const secretInput = createSimpleTextVariable(
      'secretVar',
      'value',
      {
        directive: 'var',
        syntax: 'quoted',
        hasInterpolation: false,
        isMultiLine: false
      },
      {
        security: makeSecurityDescriptor({ labels: ['secret'] })
      }
    );
    env.setVariable('secretVar', secretInput);

    const directive = parseSync('/show @secretVar')[0] as DirectiveNode;
    const operation = createShowOperation();
    const pipelineSnapshot = createRetryablePipelineSnapshot();

    const firstDecision = await env.withPipeContext(
      pipelineSnapshot,
      async () => guardPreHook(directive, [secretInput], env, operation)
    );
    expect(firstDecision.action).toBe('retry');

    const secondDecision = await env.withPipeContext(
      pipelineSnapshot,
      async () => guardPreHook(directive, [secretInput], env, operation)
    );
    expect(secondDecision.action).toBe('continue');
    const transformed = (secondDecision.metadata?.transformedInputs as unknown[])[0];
    expect(extractTextValue(transformed)).toBe('masked:value');
    expect(secondDecision.metadata?.envGuard).toBe('envChooser');
    expect(secondDecision.metadata?.envConfig).toBe('profile:before:masked:value');
  });

  it('keeps final decision stable when override filtering changes guard selection', async () => {
    const env = createEnv();
    const denyA = parseSync(
      '/guard @ga for secret = when [ * => deny "blocked by ga" ]'
    )[0] as DirectiveNode;
    const denyB = parseSync(
      '/guard @gb for secret = when [ * => deny "blocked by gb" ]'
    )[0] as DirectiveNode;
    await evaluateDirective(denyA, env);
    await evaluateDirective(denyB, env);

    const secretInput = createSimpleTextVariable(
      'secretVar',
      'secret-value',
      {
        directive: 'var',
        syntax: 'quoted',
        hasInterpolation: false,
        isMultiLine: false
      },
      {
        security: makeSecurityDescriptor({ labels: ['secret'] })
      }
    );
    env.setVariable('secretVar', secretInput);

    const baseDirective = parseSync('/show @secretVar')[0] as DirectiveNode;
    const filteredDirective = parseSync(
      '/show @secretVar with { guards: { only: [@ga] } }'
    )[0] as DirectiveNode;
    const operation = createShowOperation();

    const baseDecision = await guardPreHook(baseDirective, [secretInput], env, operation);
    const filteredDecision = await guardPreHook(filteredDirective, [secretInput], env, operation);

    expect(baseDecision.action).toBe('abort');
    expect(filteredDecision.action).toBe('abort');

    const baseGuards = ((baseDecision.metadata?.guardResults as any[]) ?? []).map(
      result => result.guard?.name ?? result.guardName ?? null
    );
    const filteredGuards = ((filteredDecision.metadata?.guardResults as any[]) ?? []).map(
      result => result.guard?.name ?? result.guardName ?? null
    );
    expect(baseGuards).toEqual(['ga', 'gb']);
    expect(filteredGuards).toEqual(['ga']);
  });

  it('preserves helper-driven replacement while guard denial redacts secret previews', async () => {
    const env = createEnv();
    const helperTransform = parseSync(
      '/guard @helperPath for secret = when [ * => allow @prefixWith("safe", @tagValue("before", "token", @input)) ]'
    )[0] as DirectiveNode;
    const denySecret = parseSync(
      '/guard @denySecret for secret = when [ * => deny "blocked helper path" ]'
    )[0] as DirectiveNode;
    await evaluateDirective(helperTransform, env);
    await evaluateDirective(denySecret, env);

    const secretValue = 'sk-helper-secret-123';
    const secretInput = createSimpleTextVariable(
      'secretVar',
      secretValue,
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
    env.setVariable('secretVar', secretInput);

    const directive = parseSync('/show @secretVar')[0] as DirectiveNode;
    const operation = createShowOperation();
    const preDecision = await guardPreHook(directive, [secretInput], env, operation);

    expect(preDecision.action).toBe('abort');
    const transformed = (preDecision.metadata?.transformedInputs as unknown[])[0];
    expect(extractTextValue(transformed)).toBe('safe:before:token');

    await expect(evaluateDirective(directive, env)).rejects.toBeInstanceOf(GuardError);
    try {
      await evaluateDirective(directive, env);
    } catch (error) {
      const guardError = error as GuardError;
      const serialized = JSON.stringify(guardError.toJSON());
      expect(serialized).not.toContain(secretValue);
      expect(serialized).toContain('[REDACTED]');
    }
  });

  it('surfaces env-action validation errors through runtime evaluation with injected helpers', async () => {
    const env = createEnv();
    const explodeEnvConfig = parseSync(
      '/exe @explode() = js { throw new Error("boom-env-config"); }'
    )[0] as DirectiveNode;
    await evaluateDirective(explodeEnvConfig, env);

    const invalidEnvGuard = parseSync(
      '/guard @brokenEnv for secret = when [ @opIs("show") && @inputHas("secret") => env @explode() ]'
    )[0] as DirectiveNode;
    await evaluateDirective(invalidEnvGuard, env);

    env.setVariable(
      'secretVar',
      createSimpleTextVariable(
        'secretVar',
        'value',
        {
          directive: 'var',
          syntax: 'quoted',
          hasInterpolation: false,
          isMultiLine: false
        },
        {
          security: makeSecurityDescriptor({ labels: ['secret'] })
        }
      )
    );

    const directive = parseSync('/show @secretVar')[0] as DirectiveNode;
    await expect(evaluateDirective(directive, env)).rejects.toThrow(/boom-env-config/);
  });
});
