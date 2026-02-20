import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'events';
import { Environment } from '@interpreter/env/Environment';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import type { StructuredValue } from '@interpreter/utils/structured-value';
import { executeCommandRefHandler } from './execute-command-ref';
import { executeNodeHandler } from './execute-node';

const { evaluateExecInvocationMock } = vi.hoisted(() => ({
  evaluateExecInvocationMock: vi.fn()
}));

vi.mock('@interpreter/eval/exec-invocation', () => ({
  evaluateExecInvocation: evaluateExecInvocationMock
}));

function createEnv(): Environment {
  return new Environment(new MemoryFileSystem(), new PathService(), '/');
}

function executable(name: string, execDef: any): any {
  return {
    type: 'executable',
    name,
    internal: {
      executableDef: execDef
    }
  };
}

function createDispatcher(rootEnv: Environment) {
  const execute = async (
    commandVar: any,
    _args: any[],
    scopeEnv: Environment,
    stdinInput?: string,
    structuredInput?: StructuredValue,
    hookOptions?: unknown
  ): Promise<unknown> => {
    const execDef = commandVar?.internal?.executableDef;
    if (!execDef) {
      throw new Error(`Missing executable definition for ${commandVar?.name ?? 'anonymous'}`);
    }
    if (execDef.type === 'commandRef') {
      return executeCommandRefHandler({
        env: rootEnv,
        execEnv: scopeEnv,
        execDef,
        stdinInput,
        structuredInput,
        hookOptions,
        finalizeResult: value => value,
        executeCommandVariable: execute
      });
    }
    if (execDef.type === 'template') {
      return `leaf:${stdinInput ?? ''}`;
    }
    if (execDef.type === 'nodeFunction' || execDef.type === 'nodeClass') {
      return executeNodeHandler({
        execDef,
        execEnv: scopeEnv,
        commandVar,
        args: [],
        boundArgs: [],
        baseParamNames: [],
        stdinInput,
        structuredInput,
        finalizeResult: value => value
      });
    }
    if (execDef.type === 'retry') {
      return { value: 'retry', hint: { reason: 'again' } };
    }
    throw new Error(`Unsupported test executable type: ${execDef.type}`);
  };
  return execute;
}

describe('executeCommandRefHandler branch extraction', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    evaluateExecInvocationMock.mockReset();
  });

  it('resolves recursive commandRef chains with depth > 1', async () => {
    const env = createEnv();
    const execEnv = env.createChild();

    execEnv.setVariable('leaf', executable('leaf', { type: 'template' }) as any);
    execEnv.setVariable('middle', executable('middle', { type: 'commandRef', commandRef: 'leaf' }) as any);

    const result = await executeCommandRefHandler({
      env,
      execEnv,
      execDef: { type: 'commandRef', commandRef: 'middle' },
      stdinInput: 'PIPE-IN',
      finalizeResult: value => value,
      executeCommandVariable: createDispatcher(env)
    });

    expect(result).toBe('leaf:PIPE-IN');
  });

  it('preserves failing recursive path behavior', async () => {
    const env = createEnv();
    const execEnv = env.createChild();

    execEnv.setVariable('middle', executable('middle', { type: 'commandRef', commandRef: 'ghost' }) as any);

    await expect(
      executeCommandRefHandler({
        env,
        execEnv,
        execDef: { type: 'commandRef', commandRef: 'middle' },
        stdinInput: 'PIPE-IN',
        finalizeResult: value => value,
        executeCommandVariable: createDispatcher(env)
      })
    ).rejects.toThrow('Referenced executable not found: ghost');
  });

  it('keeps retry signal passthrough for recursive commandRef execution', async () => {
    const env = createEnv();
    const execEnv = env.createChild();

    execEnv.setVariable('retryLeaf', executable('retryLeaf', { type: 'retry' }) as any);
    execEnv.setVariable('middle', executable('middle', { type: 'commandRef', commandRef: 'retryLeaf' }) as any);

    const result = await executeCommandRefHandler({
      env,
      execEnv,
      execDef: { type: 'commandRef', commandRef: 'middle' },
      stdinInput: 'PIPE-IN',
      finalizeResult: value => value,
      executeCommandVariable: createDispatcher(env)
    });

    expect(result).toEqual({ value: 'retry', hint: { reason: 'again' } });
  });

  it('keeps event-emitter and legacy-stream rejection semantics through recursion', async () => {
    const env = createEnv();
    const execEnv = env.createChild();

    execEnv.setVariable(
      'eventSource',
      executable('eventSource', {
        type: 'nodeFunction',
        fn: () => new EventEmitter()
      }) as any
    );
    execEnv.setVariable(
      'legacySource',
      executable('legacySource', {
        type: 'nodeFunction',
        fn: () => ({ pipe: () => undefined, on: () => undefined })
      }) as any
    );

    await expect(
      executeCommandRefHandler({
        env,
        execEnv,
        execDef: { type: 'commandRef', commandRef: 'eventSource' },
        stdinInput: 'PIPE-IN',
        finalizeResult: value => value,
        executeCommandVariable: createDispatcher(env)
      })
    ).rejects.toThrow(`Node function 'eventSource' returns an EventEmitter and requires subscriptions`);

    await expect(
      executeCommandRefHandler({
        env,
        execEnv,
        execDef: { type: 'commandRef', commandRef: 'legacySource' },
        stdinInput: 'PIPE-IN',
        finalizeResult: value => value,
        executeCommandVariable: createDispatcher(env)
      })
    ).rejects.toThrow(`Node function 'legacySource' returns a legacy stream without async iterator support`);
  });

  it('keeps commandRefAst invocation behavior via evaluateExecInvocation', async () => {
    evaluateExecInvocationMock.mockResolvedValue({ value: 'from-ast' });

    const env = createEnv();
    const execEnv = env.createChild();
    const finalizeResult = vi.fn(value => `wrapped:${String(value)}`);

    const result = await executeCommandRefHandler({
      env,
      execEnv,
      execDef: {
        type: 'commandRef',
        commandRefAst: { type: 'CommandReference', identifier: 'leaf', args: [] }
      },
      finalizeResult,
      executeCommandVariable: createDispatcher(env)
    });

    expect(evaluateExecInvocationMock).toHaveBeenCalledTimes(1);
    expect(finalizeResult).toHaveBeenCalledWith('from-ast');
    expect(result).toBe('wrapped:from-ast');
  });
});
