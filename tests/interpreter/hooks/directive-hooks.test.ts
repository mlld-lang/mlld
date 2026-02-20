import { describe, it, expect } from 'vitest';
import { parseSync } from '@grammar/parser';
import type { DirectiveNode } from '@core/types';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { Environment } from '@interpreter/env/Environment';
import { evaluateDirective } from '@interpreter/eval/directive';
import { createSimpleTextVariable } from '@core/types/variable';
import { asText } from '@interpreter/utils/structured-value';

function createEnv(): Environment {
  return new Environment(new MemoryFileSystem(), new PathService(), '/');
}

describe('directive hook infrastructure', () => {
  it('runs custom hooks around directive evaluation', async () => {
    const env = createEnv();
    const hookEvents: string[] = [];

    env.getHookManager().registerPre(async (_directive, _inputs, _env, operation) => {
      hookEvents.push(`pre:${operation?.type}`);
      return { action: 'continue' };
    });

    env.getHookManager().registerPost(async (_directive, result) => {
      hookEvents.push('post');
      return result;
    });

    const directive = parseSync('/var @foo = "bar"')[0] as DirectiveNode;
    await evaluateDirective(directive, env);

    expect(hookEvents).toEqual(['pre:var', 'post']);
  });

  it('builds @mx.op from the context manager stack', () => {
    const env = createEnv();
    env.getContextManager().pushOperation({ type: 'diagnostic', labels: [] });
    const mxVar = env.getVariable('mx');
    env.getContextManager().popOperation();

    expect(mxVar).toBeDefined();
    expect((mxVar?.value as any)?.op?.type).toBe('diagnostic');
  });

  it('mirrors pipeline context into @mx.pipe namespace', () => {
    const env = createEnv();
    env.setPipelineContext({
      stage: 2,
      totalStages: 3,
      currentCommand: 'noop',
      input: '{"foo": "bar"}',
      previousOutputs: ['{"foo":"bar"}'],
      format: 'json',
      attemptCount: 2,
      attemptHistory: ['{"foo":"bar"}'],
      hint: 'retry please',
      hintHistory: ['retry please']
    });

    const mx = env.getVariable('mx')?.value as any;
    expect(mx).toBeDefined();
    expect(mx.isPipeline).toBe(true);
    expect(mx.pipe.stage).toBe(2);
    expect(mx.pipe.try).toBe(2);
    expect(mx.input.foo).toBe('bar');
  });

  it('extracts /show directive inputs for pre-hooks', async () => {
    const env = createEnv();
    env.setVariable(
      'foo',
      createSimpleTextVariable(
        'foo',
        'value',
        {
          directive: 'var',
          syntax: 'quoted',
          hasInterpolation: false,
          isMultiLine: false
        }
      )
    );

    let captured: readonly unknown[] = [];
    env.getHookManager().registerPre(async (directive, inputs) => {
      if (directive.kind === 'show') {
        captured = inputs;
      }
      return { action: 'continue' };
    });

    const directive = parseSync('/show @foo')[0] as DirectiveNode;
    await evaluateDirective(directive, env);

    expect(captured.length).toBe(1);
    expect((captured[0] as any)?.name).toBe('foo');
  });

  it('records run command preview in operation context', async () => {
    const env = createEnv();
    let observedCommand: string | undefined;

    env.getHookManager().registerPre(async (directive, _inputs, _env, operation) => {
      if (directive.kind === 'run') {
        observedCommand = operation?.command;
        return { action: 'abort', metadata: { reason: 'skip run' } };
      }
      return { action: 'continue' };
    });

    const directive = parseSync('/run { echo "hi" }')[0] as DirectiveNode;
    await expect(evaluateDirective(directive, env)).rejects.toThrow(/skip run/);
    expect(observedCommand).toContain('echo');
  });

  it('records output target path in operation context', async () => {
    const env = createEnv();
    env.setVariable(
      'foo',
      createSimpleTextVariable(
        'foo',
        'value',
        {
          directive: 'var',
          syntax: 'quoted',
          hasInterpolation: false,
          isMultiLine: false
        }
      )
    );
    let observedTarget: string | undefined;

    env.getHookManager().registerPre(async (directive, _inputs, _env, operation) => {
      if (directive.kind === 'output') {
        observedTarget = operation?.target;
        return { action: 'abort', metadata: { reason: 'skip output' } };
      }
      return { action: 'continue' };
    });

    const directive = parseSync('/output @foo to "out.txt"')[0] as DirectiveNode;
    await expect(evaluateDirective(directive, env)).rejects.toThrow(/skip output/);
    expect(observedTarget).toBe('out.txt');
  });

  it('extracts /output source variables for pre-hooks', async () => {
    const env = createEnv();
    env.setVariable(
      'foo',
      createSimpleTextVariable(
        'foo',
        'value',
        {
          directive: 'var',
          syntax: 'quoted',
          hasInterpolation: false,
          isMultiLine: false
        }
      )
    );

    let captured: readonly unknown[] = [];
    env.getHookManager().registerPre(async (directive, inputs) => {
      if (directive.kind === 'output') {
        captured = inputs;
        return { action: 'abort', metadata: { reason: 'skip output' } };
      }
      return { action: 'continue' };
    });

    const directive = parseSync('/output @foo to "out.txt"')[0] as DirectiveNode;
    await expect(evaluateDirective(directive, env)).rejects.toThrow(/skip output/);

    expect(captured.length).toBe(1);
    expect((captured[0] as any)?.name).toBe('foo');
  });

  it('extracts /run command input for pre-hooks', async () => {
    const env = createEnv();
    let capturedCommand: string | undefined;

    env.getHookManager().registerPre(async (directive, inputs) => {
      if (directive.kind === 'run') {
        const commandVar = inputs[0] as any;
        capturedCommand = commandVar?.value;
        return { action: 'abort', metadata: { reason: 'skip run' } };
      }
      return { action: 'continue' };
    });

    const directive = parseSync('/run { echo "hi" }')[0] as DirectiveNode;
    await expect(evaluateDirective(directive, env)).rejects.toThrow(/skip run/);
    expect(capturedCommand).toContain('echo');
  });

  it('extracts /run exec inputs for pre-hooks', async () => {
    const env = createEnv();
    const execDirective = parseSync('/exe @emit() = js { return "ok"; }')[0] as DirectiveNode;
    await evaluateDirective(execDirective, env);

    let capturedExecName: string | undefined;
    env.getHookManager().registerPre(async (directive, inputs) => {
      if (directive.kind === 'run') {
        const execVar = inputs[0] as any;
        capturedExecName = execVar?.name;
        return { action: 'abort', metadata: { reason: 'skip run' } };
      }
      return { action: 'continue' };
    });

    const runDirective = parseSync('/run @emit()')[0] as DirectiveNode;
    await expect(evaluateDirective(runDirective, env)).rejects.toThrow(/skip run/);
    expect(capturedExecName).toBe('emit');
  });

  it('retries run exec directives when after guards request retry', async () => {
    const env = createEnv();
    const counterKey = '__mlldGuardAfterRunExecRetryCount';
    (globalThis as Record<string, unknown>)[counterKey] = 0;

    const execDirective = parseSync(
      `/exe @emit() = js { globalThis.${counterKey} = (globalThis.${counterKey} ?? 0) + 1; return globalThis.${counterKey}; }`
    )[0] as DirectiveNode;
    await evaluateDirective(execDirective, env);

    const guardDirective = parseSync(
      '/guard after @retryOnce for op:run = when [ @mx.guard.try < 2 => retry "again" \n * => allow ]'
    )[0] as DirectiveNode;
    await evaluateDirective(guardDirective, env);

    const runDirective = parseSync('/run @emit()')[0] as DirectiveNode;
    const result = await evaluateDirective(runDirective, env);
    expect(asText(result.value)).toBe('2');
  });

  it('exposes /var assignments to pre-hooks without duplicate evaluation', async () => {
    const env = createEnv();
    let capturedName: string | undefined;
    let capturedValue: string | undefined;

    env.getHookManager().registerPre(async (directive, inputs) => {
      if (directive.kind === 'var') {
        const variable = inputs[0] as any;
        capturedName = variable?.name;
        capturedValue = variable?.value;
      }
      return { action: 'continue' };
    });

    const directive = parseSync('/var @foo = "bar"')[0] as DirectiveNode;
    await evaluateDirective(directive, env);

    const stored = env.getVariable('foo');
    expect(stored?.value).toBe('bar');
    expect(capturedName).toBe('foo');
    expect(capturedValue).toBe('bar');
  });

  it('provides guard input helpers to pre-hooks', async () => {
    const env = createEnv();
    env.setVariable(
      'foo',
      createSimpleTextVariable(
        'foo',
        'guard helper sample',
        {
          directive: 'var',
          syntax: 'quoted',
          hasInterpolation: false,
          isMultiLine: false
        }
      )
    );

    let tokenSnapshot: number[] = [];
    env.getHookManager().registerPre(async (directive, _inputs, _env, _operation, helpers) => {
      if (directive.kind === 'show') {
        tokenSnapshot = helpers?.guard?.mx.tokens ?? [];
        return { action: 'abort', metadata: { reason: 'guard helper capture' } };
      }
      return { action: 'continue' };
    });

    const directive = parseSync('/show @foo')[0] as DirectiveNode;
    await expect(evaluateDirective(directive, env)).rejects.toThrow(/guard helper capture/);
    expect(tokenSnapshot.length).toBe(1);
    expect(tokenSnapshot[0]).toBeGreaterThan(0);
  });

  // /var extraction deferred: executing value in hook context can trigger
  // side effects twice (see Phase 4 guard plan).
});
