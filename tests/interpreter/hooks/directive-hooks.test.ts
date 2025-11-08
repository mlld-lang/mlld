import { describe, it, expect } from 'vitest';
import { parseSync } from '@grammar/parser';
import type { DirectiveNode } from '@core/types';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { Environment } from '@interpreter/env/Environment';
import { evaluateDirective } from '@interpreter/eval/directive';

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
});
