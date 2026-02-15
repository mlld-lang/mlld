import { describe, it, expect, vi } from 'vitest';
import { parseSync } from '@grammar/parser';
import type { DirectiveNode, ExecInvocation } from '@core/types';
import type { WhenExpressionNode } from '@core/types/when';
import { GuardError } from '@core/errors/GuardError';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { Environment } from '@interpreter/env/Environment';
import { evaluateDirective } from '@interpreter/eval/directive';
import { createSimpleTextVariable } from '@core/types/variable';
import { makeSecurityDescriptor } from '@core/types/security';
import type { PipelineContextSnapshot } from '@interpreter/env/ContextManager';
import { TestEffectHandler } from '@interpreter/env/EffectHandler';
import { handleExecGuardDenial } from '@interpreter/eval/guard-denial-handler';
import { evaluateExecInvocation } from '@interpreter/eval/exec-invocation';
import { isStructuredValue } from '@interpreter/utils/structured-value';
import { guardPreHook } from '@interpreter/hooks/guard-pre-hook';
import type { OperationContext } from '@interpreter/env/ContextManager';

function createEnv(): Environment {
  const env = new Environment(new MemoryFileSystem(), new PathService(), '/');
  env.setEffectHandler(new TestEffectHandler());
  return env;
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

  it('aggregates reasons from multiple matching guards', async () => {
    const env = createEnv();
    const guardDirectiveA = parseSync(
      '/guard @ga for secret = when [ * => deny "first deny" ]'
    )[0] as DirectiveNode;
    const guardDirectiveB = parseSync(
      '/guard @gb for secret = when [ * => deny "second deny" ]'
    )[0] as DirectiveNode;
    await evaluateDirective(guardDirectiveA, env);
    await evaluateDirective(guardDirectiveB, env);

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
    await expect(evaluateDirective(directive, env)).rejects.toMatchObject({
      details: {
        reasons: ['first deny', 'second deny']
      }
    });
  });

  it('evaluates per-input guards before per-operation guards in registration order', async () => {
    const env = createEnv();
    const perInputOne = parseSync(
      '/guard @inputOne for secret = when [ * => deny "input-one" ]'
    )[0] as DirectiveNode;
    const perInputTwo = parseSync(
      '/guard @inputTwo for secret = when [ * => deny "input-two" ]'
    )[0] as DirectiveNode;
    const perOperation = parseSync(
      '/guard @operationOne for op:show = when [ * => deny "operation-one" ]'
    )[0] as DirectiveNode;
    await evaluateDirective(perInputOne, env);
    await evaluateDirective(perInputTwo, env);
    await evaluateDirective(perOperation, env);

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
    await expect(evaluateDirective(directive, env)).rejects.toMatchObject({
      details: {
        reasons: ['input-one', 'input-two', 'operation-one']
      }
    });
  });

  it('exposes guard trace and hints in guard context on denial', async () => {
    const env = createEnv();
    const guardDirectiveA = parseSync(
      '/guard @ga for secret = when [ * => deny "first reason" ]'
    )[0] as DirectiveNode;
    const guardDirectiveB = parseSync(
      '/guard @gb for secret = when [ * => deny "second reason" ]'
    )[0] as DirectiveNode;
    await evaluateDirective(guardDirectiveA, env);
    await evaluateDirective(guardDirectiveB, env);

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
    let error: unknown;
    try {
      await evaluateDirective(directive, env);
    } catch (err) {
      error = err;
    }
    expect(error).toBeInstanceOf(GuardError);
    const guardCtx = (error as GuardError).details.guardContext as any;
    expect(Array.isArray(guardCtx?.trace)).toBe(true);
    expect(guardCtx.trace).toHaveLength(2);
    expect(guardCtx.reasons).toEqual(['first reason', 'second reason']);
    expect(Array.isArray(guardCtx.hints)).toBe(true);
  });

  it('records guard history when pipeline context is active', async () => {
    const env = createEnv();
    env.resetPipelineGuardHistory();
    const guardDirective = parseSync(
      '/guard @ga for secret = when [ * => deny "blocked in pipeline" ]'
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

    const pipelineContext: PipelineContextSnapshot = {
      stage: 1,
      totalStages: 1,
      currentCommand: 'manual',
      input: '',
      previousOutputs: [],
      format: undefined,
      attemptCount: 1,
      attemptHistory: [],
      hint: null,
      hintHistory: [],
      sourceRetryable: false,
      guards: env.getPipelineGuardHistory()
    };

    env.setPipelineContext(pipelineContext);
    try {
      await evaluateDirective(parseSync('/show @secretVar')[0] as DirectiveNode, env);
    } catch (err) {
      expect(err).toBeInstanceOf(GuardError);
    } finally {
      env.clearPipelineContext();
    }

    const history = env.getPipelineGuardHistory();
    expect(Array.isArray(history)).toBe(true);
    expect(history.length).toBe(1);
    expect(history[0]?.decision).toBe('deny');
    expect(history[0]?.trace.length).toBe(1);
  });

  it('warns and disables guards when with { guards: false } is set', async () => {
    const env = createEnv();
    const effects = env.getEffectHandler() as TestEffectHandler;
    const guardDirective = parseSync(
      '/guard @denySecret for secret = when [ * => deny "blocked secret" ]'
    )[0] as DirectiveNode;
    await evaluateDirective(guardDirective, env);

    env.setVariable(
      'secretVar',
      createSimpleTextVariable(
        'secretVar',
        'hidden',
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

    const directive = parseSync('/show @secretVar with { guards: false }')[0] as DirectiveNode;
    await expect(evaluateDirective(directive, env)).resolves.toBeDefined();
    expect(effects.getOutput().trim()).toBe('hidden');
    expect(effects.getErrors()).toContain(
      '[Guard Override] All guards disabled for this operation'
    );
  });

  it('applies guard-only overrides to skip guards not listed', async () => {
    const env = createEnv();
    const guardAllow = parseSync('/guard @ga for secret = when [ * => allow ]')[0] as DirectiveNode;
    const guardDeny = parseSync(
      '/guard @gb for secret = when [ * => deny "blocked by gb" ]'
    )[0] as DirectiveNode;
    await evaluateDirective(guardAllow, env);
    await evaluateDirective(guardDeny, env);

    env.setVariable(
      'secretVar',
      createSimpleTextVariable(
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
      )
    );

    const directive = parseSync(
      '/show @secretVar with { guards: { only: ["@ga"] } }'
    )[0] as DirectiveNode;
    await expect(evaluateDirective(directive, env)).resolves.toBeDefined();
  });

  it('applies guard-except overrides to skip listed guards', async () => {
    const env = createEnv();
    const effects = env.getEffectHandler() as TestEffectHandler;
    const guardAllow = parseSync('/guard @ga for secret = when [ * => allow ]')[0] as DirectiveNode;
    const guardDeny = parseSync(
      '/guard @gb for secret = when [ * => deny "blocked by gb" ]'
    )[0] as DirectiveNode;
    await evaluateDirective(guardAllow, env);
    await evaluateDirective(guardDeny, env);

    env.setVariable(
      'secretVar',
      createSimpleTextVariable(
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
      )
    );

    const directive = parseSync(
      '/show @secretVar with { guards: { except: [@gb] } }'
    )[0] as DirectiveNode;
    await expect(evaluateDirective(directive, env)).resolves.toBeDefined();
    expect(effects.getOutput().trim()).toBe('secret-value');
  });

  it('parses guard override names without quotes', async () => {
    const env = createEnv();
    const guardAllow = parseSync('/guard @ga for secret = when [ * => allow ]')[0] as DirectiveNode;
    const guardDeny = parseSync(
      '/guard @gb for secret = when [ * => deny "blocked by gb" ]'
    )[0] as DirectiveNode;
    await evaluateDirective(guardAllow, env);
    await evaluateDirective(guardDeny, env);

    env.setVariable(
      'secretVar',
      createSimpleTextVariable(
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
      )
    );

    const directive = parseSync(
      '/show @secretVar with { guards: { only: [@ga] } }'
    )[0] as DirectiveNode;
    await expect(evaluateDirective(directive, env)).resolves.toBeDefined();
  });

  it('throws when guard override sets both only and except', async () => {
    const env = createEnv();
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
        { security: makeSecurityDescriptor() }
      )
    );

    const directive = parseSync(
      '/show @value with { guards: { only: ["@ga"], except: ["@gb"] } }'
    )[0] as DirectiveNode;
    await expect(evaluateDirective(directive, env)).rejects.toThrow(
      /cannot specify both only and except/
    );
  });

  it('applies per-operation guard helpers like @opIs', async () => {
    const env = createEnv();
    const guardDirective = parseSync(
      '/guard for op:show = when [ @opIs("show") && @inputHas("secret") => deny "secret output blocked" \n * => allow ]'
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

  it('supports opHas/opHasAny/opHasAll with prefixWith and tagValue helpers', async () => {
    const env = createEnv();
    const effects = env.getEffectHandler() as TestEffectHandler;
    const guardDirective = parseSync(
      '/guard for secret = when [ @opHas("op:show") && @opHasAny("op:show") && @opHasAll("op:show") && @inputHas("secret") => allow @prefixWith("wrapped", @tagValue("before", @output, @input)) \n * => deny "helper contract failed" ]'
    )[0] as DirectiveNode;
    await evaluateDirective(guardDirective, env);

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
    await evaluateDirective(directive, env);
    expect(effects.getOutput().trim()).toBe('wrapped:before:value');
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
      '/guard for op:show = when [ @mx.guard.try < 2 => retry "try-again" \n * => deny "finished" ]'
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

  it('isolates retry attempt tracking by input identity', async () => {
    const env = createEnv();
    const guardDirective = parseSync(
      '/guard @inputRetries for secret = when [ @mx.guard.try < 2 => retry "retry-once" \n * => deny "done" ]'
    )[0] as DirectiveNode;
    await evaluateDirective(guardDirective, env);

    env.setVariable(
      'secretA',
      createSimpleTextVariable(
        'secretA',
        'alpha',
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
    env.setVariable(
      'secretB',
      createSimpleTextVariable(
        'secretB',
        'beta',
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

    const pipelineSnapshot: PipelineContextSnapshot = {
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

    const showA = parseSync('/show @secretA')[0] as DirectiveNode;
    const showB = parseSync('/show @secretB')[0] as DirectiveNode;

    await expect(
      env.withPipeContext(pipelineSnapshot, async () => evaluateDirective(showA, env))
    ).rejects.toMatchObject({ decision: 'retry' });

    await expect(
      env.withPipeContext(pipelineSnapshot, async () => evaluateDirective(showB, env))
    ).rejects.toMatchObject({ decision: 'retry' });

    await expect(
      env.withPipeContext(pipelineSnapshot, async () => evaluateDirective(showA, env))
    ).rejects.toMatchObject({ decision: 'deny' });
  });

  it('isolates retry attempt tracking between per-input and per-operation scopes', async () => {
    const env = createEnv();
    const perInputGuard = parseSync(
      '/guard @inputRetries for secret = when [ @mx.guard.try < 2 => retry "retry-input" \n * => deny "input-stop" ]'
    )[0] as DirectiveNode;
    const perOperationGuard = parseSync(
      '/guard @operationRetries for op:show = when [ @mx.guard.try < 2 => retry "retry-op" \n * => deny "op-stop" ]'
    )[0] as DirectiveNode;
    await evaluateDirective(perInputGuard, env);
    await evaluateDirective(perOperationGuard, env);

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

    const mxManager = env.getContextManager();
    const retriesByGuard = new Map<string, number[]>();
    const originalWithGuardContext = mxManager.withGuardContext.bind(mxManager);
    const guardCtxSpy = vi
      .spyOn(mxManager, 'withGuardContext')
      .mockImplementation(async (context, fn) => {
        return await originalWithGuardContext(context, async () => {
          const snapshot = mxManager.buildAmbientContext();
          const guardState = snapshot.guard as any;
          const guardName = typeof guardState?.name === 'string' ? guardState.name : 'unknown';
          const guardTry = typeof guardState?.try === 'number' ? guardState.try : null;
          if (guardTry !== null) {
            const existing = retriesByGuard.get(guardName) ?? [];
            existing.push(guardTry);
            retriesByGuard.set(guardName, existing);
          }
          return await fn();
        });
      });

    const pipelineSnapshot: PipelineContextSnapshot = {
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

    const directive = parseSync('/show @secretVar')[0] as DirectiveNode;

    await expect(
      env.withPipeContext(pipelineSnapshot, async () => evaluateDirective(directive, env))
    ).rejects.toMatchObject({ decision: 'retry' });
    await expect(
      env.withPipeContext(pipelineSnapshot, async () => evaluateDirective(directive, env))
    ).rejects.toMatchObject({ decision: 'deny' });

    guardCtxSpy.mockRestore();
    expect(retriesByGuard.get('inputRetries')).toEqual([1, 2]);
    expect(retriesByGuard.get('operationRetries')).toEqual([1, 2]);
  });

  it('omits @mx.guard when no guards fire', async () => {
    const env = createEnv();
    env.setVariable(
      'plainVar',
      createSimpleTextVariable(
        'plainVar',
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

    const directive = parseSync('/show @plainVar')[0] as DirectiveNode;
    await evaluateDirective(directive, env);
    const mx = env.getContextManager().buildAmbientContext();
    expect(mx).not.toHaveProperty('guard');
  });

it('denies /run commands that interpolate expression-derived secrets', async () => {
    const env = createEnv();
    const guardDirective = parseSync(
      '/guard for secret = when [ @mx.op.type == "run" => deny "blocked secret run" \n * => allow ]'
    )[0] as DirectiveNode;
    await evaluateDirective(guardDirective, env);

    env.setVariable(
      'secret',
      createSimpleTextVariable(
        'secret',
        'value',
        {
          directive: 'var',
          syntax: 'quoted',
          hasInterpolation: false,
          isMultiLine: false
        },
        { security: makeSecurityDescriptor({ labels: ['secret'] }) }
      )
    );

    const directive = parseSync('/run {curl "@secret"}')[0] as DirectiveNode;
    await expect(evaluateDirective(directive, env)).rejects.toThrow(/blocked secret run/);
  });

  it('populates guard context snapshots during evaluation', async () => {
    const env = createEnv();
    const guardDirective = parseSync(
      '/guard @secretProtector for secret = when [ @mx.op.type == "show" => deny "blocked secret" \n * => allow ]'
    )[0] as DirectiveNode;
    await evaluateDirective(guardDirective, env);

    env.setVariable(
      'secretVar',
      createSimpleTextVariable(
        'secretVar',
        'classified',
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

    const mxManager = env.getContextManager();
    const snapshots: Record<string, unknown>[] = [];
    const originalWithGuardContext = mxManager.withGuardContext.bind(mxManager);
    const guardCtxSpy = vi
      .spyOn(mxManager, 'withGuardContext')
      .mockImplementation(async (context, fn) => {
        return await originalWithGuardContext(context, async () => {
          snapshots.push(mxManager.buildAmbientContext());
          return await fn();
        });
      });

    const directive = parseSync('/show @secretVar')[0] as DirectiveNode;
    await expect(evaluateDirective(directive, env)).rejects.toThrow(/blocked secret/);
    guardCtxSpy.mockRestore();

    expect(snapshots.length).toBeGreaterThan(0);
    const guardSnapshot = snapshots[0].guard as any;
    expect(guardSnapshot).toBeTruthy();
    expect(guardSnapshot.try).toBe(1);
    expect(guardSnapshot.labels).toContain('secret');
  });

  it('guards expression arguments passed into exe parameters', async () => {
    const env = createEnv();
    const guardDirective = parseSync(
      '/guard for secret = when [ @mx.op.type == "exe" => deny "expressions blocked" \n * => allow ]'
    )[0] as DirectiveNode;
    await evaluateDirective(guardDirective, env);

    const varDirective = parseSync('/var secret @apiKey = "sk-test-abc"')[0] as DirectiveNode;
    await evaluateDirective(varDirective, env);

    const exeDirective = parseSync(
      '/exe network @send(value) = when [ * => show "sent" ]'
    )[0] as DirectiveNode;
    await evaluateDirective(exeDirective, env);

    const trimInvocation: ExecInvocation = {
      type: 'ExecInvocation',
      commandRef: {
        name: 'trim',
        objectReference: {
          type: 'VariableReference',
          identifier: 'apiKey'
        },
        args: []
      }
    };

    const sendInvocation: ExecInvocation = {
      type: 'ExecInvocation',
      commandRef: {
        identifier: [{ type: 'VariableReference', identifier: 'send' }],
        args: [trimInvocation]
      }
    };

    await expect(evaluateExecInvocation(sendInvocation, env)).rejects.toThrow('expressions blocked');
  });

  it('increments @mx.guard.try across retries', async () => {
    const env = createEnv();
    const guardDirective = parseSync(
      '/guard @retryTracker for op:show = when [ @mx.guard.try < 2 => retry "again" \n * => deny "done" ]'
    )[0] as DirectiveNode;
    await evaluateDirective(guardDirective, env);

    env.setVariable(
      'value',
      createSimpleTextVariable(
        'value',
        'retry me',
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

    const mxManager = env.getContextManager();
    const attempts: number[] = [];
    const originalWithGuardContext = mxManager.withGuardContext.bind(mxManager);
    const guardCtxSpy = vi
      .spyOn(mxManager, 'withGuardContext')
      .mockImplementation(async (context, fn) => {
        return await originalWithGuardContext(context, async () => {
          const snapshot = mxManager.buildAmbientContext();
          const guardState = snapshot.guard as any;
          if (guardState?.try) {
            attempts.push(guardState.try as number);
          }
          return await fn();
        });
      });

    const pipelineSnapshot: PipelineContextSnapshot = {
      stage: 1,
      totalStages: 1,
      currentCommand: 'stage-1',
      input: 'retry me',
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
    ).rejects.toMatchObject({ decision: 'retry' });
    await expect(
      env.withPipeContext(pipelineSnapshot, async () => evaluateDirective(directive, env))
    ).rejects.toMatchObject({ decision: 'deny' });

    guardCtxSpy.mockRestore();
    expect(attempts).toEqual([1, 2]);
  });

  it('blocks secrets passed into exe invocations', async () => {
    const env = createEnv();
    const guardDirective = parseSync(
      '/guard for secret = when [ @mx.op.type == "exe" => deny "blocked secret" \n * => allow ]'
    )[0] as DirectiveNode;
    await evaluateDirective(guardDirective, env);

    const exeDirective = parseSync('/exe @renderSecret(key) = `Secret: @key`')[0] as DirectiveNode;
    await evaluateDirective(exeDirective, env);

    env.setVariable(
      'apiKey',
      createSimpleTextVariable(
        'apiKey',
        'sk-live-123',
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

    const directive = parseSync('/show @renderSecret(@apiKey)')[0] as DirectiveNode;
    await expect(evaluateDirective(directive, env)).rejects.toThrow(/blocked secret/);
  });

  it('allows exe invocations when inputs lack guarded labels', async () => {
    const env = createEnv();
    const guardDirective = parseSync(
      '/guard for secret = when [ @mx.op.type == "exe" => deny "blocked secret" \n * => allow ]'
    )[0] as DirectiveNode;
    await evaluateDirective(guardDirective, env);

    const exeDirective = parseSync('/exe @renderSecret(key) = `Secret: @key`')[0] as DirectiveNode;
    await evaluateDirective(exeDirective, env);

    env.setVariable(
      'plain',
      createSimpleTextVariable(
        'plain',
        'value',
        {
          directive: 'var',
          syntax: 'quoted',
          hasInterpolation: false,
          isMultiLine: false
        },
        {
          security: makeSecurityDescriptor({ labels: ['public'] })
        }
      )
    );

    const directive = parseSync('/show @renderSecret(@plain)')[0] as DirectiveNode;
    await evaluateDirective(directive, env);
    const mx = env.getContextManager().buildAmbientContext();
    expect(mx).not.toHaveProperty('guard');
  });

  it('sets @mx.denied when guard denial is handled inside exec when-blocks', async () => {
    const env = createEnv();
    const execEnv = env.createChild();
    const effects = new TestEffectHandler();
    env.setEffectHandler(effects);
    execEnv.setEffectHandler(effects);

    const execDirective = parseSync(
      '/exe @processSecret(secretValue) = when [ denied => "Denied flag: @mx.denied" \n * => @secretValue ]'
    )[0] as DirectiveNode;
    const whenExpr = execDirective.values?.content?.[0] as WhenExpressionNode;

    const guardError = new GuardError({
      decision: 'deny',
      guardFilter: 'data:secret',
      reason: 'Blocked exec',
      operation: { type: 'exe' }
    });

    const handled = await handleExecGuardDenial(guardError, {
      execEnv,
      env,
      whenExprNode: whenExpr
    });

    expect(handled).not.toBeNull();
    expect((handled as any)?.internal?.deniedHandlerRan).toBe(true);
  });

  it('surfaces env decision metadata from pre-hook evaluation', async () => {
    const env = createEnv();
    const guardDirective = parseSync(
      '/guard @envPicker for op:run = when [ * => env "sandbox-profile" ]'
    )[0] as DirectiveNode;
    await evaluateDirective(guardDirective, env);

    const runDirective = parseSync('/run {echo test}')[0] as DirectiveNode;
    const inputVariable = createSimpleTextVariable(
      'input',
      'echo test',
      {
        directive: 'var',
        syntax: 'quoted',
        hasInterpolation: false,
        isMultiLine: false
      },
      {
        security: makeSecurityDescriptor()
      }
    );

    const operation: OperationContext = {
      type: 'run',
      subtype: 'runCommand',
      opLabels: ['op:cmd'],
      metadata: { runSubtype: 'runCommand' }
    };
    const decision = await guardPreHook(runDirective, [inputVariable], env, operation);

    expect(decision.action).toBe('continue');
    expect(decision.metadata?.envGuard).toBe('envPicker');
    expect(decision.metadata?.envConfig).toBe('sandbox-profile');
    expect((decision.metadata?.guardResults as any[])[0]?.decision).toBe('env');
  });
});

  it('denies inline exec values surfaced through /show directives', async () => {
    const env = createEnv();
    const guardDirective = parseSync(
      '/guard for secret = when [\n        @mx.op.type == "show" => deny "blocked inline secret"\n        * => allow\n      ]'
    )[0] as DirectiveNode;
    await evaluateDirective(guardDirective, env);

    const secretDirective = parseSync('/var secret @secretValue = "api-token"')[0] as DirectiveNode;
    await evaluateDirective(secretDirective, env);

    const execDirective = parseSync('/exe @leakSecret() = ::@secretValue::')[0] as DirectiveNode;
    await evaluateDirective(execDirective, env);

  const directive = parseSync('/show @leakSecret()')[0] as DirectiveNode;
  await expect(evaluateDirective(directive, env)).rejects.toThrow(/blocked inline secret/);
});

it('applies guard transformations to directive inputs before execution', async () => {
  const env = createEnv();
  const effects = env.getEffectHandler() as TestEffectHandler;
  const guardDirective = parseSync(
    '/guard @redact for secret = when [ * => allow "clean" ]'
  )[0] as DirectiveNode;
  await evaluateDirective(guardDirective, env);

  env.setVariable(
    'secretVar',
    createSimpleTextVariable(
      'secretVar',
      'raw-secret',
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
  await evaluateDirective(directive, env);
  expect(effects.getOutput().trim()).toBe('clean');
});

it('executes /run with guard-transformed command text', async () => {
  const env = createEnv();
  const effects = env.getEffectHandler() as TestEffectHandler;
  const guardDirective = parseSync(
    '/guard @sanitize for secret = when [ * => allow "echo sk-***" ]'
  )[0] as DirectiveNode;
  await evaluateDirective(guardDirective, env);

  env.setVariable(
    'key',
    createSimpleTextVariable(
      'key',
      'sk-sensitive-123',
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

  const directive = parseSync('/run {echo @key}')[0] as DirectiveNode;
  await evaluateDirective(directive, env);
  expect(effects.getOutput().trim()).toBe('sk-***');
});

it('feeds guard-transformed values into exec invocation parameters', async () => {
  const env = createEnv();
  const guardDirective = parseSync(
    '/guard @scrub for secret = when [ * => allow "scrubbed" ]'
  )[0] as DirectiveNode;
  await evaluateDirective(guardDirective, env);

  const exeDirective = parseSync('/exe @echo(value) = ::@value::')[0] as DirectiveNode;
  await evaluateDirective(exeDirective, env);

  env.setVariable(
    'secretVar',
    createSimpleTextVariable(
      'secretVar',
      'raw-secret',
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

  const invocation: ExecInvocation = {
    type: 'ExecInvocation',
    commandRef: {
      identifier: [{ type: 'VariableReference', identifier: 'echo' }],
      args: [{ type: 'VariableReference', identifier: 'secretVar' }]
    }
  };

  const result = await evaluateExecInvocation(invocation, env);
  const value = isStructuredValue(result.value) ? result.value.text : result.value;
  expect(String(value)).toContain('scrubbed');
});

it('keeps combined before guards on op:exe resolved to plain values', async () => {
  const env = createEnv();
  const labelGuard = parseSync(
    '/guard before @labelFirst for secret = when [ * => allow @prefixWith("label", @input) ]'
  )[0] as DirectiveNode;
  const opGuard = parseSync(
    '/guard before @opSecond for op:exe = when [ * => allow @prefixWith("op", @input) ]'
  )[0] as DirectiveNode;
  await evaluateDirective(labelGuard, env);
  await evaluateDirective(opGuard, env);

  const helperDirective = parseSync(
    '/exe @prefixWith(tag, value) = js { return `${tag}:${value}`; }'
  )[0] as DirectiveNode;
  const exeDirective = parseSync('/exe @emit(value) = ::@value::')[0] as DirectiveNode;
  await evaluateDirective(helperDirective, env);
  await evaluateDirective(exeDirective, env);

  env.setVariable(
    'secretVar',
    createSimpleTextVariable(
      'secretVar',
      'raw-secret',
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

  const invocation: ExecInvocation = {
    type: 'ExecInvocation',
    commandRef: {
      identifier: [{ type: 'VariableReference', identifier: 'emit' }],
      args: [{ type: 'VariableReference', identifier: 'secretVar' }]
    }
  };

  const result = await evaluateExecInvocation(invocation, env);
  const value = isStructuredValue(result.value) ? result.value.text : result.value;
  expect(String(value)).toBe('op:label:raw-secret');
  expect(String(value)).not.toContain('guard_');
  expect(String(value)).not.toContain('"type":"');
});

describe('secret redaction in guard error messages', () => {
  it('redacts secret variable values in inputPreview, guardInput, and guardContext', async () => {
    const env = createEnv();
    const guardDirective = parseSync(
      '/guard @noSecret for secret = when [ * => deny "blocked" ]'
    )[0] as DirectiveNode;
    await evaluateDirective(guardDirective, env);

    const secretValue = 'sk-super-secret-key-12345';
    env.setVariable(
      'secretVar',
      createSimpleTextVariable(
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
      )
    );

    const directive = parseSync('/show @secretVar')[0] as DirectiveNode;
    let error: unknown;
    try {
      await evaluateDirective(directive, env);
    } catch (err) {
      error = err;
    }
    expect(error).toBeInstanceOf(GuardError);
    const guardError = error as GuardError;

    // Serialize the entire error to check for secret leakage
    const errorJson = JSON.stringify(guardError.toJSON());
    expect(errorJson).not.toContain(secretValue);
    expect(errorJson).toContain('[REDACTED]');

    // Verify specific fields are redacted
    expect(guardError.details.inputPreview).toBe('[REDACTED]');
    const guardCtx = guardError.details.guardContext as any;
    expect(guardCtx.inputPreview).toBe('[REDACTED]');
    expect(guardCtx.outputPreview).toBe('[REDACTED]');
  });

  it('redacts sensitive variable values in error messages', async () => {
    const env = createEnv();
    const guardDirective = parseSync(
      '/guard @noSensitive for sensitive = when [ * => deny "blocked sensitive" ]'
    )[0] as DirectiveNode;
    await evaluateDirective(guardDirective, env);

    const sensitiveValue = 'user@private-email.com';
    env.setVariable(
      'sensitiveVar',
      createSimpleTextVariable(
        'sensitiveVar',
        sensitiveValue,
        {
          directive: 'var',
          syntax: 'quoted',
          hasInterpolation: false,
          isMultiLine: false
        },
        {
          security: makeSecurityDescriptor({ labels: ['sensitive'], sources: ['test'] })
        }
      )
    );

    const directive = parseSync('/show @sensitiveVar')[0] as DirectiveNode;
    let error: unknown;
    try {
      await evaluateDirective(directive, env);
    } catch (err) {
      error = err;
    }
    expect(error).toBeInstanceOf(GuardError);

    const errorJson = JSON.stringify((error as GuardError).toJSON());
    expect(errorJson).not.toContain(sensitiveValue);
    expect(errorJson).toContain('[REDACTED]');
  });
});
