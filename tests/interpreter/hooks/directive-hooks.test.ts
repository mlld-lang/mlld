import { describe, it, expect } from 'vitest';
import { parseSync } from '@grammar/parser';
import type { DirectiveNode } from '@core/types';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { Environment } from '@interpreter/env/Environment';
import { evaluateDirective } from '@interpreter/eval/directive';
import { createSimpleTextVariable } from '@core/types/variable';

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

  it('builds @ctx.op from the context manager stack', () => {
    const env = createEnv();
    env.getContextManager().pushOperation({ type: 'diagnostic', labels: [] });
    const ctxVar = env.getVariable('ctx');
    env.getContextManager().popOperation();

    expect(ctxVar).toBeDefined();
    expect((ctxVar?.value as any)?.op?.type).toBe('diagnostic');
  });

  it('mirrors pipeline context into @ctx.pipe namespace', () => {
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

    const ctx = env.getVariable('ctx')?.value as any;
    expect(ctx).toBeDefined();
    expect(ctx.isPipeline).toBe(true);
    expect(ctx.pipe.stage).toBe(2);
    expect(ctx.pipe.try).toBe(2);
    expect(ctx.input.foo).toBe('bar');
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

  // /var extraction deferred: executing value in hook context can trigger
  // side effects twice (see Phase 4 guard plan).
});
