import { describe, it, expect, vi } from 'vitest';
import { parseSync } from '@grammar/parser';
import type { DirectiveNode, ExecInvocation } from '@core/types';
import type { WhenExpressionNode } from '@core/types/when';
import { GuardError } from '@core/errors/GuardError';
import { normalizePolicyConfig } from '@core/policy/union';
import { createHandleWrapper } from '@core/types/handle';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { Environment } from '@interpreter/env/Environment';
import { evaluateDirective } from '@interpreter/eval/directive';
import { createObjectVariable, createSimpleTextVariable } from '@core/types/variable';
import { makeSecurityDescriptor } from '@core/types/security';
import type { PipelineContextSnapshot } from '@interpreter/env/ContextManager';
import { TestEffectHandler } from '@interpreter/env/EffectHandler';
import { handleExecGuardDenial } from '@interpreter/eval/guard-denial-handler';
import { evaluateExecInvocation } from '@interpreter/eval/exec-invocation';
import { isStructuredValue, wrapStructured } from '@interpreter/utils/structured-value';
import { guardPreHook } from '@interpreter/hooks/guard-pre-hook';
import type { OperationContext } from '@interpreter/env/ContextManager';

function createEnv(): Environment {
  const env = new Environment(new MemoryFileSystem(), new PathService(), '/');
  env.setEffectHandler(new TestEffectHandler());
  return env;
}

function setActiveLlmSession(env: Environment, sessionId: string): void {
  env.setLlmToolConfig({
    sessionId,
    mcpConfigPath: '',
    toolsCsv: '',
    mcpAllowedTools: '',
    nativeAllowedTools: '',
    unifiedAllowedTools: '',
    availableTools: [],
    inBox: false,
    cleanup: async () => {}
  });
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

  it('emits runtime trace events for aggregate and per-guard denials', async () => {
    const env = createEnv();
    env.setRuntimeTrace('effects');
    const guardDirective = parseSync(
      '/guard @ga for secret = when [ * => deny "blocked by trace" ]'
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

    await expect(
      evaluateDirective(parseSync('/show @secretVar')[0] as DirectiveNode, env)
    ).rejects.toBeInstanceOf(GuardError);

    expect(env.getRuntimeTraceEvents()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: 'guard',
          event: 'guard.evaluate',
          data: expect.objectContaining({
            phase: 'before',
            decision: 'deny'
          })
        }),
        expect.objectContaining({
          category: 'guard',
          event: 'guard.deny',
          data: expect.objectContaining({
            phase: 'before',
            guard: 'ga',
            message: 'blocked by trace'
          })
        })
      ])
    );
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

  it('treats missing @mx.op.labels.includes checks as false', async () => {
    const env = createEnv();
    const effects = env.getEffectHandler() as TestEffectHandler;
    const guardDirective = parseSync(
      '/guard for op:show = when [ @mx.op.labels.includes("destructive") => deny "Blocked" \n * => allow ]'
    )[0] as DirectiveNode;
    await evaluateDirective(guardDirective, env);

    env.setVariable(
      'value',
      createSimpleTextVariable(
        'value',
        'safe-output',
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
    await evaluateDirective(directive, env);
    expect(effects.getOutput().trim()).toBe('safe-output');
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

  it('keeps before op:show guard transforms as plain text output', async () => {
    const env = createEnv();
    const effects = env.getEffectHandler() as TestEffectHandler;
    const guardDirective = parseSync(
      '/guard before @rewrite for op:show = when [ * => allow @prefixWith("show", @input) ]'
    )[0] as DirectiveNode;
    await evaluateDirective(guardDirective, env);

    env.setVariable(
      'value',
      createSimpleTextVariable(
        'value',
        'base',
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
    await evaluateDirective(directive, env);
    const output = effects.getOutput().trim();

    expect(output).toBe('show:base');
    expect(output).not.toContain('"type":"');
    expect(output).not.toContain('"name":"guard_');
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

  it('exposes named exec args in guard context', async () => {
    const env = createEnv();
    const guardDirective = parseSync(
      '/guard before op:exe = when [ @input.length() > 0 && @mx.args.value.mx.labels.includes("secret") => deny "named args blocked" \n * => allow ]'
    )[0] as DirectiveNode;
    await evaluateDirective(guardDirective, env);

    const varDirective = parseSync('/var secret @apiKey = "sk-test-abc"')[0] as DirectiveNode;
    await evaluateDirective(varDirective, env);

    const exeDirective = parseSync('/exe @send(value) = when [ * => show "sent" ]')[0] as DirectiveNode;
    await evaluateDirective(exeDirective, env);

    const invocation: ExecInvocation = {
      type: 'ExecInvocation',
      commandRef: {
        identifier: [{ type: 'VariableReference', identifier: 'send' }],
        args: [{ type: 'VariableReference', identifier: 'apiKey' }]
      }
    };

    await expect(evaluateExecInvocation(invocation, env)).rejects.toThrow('named args blocked');
  });

  it('reserves @mx.args.names while allowing bracket access to arg named names', async () => {
    const env = createEnv();
    const guardDirective = parseSync(
      '/guard before op:exe = when [ @input.length() > 0 && @mx.args.names.includes("names") && @mx.args["names"].mx.labels.includes("secret") => deny "reserved names work" \n * => allow ]'
    )[0] as DirectiveNode;
    await evaluateDirective(guardDirective, env);

    const varDirective = parseSync('/var secret @payload = "classified"')[0] as DirectiveNode;
    await evaluateDirective(varDirective, env);

    const exeDirective = parseSync('/exe @echo(names) = ::@names::')[0] as DirectiveNode;
    await evaluateDirective(exeDirective, env);

    const invocation: ExecInvocation = {
      type: 'ExecInvocation',
      commandRef: {
        identifier: [{ type: 'VariableReference', identifier: 'echo' }],
        args: [{ type: 'VariableReference', identifier: 'payload' }]
      }
    };

    await expect(evaluateExecInvocation(invocation, env)).rejects.toThrow('reserved names work');
  });

  it('exposes named pipeline stage args in guard context', async () => {
    const env = createEnv();
    const guardDirective = parseSync(
      '/guard for secret = when [ @mx.op.type == "pipeline-stage" && @mx.args.input.mx.labels.includes("secret") && @mx.args.suffix == "tail" => deny "pipeline named args blocked" \n * => allow ]'
    )[0] as DirectiveNode;
    await evaluateDirective(guardDirective, env);

    await evaluateDirective(parseSync('/var secret @token = "seed"')[0] as DirectiveNode, env);
    await evaluateDirective(
      parseSync('/exe @combine(input, suffix) = ::@input:@suffix::')[0] as DirectiveNode,
      env
    );

    const pipelineDirective = parseSync('/var @result = @token | @combine("tail")')[0] as DirectiveNode;
    await expect(evaluateDirective(pipelineDirective, env)).rejects.toThrow('pipeline named args blocked');
  });

  it('denies authorization guards when inherited no-send-to-unknown checks fail', async () => {
    const env = createEnv();
    await evaluateDirective(parseSync('/var @recipient = "acct-1"')[0] as DirectiveNode, env);
    await evaluateDirective(
      parseSync('/exe tool:w @sendMoney(recipient, amount) = `sent:@amount` with { controlArgs: ["recipient"] }')[0] as DirectiveNode,
      env
    );

    env.setPolicySummary(normalizePolicyConfig({
      defaults: { rules: ['no-send-to-unknown'] },
      operations: { 'exfil:send': ['tool:w'] },
      authorizations: {
        allow: {
          sendMoney: {
            args: {
              recipient: 'acct-1'
            }
          }
        }
      }
    })!);

    const directive = parseSync('/show @sendMoney(@recipient, 5)')[0] as DirectiveNode;
    await expect(evaluateDirective(directive, env)).rejects.toThrow(/destination must carry 'known'/i);
  });

  it('allows authorization guards when inherited no-send-to-unknown checks pass', async () => {
    const env = createEnv();
    await evaluateDirective(parseSync('/var known @recipient = "acct-1"')[0] as DirectiveNode, env);
    await evaluateDirective(
      parseSync('/exe tool:w @sendMoney(recipient, amount) = `sent:@amount` with { controlArgs: ["recipient"] }')[0] as DirectiveNode,
      env
    );

    env.setPolicySummary(normalizePolicyConfig({
      defaults: { rules: ['no-send-to-unknown'] },
      operations: { 'exfil:send': ['tool:w'] },
      authorizations: {
        allow: {
          sendMoney: {
            args: {
              recipient: 'acct-1'
            }
          }
        }
      }
    })!);

    const directive = parseSync('/show @sendMoney(@recipient, 5)')[0] as DirectiveNode;
    await expect(evaluateDirective(directive, env)).resolves.toBeDefined();
    const effects = env.getEffectHandler() as TestEffectHandler;
    expect(effects.getOutput().trim()).toBe('sent:5');
  });

  it('carries planner-time known attestations through with { policy } authorizations', async () => {
    const env = createEnv();
    await evaluateDirective(parseSync('/var known @approvedRecipient = "acct-1"')[0] as DirectiveNode, env);
    await evaluateDirective(
      parseSync('/exe tool:w @sendMoney(recipient, amount) = `sent:@amount` with { controlArgs: ["recipient"] }')[0] as DirectiveNode,
      env
    );
    await evaluateDirective(
      parseSync('/var @taskPolicy = { defaults: { rules: ["no-send-to-unknown"] }, operations: { "exfil:send": ["tool:w"] }, authorizations: { allow: { sendMoney: { args: { recipient: @approvedRecipient } } } } }')[0] as DirectiveNode,
      env
    );

    const directive = parseSync('/show @sendMoney("acct-1", 5) with { policy: @taskPolicy }')[0] as DirectiveNode;
    await expect(evaluateDirective(directive, env)).resolves.toBeDefined();
    const effects = env.getEffectHandler() as TestEffectHandler;
    expect(effects.getOutput().trim()).toBe('sent:5');
  });

  it('rejects planner-pinned bare literals in with { policy } authorizations', async () => {
    const env = createEnv();
    const approvedRecipient = wrapStructured('mark@example.com', 'text', 'mark@example.com', {
      security: makeSecurityDescriptor({
        labels: ['fact:@contact.email']
      })
    });
    env.issueHandle(approvedRecipient, {
      preview: 'm***@example.com',
      metadata: { field: 'recipient' }
    });

    await evaluateDirective(
      parseSync('/exe exfil:send, tool:w @sendMoney(recipient, amount) = `sent:@amount` with { controlArgs: ["recipient"] }')[0] as DirectiveNode,
      env
    );
    await evaluateDirective(
      parseSync('/var @taskPolicy = { defaults: { rules: ["no-send-to-unknown"] }, operations: { "exfil:send": ["tool:w"] }, authorizations: { allow: { sendMoney: { args: { recipient: "mark@example.com" } } } } }')[0] as DirectiveNode,
      env
    );

    const directive = parseSync('/show @sendMoney("mark@example.com", 5) with { policy: @taskPolicy }')[0] as DirectiveNode;
    await expect(evaluateDirective(directive, env)).rejects.toThrow(/lacks required proof/i);
  });

  it('ignores planner-pinned data args when matching with { policy } authorizations', async () => {
    const env = createEnv();
    const approvedRecipient = wrapStructured('mark@example.com', 'text', 'mark@example.com', {
      security: makeSecurityDescriptor({
        labels: ['fact:@contact.email']
      })
    });
    const issued = env.issueHandle(approvedRecipient, {
      preview: 'm***@example.com',
      metadata: { field: 'recipient' }
    });

    await evaluateDirective(
      parseSync('/exe exfil:send, tool:w @sendMoney(recipient, amount) = `sent:@amount` with { controlArgs: ["recipient"] }')[0] as DirectiveNode,
      env
    );
    await evaluateDirective(
      parseSync(`/var @taskPolicy = { defaults: { rules: ["no-send-to-unknown"] }, operations: { "exfil:send": ["tool:w"] }, authorizations: { allow: { sendMoney: { args: { recipient: ${JSON.stringify(createHandleWrapper(issued.handle))}, amount: 5 } } } } }`)[0] as DirectiveNode,
      env
    );

    const directive = parseSync('/show @sendMoney("mark@example.com", 10) with { policy: @taskPolicy }')[0] as DirectiveNode;
    await expect(evaluateDirective(directive, env)).resolves.toBeDefined();
    const effects = env.getEffectHandler() as TestEffectHandler;
    expect(effects.getOutput().trim()).toBe('sent:10');
  });

  it('trusts non-email fact proofs on declared send control args in with { policy } authorizations', async () => {
    const env = createEnv();
    env.setVariable(
      'participants',
      createSimpleTextVariable(
        'participants',
        'group-1',
        {
          directive: 'var',
          syntax: 'quoted',
          hasInterpolation: false,
          isMultiLine: false
        },
        {
          security: makeSecurityDescriptor({
            labels: ['fact:@calendar_evt.participants']
          })
        }
      )
    );

    await evaluateDirective(
      parseSync('/exe exfil:send, tool:w @createCalendarEvent(participants, title) = `sent:@title` with { controlArgs: ["participants"] }')[0] as DirectiveNode,
      env
    );
    await evaluateDirective(
      parseSync('/var @taskPolicy = { defaults: { rules: ["no-send-to-unknown"] }, operations: { "exfil:send": ["tool:w"] }, authorizations: { allow: { createCalendarEvent: { args: { participants: @participants } } } } }')[0] as DirectiveNode,
      env
    );

    const directive = parseSync('/show @createCalendarEvent(@participants, "Lunch") with { policy: @taskPolicy }')[0] as DirectiveNode;
    await expect(evaluateDirective(directive, env)).resolves.toBeDefined();
    const effects = env.getEffectHandler() as TestEffectHandler;
    expect(effects.getOutput().trim()).toBe('sent:Lunch');
  });

  it('rejects planner-pinned masked previews in with { policy } authorizations', async () => {
    const env = createEnv();
    const approvedRecipient = wrapStructured('mark@example.com', 'text', 'mark@example.com', {
      security: makeSecurityDescriptor({
        labels: ['fact:@contact.email']
      })
    });
    env.issueHandle(approvedRecipient, {
      preview: 'm***@example.com',
      metadata: { field: 'recipient' }
    });

    await evaluateDirective(
      parseSync('/exe exfil:send, tool:w @sendMoney(recipient, amount) = `sent:@amount` with { controlArgs: ["recipient"] }')[0] as DirectiveNode,
      env
    );
    await evaluateDirective(
      parseSync('/var @taskPolicy = { defaults: { rules: ["no-send-to-unknown"] }, operations: { "exfil:send": ["tool:w"] }, authorizations: { allow: { sendMoney: { args: { recipient: "m***@example.com" } } } } }')[0] as DirectiveNode,
      env
    );

    const directive = parseSync('/show @sendMoney("mark@example.com", 5) with { policy: @taskPolicy }')[0] as DirectiveNode;
    await expect(evaluateDirective(directive, env)).rejects.toThrow(/lacks required proof/i);
  });

  it('carries planner-time known attestations through handle-backed with { policy } authorizations', async () => {
    const env = createEnv();
    const approvedRecipient = wrapStructured('acct-1', 'text', 'acct-1', {
      security: makeSecurityDescriptor({
        attestations: ['known']
      })
    });
    const issued = env.issueHandle(approvedRecipient);
    await evaluateDirective(
      parseSync('/exe tool:w @sendMoney(recipient, amount) = `sent:@amount` with { controlArgs: ["recipient"] }')[0] as DirectiveNode,
      env
    );
    await evaluateDirective(
      parseSync(`/var @taskPolicy = { defaults: { rules: ["no-send-to-unknown"] }, operations: { "exfil:send": ["tool:w"] }, authorizations: { allow: { sendMoney: { args: { recipient: ${JSON.stringify(createHandleWrapper(issued.handle))} } } } } }`)[0] as DirectiveNode,
      env
    );

    const directive = parseSync('/show @sendMoney("acct-1", 5) with { policy: @taskPolicy }')[0] as DirectiveNode;
    await expect(evaluateDirective(directive, env)).resolves.toBeDefined();
    const effects = env.getEffectHandler() as TestEffectHandler;
    expect(effects.getOutput().trim()).toBe('sent:5');
  });

  it('allows multi-recipient handle-backed authorizations in a single constraint', async () => {
    const env = createEnv();
    const recipientA = wrapStructured('alice@example.com', 'text', 'alice@example.com', {
      security: makeSecurityDescriptor({
        attestations: ['known']
      })
    });
    const recipientB = wrapStructured('bob@example.com', 'text', 'bob@example.com', {
      security: makeSecurityDescriptor({
        attestations: ['known']
      })
    });
    const handleA = env.issueHandle(recipientA);
    const handleB = env.issueHandle(recipientB);
    await evaluateDirective(
      parseSync('/exe tool:w @sendEmail(recipients, subject) = `sent:@subject` with { controlArgs: ["recipients"] }')[0] as DirectiveNode,
      env
    );
    await evaluateDirective(
      parseSync(`/var @taskPolicy = { defaults: { rules: ["no-send-to-unknown"] }, operations: { "exfil:send": ["tool:w"] }, authorizations: { allow: { sendEmail: { args: { recipients: ${JSON.stringify([createHandleWrapper(handleA.handle), createHandleWrapper(handleB.handle)])} } } } } }`)[0] as DirectiveNode,
      env
    );

    const directive = parseSync('/show @sendEmail(["alice@example.com", "bob@example.com"], "hi") with { policy: @taskPolicy }')[0] as DirectiveNode;
    await expect(evaluateDirective(directive, env)).resolves.toBeDefined();
    const effects = env.getEffectHandler() as TestEffectHandler;
    expect(effects.getOutput().trim()).toBe('sent:hi');
  });

  it('rejects mixed handle and proofless preview authorizations in a single recipient array', async () => {
    const env = createEnv();
    const recipientA = wrapStructured('alice@example.com', 'text', 'alice@example.com', {
      security: makeSecurityDescriptor({
        attestations: ['known']
      })
    });
    const recipientB = wrapStructured('bob@example.com', 'text', 'bob@example.com', {
      security: makeSecurityDescriptor({
        labels: ['fact:@contact.email']
      })
    });
    const handleA = env.issueHandle(recipientA);
    env.issueHandle(recipientB, {
      preview: 'b***@example.com',
      metadata: { field: 'recipients' }
    });

    await evaluateDirective(
      parseSync('/exe exfil:send, tool:w @sendEmail(recipients, subject) = `sent:@subject` with { controlArgs: ["recipients"] }')[0] as DirectiveNode,
      env
    );
    await evaluateDirective(
      parseSync(`/var @taskPolicy = { defaults: { rules: ["no-send-to-unknown"] }, operations: { "exfil:send": ["tool:w"] }, authorizations: { allow: { sendEmail: { args: { recipients: ${JSON.stringify([createHandleWrapper(handleA.handle), 'b***@example.com'])} } } } } }`)[0] as DirectiveNode,
      env
    );

    const directive = parseSync('/show @sendEmail(["alice@example.com", "bob@example.com"], "hi") with { policy: @taskPolicy }')[0] as DirectiveNode;
    await expect(evaluateDirective(directive, env)).rejects.toThrow(/destination must carry 'known'/i);
  });

  it('resolves handle-backed recipient args before no-send-to-unknown checks run', async () => {
    const env = createEnv();
    const recipient = wrapStructured('mark@example.com', 'text', 'mark@example.com', {
      security: makeSecurityDescriptor({
        labels: ['fact:@contact.email']
      })
    });
    const handle = env.issueHandle(recipient);
    await evaluateDirective(
      parseSync('/exe exfil:send, tool:w @send_email(recipients, subject, body) = `sent:@subject` with { controlArgs: ["recipients"] }')[0] as DirectiveNode,
      env
    );
    await evaluateDirective(
      parseSync('/var @taskPolicy = { defaults: { rules: ["no-send-to-unknown"] }, operations: { "exfil:send": ["tool:w"] } }')[0] as DirectiveNode,
      env
    );

    const directive = parseSync(
      `/show @send_email(${JSON.stringify([createHandleWrapper(handle.handle)])}, "test", "hello") with { policy: @taskPolicy }`
    )[0] as DirectiveNode;
    await expect(evaluateDirective(directive, env)).resolves.toBeDefined();
    const effects = env.getEffectHandler() as TestEffectHandler;
    expect(effects.getOutput().trim()).toBe('sent:test');
  });

  it('trusts non-id fact proofs on declared targeted control args in with { policy } authorizations', async () => {
    const env = createEnv();
    env.setVariable(
      'targetRef',
      createSimpleTextVariable(
        'targetRef',
        'evt-1',
        {
          directive: 'var',
          syntax: 'quoted',
          hasInterpolation: false,
          isMultiLine: false
        },
        {
          security: makeSecurityDescriptor({
            labels: ['fact:@calendar_evt.target_ref']
          })
        }
      )
    );

    await evaluateDirective(
      parseSync('/exe destructive:targeted, tool:w @deleteCalendarEvent(targetRef) = `deleted:@targetRef` with { controlArgs: ["targetRef"] }')[0] as DirectiveNode,
      env
    );
    await evaluateDirective(
      parseSync('/var @taskPolicy = { defaults: { rules: ["no-destroy-unknown"] }, operations: { "destructive:targeted": ["tool:w"] }, authorizations: { allow: { deleteCalendarEvent: { args: { targetRef: @targetRef } } } } }')[0] as DirectiveNode,
      env
    );

    const directive = parseSync('/show @deleteCalendarEvent(@targetRef) with { policy: @taskPolicy }')[0] as DirectiveNode;
    await expect(evaluateDirective(directive, env)).resolves.toBeDefined();
    const effects = env.getEffectHandler() as TestEffectHandler;
    expect(effects.getOutput().trim()).toBe('deleted:evt-1');
  });

  it('lets explicit authorization attestations satisfy managed positive checks', async () => {
    const env = createEnv();
    await evaluateDirective(
      parseSync('/exe tool:w @sendMoney(recipient, amount) = `sent:@amount` with { controlArgs: ["recipient"] }')[0] as DirectiveNode,
      env
    );
    await evaluateDirective(
      parseSync('/var @taskPolicy = { defaults: { rules: ["no-send-to-unknown"] }, operations: { "exfil:send": ["tool:w"] }, authorizations: { allow: { sendMoney: { args: { recipient: { eq: "acct-1", attestations: ["known"] } } } } } }')[0] as DirectiveNode,
      env
    );

    const directive = parseSync('/show @sendMoney("acct-1", 5) with { policy: @taskPolicy }')[0] as DirectiveNode;
    await expect(evaluateDirective(directive, env)).resolves.toBeDefined();
    const effects = env.getEffectHandler() as TestEffectHandler;
    expect(effects.getOutput().trim()).toBe('sent:5');
  });

  it('rejects proofless live refs in with { policy } authorizations before inherited known checks run', async () => {
    const env = createEnv();
    await evaluateDirective(parseSync('/var @approvedRecipient = "acct-1"')[0] as DirectiveNode, env);
    await evaluateDirective(
      parseSync('/exe tool:w @sendMoney(recipient, amount) = `sent:@amount` with { controlArgs: ["recipient"] }')[0] as DirectiveNode,
      env
    );
    await evaluateDirective(
      parseSync('/var @taskPolicy = { defaults: { rules: ["no-send-to-unknown"] }, operations: { "exfil:send": ["tool:w"] }, authorizations: { allow: { sendMoney: { args: { recipient: @approvedRecipient } } } } }')[0] as DirectiveNode,
      env
    );

    const directive = parseSync('/show @sendMoney("acct-1", 5) with { policy: @taskPolicy }')[0] as DirectiveNode;
    await expect(evaluateDirective(directive, env)).rejects.toThrow(/lacks required proof/i);
  });

  it('rejects proofless authorization entries even when duplicate handles exist for the same value', async () => {
    const env = createEnv();
    const approvedRecipient = wrapStructured('mark.davies@hotmail.com', 'text', 'mark.davies@hotmail.com', {
      security: makeSecurityDescriptor({
        labels: ['fact:@contact.email']
      })
    });
    env.issueHandle(approvedRecipient, {
      preview: 'm***@hotmail.com',
      metadata: { field: 'recipient' }
    });
    env.issueHandle(approvedRecipient, {
      preview: 'm***@hotmail.com',
      metadata: { field: 'recipient' }
    });

    await evaluateDirective(
      parseSync('/exe exfil:send, tool:w @sendMoney(recipient, amount) = `sent:@amount` with { controlArgs: ["recipient"] }')[0] as DirectiveNode,
      env
    );
    await evaluateDirective(
      parseSync('/var @taskPolicy = { operations: { "exfil:send": ["tool:w"] }, authorizations: { allow: { sendMoney: { args: { recipient: "mark.davies@hotmail.com" } } } } }')[0] as DirectiveNode,
      env
    );

    const directive = parseSync('/show @sendMoney("mark.davies@hotmail.com", 5) with { policy: @taskPolicy }')[0] as DirectiveNode;
    await expect(evaluateDirective(directive, env)).rejects.toThrow(/lacks required proof/i);
  });

  it('distinguishes invalid authorizations from never-listed authorizations', async () => {
    const env = createEnv();
    await evaluateDirective(
      parseSync('/exe exfil:send, tool:w @sendMoney(recipient, amount) = `sent:@amount` with { controlArgs: ["recipient"] }')[0] as DirectiveNode,
      env
    );
    env.issueHandle(
      wrapStructured('sarah@company.com', 'text', 'sarah@company.com', {
        security: makeSecurityDescriptor({
          labels: ['fact:@contact.email']
        })
      }),
      {
        preview: 's***@company.com',
        metadata: { field: 'recipient' }
      }
    );
    env.issueHandle(
      wrapStructured('steve@company.com', 'text', 'steve@company.com', {
        security: makeSecurityDescriptor({
          labels: ['fact:@contact.email']
        })
      }),
      {
        preview: 's***@company.com',
        metadata: { field: 'recipient' }
      }
    );

    await evaluateDirective(
      parseSync('/var @compileDropPolicy = { operations: { "exfil:send": ["tool:w"] }, authorizations: { allow: { sendMoney: { args: { recipient: "s***@company.com" } } } } }')[0] as DirectiveNode,
      env
    );
    await evaluateDirective(
      parseSync('/var @neverListedPolicy = { operations: { "exfil:send": ["tool:w"] }, authorizations: { allow: {} } }')[0] as DirectiveNode,
      env
    );

    await expect(
      evaluateDirective(
        parseSync('/show @sendMoney("sarah@company.com", 5) with { policy: @compileDropPolicy }')[0] as DirectiveNode,
        env
      )
    ).rejects.toThrow(/lacks required proof/i);

    await expect(
      evaluateDirective(
        parseSync('/show @sendMoney("sarah@company.com", 5) with { policy: @neverListedPolicy }')[0] as DirectiveNode,
        env
      )
    ).rejects.toMatchObject({
      context: {
        blocker: {
          rule: 'policy.authorizations.unlisted'
        }
      }
    });
  });

  it('activates no-send-to-unknown for with { policy } without authorizations', async () => {
    const env = createEnv();
    await evaluateDirective(
      parseSync('/exe tool:w @sendMoney(recipient, amount) = `sent:@amount` with { controlArgs: ["recipient"] }')[0] as DirectiveNode,
      env
    );
    await evaluateDirective(
      parseSync('/var @taskPolicy = { defaults: { rules: ["no-send-to-unknown"] }, operations: { "exfil:send": ["tool:w"] } }')[0] as DirectiveNode,
      env
    );

    const directive = parseSync('/show @sendMoney("evil-iban", 100) with { policy: @taskPolicy }')[0] as DirectiveNode;
    await expect(evaluateDirective(directive, env)).rejects.toThrow(/destination must carry 'known'/i);
  });

  it('treats trusted-data record fields as proofless for inherited no-send-to-unknown checks', async () => {
    const env = createEnv();
    await evaluateDirective(
      parseSync('/record @contact = { facts: [id: string], data: { trusted: [email: string] } }')[0] as DirectiveNode,
      env
    );
    await evaluateDirective(
      parseSync('/exe untrusted, src:mcp @getContact() = { id: "contact-1", email: "ada@example.com" } => contact')[0] as DirectiveNode,
      env
    );
    await evaluateDirective(parseSync('/var @contact = @getContact()')[0] as DirectiveNode, env);
    await evaluateDirective(
      parseSync('/exe tool:w @sendMoney(recipient, amount) = `sent:@amount` with { controlArgs: ["recipient"] }')[0] as DirectiveNode,
      env
    );
    await evaluateDirective(
      parseSync('/var @taskPolicy = { defaults: { rules: ["no-send-to-unknown", "no-untrusted-destructive"] }, operations: { "exfil:send": ["tool:w"], destructive: ["tool:w"] } }')[0] as DirectiveNode,
      env
    );

    const directive = parseSync('/show @sendMoney(@contact.email, 5) with { policy: @taskPolicy }')[0] as DirectiveNode;
    await expect(evaluateDirective(directive, env)).rejects.toThrow(/destination must carry 'known'/i);
  });

  it('activates no-untrusted-destructive for with { policy } without authorizations', async () => {
    const env = createEnv();
    await evaluateDirective(parseSync('/var untrusted @payload = "doc-1"')[0] as DirectiveNode, env);
    await evaluateDirective(
      parseSync('/exe tool:w @deleteDoc(id) = `deleted:@id` with { controlArgs: ["id"] }')[0] as DirectiveNode,
      env
    );
    await evaluateDirective(
      parseSync('/var @taskPolicy = { defaults: { rules: ["no-untrusted-destructive"] }, operations: { destructive: ["tool:w"] } }')[0] as DirectiveNode,
      env
    );

    const directive = parseSync('/show @deleteDoc(@payload) with { policy: @taskPolicy }')[0] as DirectiveNode;
    await expect(evaluateDirective(directive, env)).rejects.toThrow(/cannot flow to 'destructive'/i);
  });

  it('does not trigger no-untrusted-destructive for trusted-data record fields', async () => {
    const env = createEnv();
    await evaluateDirective(
      parseSync('/record @payload = { facts: [id: string], data: { trusted: [target: string] } }')[0] as DirectiveNode,
      env
    );
    await evaluateDirective(
      parseSync('/exe untrusted, src:mcp @getPayload() = { id: "payload-1", target: "doc-1" } => payload')[0] as DirectiveNode,
      env
    );
    await evaluateDirective(parseSync('/var @payload = @getPayload()')[0] as DirectiveNode, env);
    await evaluateDirective(
      parseSync('/exe tool:w @deleteDoc(id) = `deleted:@id` with { controlArgs: ["id"] }')[0] as DirectiveNode,
      env
    );
    await evaluateDirective(
      parseSync('/var @taskPolicy = { defaults: { rules: ["no-untrusted-destructive"] }, operations: { destructive: ["tool:w"] } }')[0] as DirectiveNode,
      env
    );

    const directive = parseSync('/show @deleteDoc(@payload.target) with { policy: @taskPolicy }')[0] as DirectiveNode;
    await expect(evaluateDirective(directive, env)).resolves.toBeDefined();
    const effects = env.getEffectHandler() as TestEffectHandler;
    expect(effects.getOutput().trim()).toBe('deleted:doc-1');
  });

  it('scopes no-untrusted-destructive to non-empty controlArgs by default', async () => {
    const env = createEnv();
    await evaluateDirective(parseSync('/var untrusted @memo = "user requested delete"')[0] as DirectiveNode, env);
    await evaluateDirective(
      parseSync('/exe tool:w @deleteDoc(id, memo) = `deleted:@id:@memo` with { controlArgs: ["id"] }')[0] as DirectiveNode,
      env
    );
    await evaluateDirective(
      parseSync('/var @taskPolicy = { defaults: { rules: ["no-untrusted-destructive"] }, operations: { destructive: ["tool:w"] } }')[0] as DirectiveNode,
      env
    );

    const directive = parseSync('/show @deleteDoc("doc-1", @memo) with { policy: @taskPolicy }')[0] as DirectiveNode;
    await expect(evaluateDirective(directive, env)).resolves.toBeDefined();
    const effects = env.getEffectHandler() as TestEffectHandler;
    expect(effects.getOutput().trim()).toBe('deleted:doc-1:user requested delete');
  });

  it('falls back to all args when controlArgs is explicitly empty', async () => {
    const env = createEnv();
    await evaluateDirective(parseSync('/var untrusted @memo = "user requested delete"')[0] as DirectiveNode, env);
    await evaluateDirective(
      parseSync('/exe tool:w @deleteDoc(id, memo) = `deleted:@id:@memo` with { controlArgs: [] }')[0] as DirectiveNode,
      env
    );
    await evaluateDirective(
      parseSync('/var @taskPolicy = { defaults: { rules: ["no-untrusted-destructive"] }, operations: { destructive: ["tool:w"] } }')[0] as DirectiveNode,
      env
    );

    const directive = parseSync('/show @deleteDoc("doc-1", @memo) with { policy: @taskPolicy }')[0] as DirectiveNode;
    await expect(evaluateDirective(directive, env)).rejects.toThrow(/cannot flow to 'destructive'/i);
  });

  it('ignores invocation taintFacts now that the override has been removed', async () => {
    const env = createEnv();
    await evaluateDirective(parseSync('/var untrusted @memo = "user requested delete"')[0] as DirectiveNode, env);
    await evaluateDirective(
      parseSync('/exe tool:w @deleteDoc(id, memo) = `deleted:@id:@memo` with { controlArgs: ["id"] }')[0] as DirectiveNode,
      env
    );
    await evaluateDirective(
      parseSync('/var @taskPolicy = { defaults: { rules: ["no-untrusted-destructive"] }, operations: { destructive: ["tool:w"] } }')[0] as DirectiveNode,
      env
    );

    const directive = parseSync('/show @deleteDoc("doc-1", @memo) with { policy: @taskPolicy, taintFacts: true }')[0] as DirectiveNode;
    await expect(evaluateDirective(directive, env)).resolves.toBeDefined();
  });

  it('ignores exe taintFacts now that the override has been removed', async () => {
    const env = createEnv();
    await evaluateDirective(parseSync('/var untrusted @memo = "user requested delete"')[0] as DirectiveNode, env);
    await evaluateDirective(
      parseSync('/exe tool:w @deleteDoc(id, memo) = `deleted:@id:@memo` with { controlArgs: ["id"], taintFacts: true }')[0] as DirectiveNode,
      env
    );
    await evaluateDirective(
      parseSync('/var @taskPolicy = { defaults: { rules: ["no-untrusted-destructive"] }, operations: { destructive: ["tool:w"] } }')[0] as DirectiveNode,
      env
    );

    const directive = parseSync('/show @deleteDoc("doc-1", @memo) with { policy: @taskPolicy }')[0] as DirectiveNode;
    await expect(evaluateDirective(directive, env)).resolves.toBeDefined();
  });

  it('lets authorization guards override unlocked no-untrusted-destructive denials', async () => {
    const env = createEnv();
    await evaluateDirective(parseSync('/var untrusted @payload = "doc-1"')[0] as DirectiveNode, env);
    await evaluateDirective(
      parseSync('/exe tool:w @deleteDoc(id) = `deleted:@id` with { controlArgs: ["id"] }')[0] as DirectiveNode,
      env
    );
    await evaluateDirective(
      parseSync('/var @taskPolicy = { defaults: { rules: ["no-untrusted-destructive"] }, operations: { destructive: ["tool:w"] }, authorizations: { allow: { deleteDoc: { args: { id: { eq: "doc-1", attestations: ["known"] } } } } } }')[0] as DirectiveNode,
      env
    );

    const directive = parseSync('/show @deleteDoc(@payload) with { policy: @taskPolicy }')[0] as DirectiveNode;
    await expect(evaluateDirective(directive, env)).resolves.toBeDefined();
    const effects = env.getEffectHandler() as TestEffectHandler;
    expect(effects.getOutput().trim()).toBe('deleted:doc-1');
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

it('fires bare-label before guards for exe labels without op: prefix', async () => {
  const env = createEnv();
  const labelGuard = parseSync(
    '/guard before @byLabel for exfil = when [ * => allow @prefixWith("guard", @input) ]'
  )[0] as DirectiveNode;
  await evaluateDirective(labelGuard, env);

  const helperDirective = parseSync(
    '/exe @prefixWith(tag, value) = js { return `${tag}:${value}`; }'
  )[0] as DirectiveNode;
  const exeDirective = parseSync('/exe exfil @emit(value) = ::@value::')[0] as DirectiveNode;
  await evaluateDirective(helperDirective, env);
  await evaluateDirective(exeDirective, env);

  env.setVariable(
    'plainVar',
    createSimpleTextVariable(
      'plainVar',
      'raw',
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

  const invocation: ExecInvocation = {
    type: 'ExecInvocation',
    commandRef: {
      identifier: [{ type: 'VariableReference', identifier: 'emit' }],
      args: [{ type: 'VariableReference', identifier: 'plainVar' }]
    }
  };

  const result = await evaluateExecInvocation(invocation, env);
  const value = isStructuredValue(result.value) ? result.value.text : result.value;
  expect(String(value)).toBe('guard:raw');
});

it('does not double-fire bare-label guards when input and exe share a label', async () => {
  const env = createEnv();
  const labelGuard = parseSync(
    '/guard before @byLabel for secret = when [ * => allow @prefixWith("guard", @input) ]'
  )[0] as DirectiveNode;
  await evaluateDirective(labelGuard, env);

  const helperDirective = parseSync(
    '/exe @prefixWith(tag, value) = js { return `${tag}:${value}`; }'
  )[0] as DirectiveNode;
  const exeDirective = parseSync('/exe secret @emit(value) = ::@value::')[0] as DirectiveNode;
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
  const text = String(value);
  expect(text).toBe('guard:raw-secret');
  expect(text.match(/guard:/g)?.length ?? 0).toBe(1);
});

it('does not run bare-label operation matching for zero-input exe calls', async () => {
  const env = createEnv();
  const labelGuard = parseSync(
    '/guard before @retryableCheck for retryable = when [ @mx.op.type == "exe" => deny "should not run" \n * => allow ]'
  )[0] as DirectiveNode;
  await evaluateDirective(labelGuard, env);

  const exeDirective = parseSync('/exe retryable @seed() = "ok"')[0] as DirectiveNode;
  await evaluateDirective(exeDirective, env);

  const directive = parseSync('/show @seed()')[0] as DirectiveNode;
  await expect(evaluateDirective(directive, env)).resolves.toBeDefined();
});

it('composes multiple before label transforms in guard registration order', async () => {
  const env = createEnv();
  const firstGuard = parseSync(
    '/guard before @first for secret = when [ * => allow `A-@input` ]'
  )[0] as DirectiveNode;
  const secondGuard = parseSync(
    '/guard before @second for secret = when [ * => allow `B-@input` ]'
  )[0] as DirectiveNode;
  await evaluateDirective(firstGuard, env);
  await evaluateDirective(secondGuard, env);

  env.setVariable(
    'secretVar',
    createSimpleTextVariable(
      'secretVar',
      'test',
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

  const effects = env.getEffectHandler() as TestEffectHandler;
  expect(effects.getOutput().trim()).toBe('B-A-test');
});

it('applies conditional before label transforms using the latest transformed input', async () => {
  const env = createEnv();
  const firstGuard = parseSync(
    '/guard before @first for secret = when [ * => allow `A-@input` ]'
  )[0] as DirectiveNode;
  const conditionalGuard = parseSync(
    '/guard before @second for secret = when [ !@input.startsWith("A-") => allow `B-@input` \n * => allow ]'
  )[0] as DirectiveNode;
  await evaluateDirective(firstGuard, env);
  await evaluateDirective(conditionalGuard, env);

  env.setVariable(
    'secretVar',
    createSimpleTextVariable(
      'secretVar',
      'test',
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

  const effects = env.getEffectHandler() as TestEffectHandler;
  expect(effects.getOutput().trim()).toBe('A-test');
});

it('applies op:exe guards to bare run-exec statements and var-assigned exec calls', async () => {
  const env = createEnv();
  const guardDirective = parseSync(
    '/guard @blockExec for secret = when [ * => deny "blocked exec" ]'
  )[0] as DirectiveNode;
  await evaluateDirective(guardDirective, env);

  const exeDirective = parseSync('/exe @handler(value) = ::@value::')[0] as DirectiveNode;
  await evaluateDirective(exeDirective, env);

  env.setVariable(
    'key',
    createSimpleTextVariable(
      'key',
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

  const bareInvocation = parseSync('/@handler(@key)')[0] as DirectiveNode;
  await expect(evaluateDirective(bareInvocation, env)).rejects.toThrow(/blocked exec/);

  const assignedInvocation = parseSync('/var @result = @handler(@key)')[0] as DirectiveNode;
  await expect(evaluateDirective(assignedInvocation, env)).rejects.toThrow(/blocked exec/);
});

it('exposes canonical named operation refs to guard conditions', async () => {
  const env = createEnv();
  const guardDirective = parseSync(
    '/guard before @gate for op:named:sendEmail = when [ @mx.op.named == "op:named:sendemail" => deny "blocked named op" \n * => allow ]'
  )[0] as DirectiveNode;
  await evaluateDirective(guardDirective, env);

  const exeDirective = parseSync('/exe @sendEmail(value) = ::@value::')[0] as DirectiveNode;
  await evaluateDirective(exeDirective, env);

  const directive = parseSync('/show @sendEmail("hi")')[0] as DirectiveNode;
  await expect(evaluateDirective(directive, env)).rejects.toThrow(/blocked named op/);
});

it('fires before guards for exec arguments reached through field access', async () => {
  const env = createEnv();
  const labelGuard = parseSync(
    '/guard before @byLabel for untrusted = when [ * => deny "blocked untrusted" ]'
  )[0] as DirectiveNode;
  const exeDirective = parseSync('/exe @emit(value) = ::@value::')[0] as DirectiveNode;
  await evaluateDirective(labelGuard, env);
  await evaluateDirective(exeDirective, env);
  env.setVariable(
    'bad',
    createSimpleTextVariable(
      'bad',
      'danger',
      {
        directive: 'var',
        syntax: 'quoted',
        hasInterpolation: false,
        isMultiLine: false
      },
      {
        security: makeSecurityDescriptor({ labels: ['untrusted'] })
      }
    )
  );
  env.setVariable(
    'args',
    createObjectVariable(
      'args',
      { data: 'danger' },
      false,
      {
        directive: 'var',
        syntax: 'object',
        hasInterpolation: false,
        isMultiLine: false
      },
      {
        security: makeSecurityDescriptor({ labels: ['untrusted'] })
      }
    )
  );

  const bareInvocation: ExecInvocation = {
    type: 'ExecInvocation',
    commandRef: {
      identifier: [{ type: 'VariableReference', identifier: 'emit' }],
      args: [{ type: 'VariableReference', identifier: 'bad' }]
    }
  };
  const fieldInvocation: ExecInvocation = {
    type: 'ExecInvocation',
    commandRef: {
      identifier: [{ type: 'VariableReference', identifier: 'emit' }],
      args: [
        {
          type: 'VariableReference',
          identifier: 'args',
          fields: [{ type: 'field', value: 'data', optional: false }]
        }
      ]
    }
  };

  await expect(evaluateExecInvocation(bareInvocation, env)).rejects.toThrow('blocked untrusted');
  await expect(evaluateExecInvocation(fieldInvocation, env)).rejects.toThrow('blocked untrusted');
});

it('lets a privileged allow override an unlocked policy defaults denial', async () => {
  const env = createEnv();
  await evaluateDirective(
    parseSync('/policy @task = { defaults: { rules: ["no-untrusted-destructive"] } }')[0] as DirectiveNode,
    env
  );
  await evaluateDirective(
    parseSync('/guard privileged @allowKnown before destructive = when [ @input[0] == "allow-me" => allow ]')[0] as DirectiveNode,
    env
  );
  await evaluateDirective(parseSync('/var untrusted @payload = "allow-me"')[0] as DirectiveNode, env);
  await evaluateDirective(parseSync('/exe destructive @emit(value) = ::@value::')[0] as DirectiveNode, env);

  const invocation: ExecInvocation = {
    type: 'ExecInvocation',
    commandRef: {
      identifier: [{ type: 'VariableReference', identifier: 'emit' }],
      args: [{ type: 'VariableReference', identifier: 'payload' }]
    }
  };

  const result = await evaluateExecInvocation(invocation, env);
  const value = isStructuredValue(result.value) ? result.value.text : result.value;
  expect(String(value)).toBe('allow-me');
});

it('lets a privileged allow override an unlocked no-destroy-unknown denial', async () => {
  const env = createEnv();
  await evaluateDirective(
    parseSync('/policy @task = { defaults: { rules: ["no-destroy-unknown"] } }')[0] as DirectiveNode,
    env
  );
  await evaluateDirective(
    parseSync('/guard privileged @allowKnown before destructive:targeted = when [ @input[0] == "allow-me" => allow ]')[0] as DirectiveNode,
    env
  );
  await evaluateDirective(parseSync('/var @payload = "allow-me"')[0] as DirectiveNode, env);
  await evaluateDirective(parseSync('/exe destructive:targeted @destroy(value) = ::@value::')[0] as DirectiveNode, env);

  const invocation: ExecInvocation = {
    type: 'ExecInvocation',
    commandRef: {
      identifier: [{ type: 'VariableReference', identifier: 'destroy' }],
      args: [{ type: 'VariableReference', identifier: 'payload' }]
    }
  };

  const result = await evaluateExecInvocation(invocation, env);
  const value = isStructuredValue(result.value) ? result.value.text : result.value;
  expect(String(value)).toBe('allow-me');
});

it('lets a privileged allow override an unlocked policy label denial', async () => {
  const env = createEnv();
  await evaluateDirective(
    parseSync('/policy @task = { labels: { untrusted: { deny: ["destructive"] } } }')[0] as DirectiveNode,
    env
  );
  await evaluateDirective(
    parseSync('/guard privileged @allowKnown before destructive = when [ @input[0] == "allow-me" => allow ]')[0] as DirectiveNode,
    env
  );
  await evaluateDirective(parseSync('/var untrusted @payload = "allow-me"')[0] as DirectiveNode, env);
  await evaluateDirective(parseSync('/exe destructive @emit(value) = ::@value::')[0] as DirectiveNode, env);

  const invocation: ExecInvocation = {
    type: 'ExecInvocation',
    commandRef: {
      identifier: [{ type: 'VariableReference', identifier: 'emit' }],
      args: [{ type: 'VariableReference', identifier: 'payload' }]
    }
  };

  const result = await evaluateExecInvocation(invocation, env);
  const value = isStructuredValue(result.value) ? result.value.text : result.value;
  expect(String(value)).toBe('allow-me');
});

it('keeps locked policy denials above privileged allows', async () => {
  const env = createEnv();
  await evaluateDirective(
    parseSync('/policy @task = { locked: true, defaults: { rules: ["no-untrusted-destructive"] } }')[0] as DirectiveNode,
    env
  );
  await evaluateDirective(
    parseSync('/guard privileged @allowKnown before destructive = when [ @input[0] == "allow-me" => allow ]')[0] as DirectiveNode,
    env
  );
  await evaluateDirective(parseSync('/var untrusted @payload = "allow-me"')[0] as DirectiveNode, env);
  await evaluateDirective(parseSync('/exe destructive @emit(value) = ::@value::')[0] as DirectiveNode, env);

  const invocation: ExecInvocation = {
    type: 'ExecInvocation',
    commandRef: {
      identifier: [{ type: 'VariableReference', identifier: 'emit' }],
      args: [{ type: 'VariableReference', identifier: 'payload' }]
    }
  };

  await expect(evaluateExecInvocation(invocation, env)).rejects.toThrow(
    "Rule 'no-untrusted-destructive': label 'untrusted' cannot flow to 'destructive'"
  );
});

it('keeps locked no-destroy-unknown denials above privileged allows', async () => {
  const env = createEnv();
  await evaluateDirective(
    parseSync('/policy @task = { locked: true, defaults: { rules: ["no-destroy-unknown"] } }')[0] as DirectiveNode,
    env
  );
  await evaluateDirective(
    parseSync('/guard privileged @allowKnown before destructive:targeted = when [ @input[0] == "allow-me" => allow ]')[0] as DirectiveNode,
    env
  );
  await evaluateDirective(parseSync('/var @payload = "allow-me"')[0] as DirectiveNode, env);
  await evaluateDirective(parseSync('/exe destructive:targeted @destroy(value) = ::@value::')[0] as DirectiveNode, env);

  const invocation: ExecInvocation = {
    type: 'ExecInvocation',
    commandRef: {
      identifier: [{ type: 'VariableReference', identifier: 'destroy' }],
      args: [{ type: 'VariableReference', identifier: 'payload' }]
    }
  };

  await expect(evaluateExecInvocation(invocation, env)).rejects.toThrow(
    "Rule 'no-destroy-unknown': destructive:targeted target must carry 'known'"
  );
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
