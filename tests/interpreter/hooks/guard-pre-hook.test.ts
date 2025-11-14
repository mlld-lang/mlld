import { describe, it, expect } from 'vitest';
import { parseSync } from '@grammar/parser';
import type { DirectiveNode } from '@core/types';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { Environment } from '@interpreter/env/Environment';
import { evaluateDirective } from '@interpreter/eval/directive';
import { createSimpleTextVariable } from '@core/types/variable';
import { makeSecurityDescriptor } from '@core/types/security';
import type { PipelineContextSnapshot } from '@interpreter/env/ContextManager';
import { TestEffectHandler } from '@interpreter/env/EffectHandler';

function createEnv(): Environment {
  return new Environment(new MemoryFileSystem(), new PathService(), '/');
}

describe('guard pre-hook integration', () => {
  it('denies per-input guard when labels match', async () => {
    const env = createEnv();
    const guardDirective = parseSync(
      '/guard for secret = when [ * => deny "blocked secret" ]'
    )[0] as DirectiveNode;
    await evaluateDirective(guardDirective, env);

    env.setVariable(
      'secretVar',
      createSimpleTextVariable(
        'secretVar',
        'hi',
        {
          directive: 'var',
          syntax: 'quoted',
          hasInterpolation: false,
          isMultiLine: false
        },
        {
          security: makeSecurityDescriptor({ labels: ['secret'], sources: ['test'] })
        }
      )
    );

    const directive = parseSync('/show @secretVar')[0] as DirectiveNode;
    await expect(evaluateDirective(directive, env)).rejects.toThrow(/blocked secret/);
  });

  it('applies per-operation guard helpers like @opIs', async () => {
    const env = createEnv();
    const guardDirective = parseSync(
      '/guard for op:show = when [ @input.any.ctx.labels.includes("secret") => deny "secret output blocked" \n * => allow ]'
    )[0] as DirectiveNode;
    await evaluateDirective(guardDirective, env);

    const source = {
      directive: 'var',
      syntax: 'quoted',
      hasInterpolation: false,
      isMultiLine: false
    } as const;
    env.setVariable(
      'secretVar',
      createSimpleTextVariable(
        'secretVar',
        'value',
        source,
        {
          security: makeSecurityDescriptor({ labels: ['secret'] })
        }
      )
    );

    const directive = parseSync('/show @secretVar')[0] as DirectiveNode;
    await expect(evaluateDirective(directive, env)).rejects.toThrow(/secret output blocked/);
  });

  it('rejects guard retry outside pipeline context', async () => {
    const env = createEnv();
    const guardDirective = parseSync(
      '/guard for op:show = when [ * => retry "need pipeline" ]'
    )[0] as DirectiveNode;
    await evaluateDirective(guardDirective, env);

    env.setVariable(
      'value',
      createSimpleTextVariable(
        'value',
        'hello',
        {
          directive: 'var',
          syntax: 'quoted',
          hasInterpolation: false,
          isMultiLine: false
        },
        {
          security: makeSecurityDescriptor()
        }
      )
    );

    const directive = parseSync('/show @value')[0] as DirectiveNode;
    await expect(evaluateDirective(directive, env)).rejects.toMatchObject({
      message: expect.stringContaining('guard retry requires pipeline context'),
      decision: 'deny'
    });
  });

  it('tracks guard retry attempts across pipeline retries', async () => {
    const env = createEnv();
    const guardDirective = parseSync(
      '/guard for op:show = when [ @ctx.guard.try < 2 => retry "try-again" \n * => deny "finished" ]'
    )[0] as DirectiveNode;
    await evaluateDirective(guardDirective, env);

    env.setVariable(
      'value',
      createSimpleTextVariable(
        'value',
        'hello',
        {
          directive: 'var',
          syntax: 'quoted',
          hasInterpolation: false,
          isMultiLine: false
        },
        {
          security: makeSecurityDescriptor()
        }
      )
    );

    const pipelineSnapshot: PipelineContextSnapshot = {
      stage: 2,
      totalStages: 3,
      currentCommand: 'stage-2',
      input: 'hello',
      previousOutputs: [],
      format: undefined,
      attemptCount: 1,
      attemptHistory: [],
      hint: null,
      hintHistory: [],
      sourceRetryable: true
    };

    const directive = parseSync('/show @value')[0] as DirectiveNode;

    await expect(
      env.withPipeContext(pipelineSnapshot, async () => evaluateDirective(directive, env))
    ).rejects.toMatchObject({
      decision: 'retry',
      retryHint: 'try-again'
    });

    await expect(
      env.withPipeContext(pipelineSnapshot, async () => evaluateDirective(directive, env))
    ).rejects.toMatchObject({
      decision: 'deny',
      message: expect.stringContaining('finished')
    });

    await expect(
      env.withPipeContext(pipelineSnapshot, async () => evaluateDirective(directive, env))
    ).rejects.toMatchObject({
      decision: 'retry',
      retryHint: 'try-again'
    });
  });
});
