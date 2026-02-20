import { describe, expect, it } from 'vitest';
import { EventEmitter } from 'events';
import type { VariableSource } from '@core/types/variable';
import { createSimpleTextVariable } from '@core/types/variable';
import { Environment } from '@interpreter/env/Environment';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { asText, isStructuredValue } from '@interpreter/utils/structured-value';
import { wrapExecResult } from '@interpreter/utils/structured-exec';
import { executeNodeHandler } from './execute-node';

const TEXT_SOURCE: VariableSource = {
  directive: 'var',
  syntax: 'quoted',
  hasInterpolation: false,
  isMultiLine: false
};

function createEnv(): Environment {
  return new Environment(new MemoryFileSystem(), new PathService(), '/');
}

function setParam(execEnv: Environment, name: string, value: string): void {
  execEnv.setParameterVariable(
    name,
    createSimpleTextVariable(name, value, TEXT_SOURCE, {
      internal: {
        isSystem: true,
        isParameter: true
      }
    })
  );
}

describe('executeNodeHandler branch extraction', () => {
  it('executes node function path and returns wrapped output', async () => {
    const env = createEnv();
    const execEnv = env.createChild();
    setParam(execEnv, 'input', 'PIPE');
    setParam(execEnv, 'extra', 'TAIL');

    const result = await executeNodeHandler({
      execDef: {
        type: 'nodeFunction',
        fn: (input: string, extra: string) => ({ input, extra }),
        paramNames: ['input', 'extra']
      },
      execEnv,
      commandVar: { name: 'nodeFn' },
      args: [],
      boundArgs: [],
      baseParamNames: ['input', 'extra'],
      finalizeResult: value => wrapExecResult(value)
    });

    expect(isStructuredValue(result)).toBe(true);
    expect((result as any).data).toEqual({ input: 'PIPE', extra: 'TAIL' });
    expect(asText(result as any)).toContain('PIPE');
  });

  it('preserves failing invocation behavior for node functions', async () => {
    const env = createEnv();
    const execEnv = env.createChild();
    setParam(execEnv, 'input', 'PIPE');

    await expect(
      executeNodeHandler({
        execDef: {
          type: 'nodeFunction',
          fn: () => {
            throw new Error('node-fn-failed');
          }
        },
        execEnv,
        commandVar: { name: 'nodeFn' },
        args: [],
        boundArgs: [],
        baseParamNames: ['input'],
        finalizeResult: value => value
      })
    ).rejects.toThrow('node-fn-failed');
  });

  it('keeps node class failure behavior', async () => {
    const env = createEnv();
    const execEnv = env.createChild();

    await expect(
      executeNodeHandler({
        execDef: {
          type: 'nodeClass'
        },
        execEnv,
        commandVar: { name: 'NodeClassStage' },
        args: [],
        boundArgs: [],
        baseParamNames: [],
        finalizeResult: value => value
      })
    ).rejects.toThrow(`Node class 'NodeClassStage' requires new`);
  });

  it('keeps event-emitter rejection semantics', async () => {
    const env = createEnv();
    const execEnv = env.createChild();

    await expect(
      executeNodeHandler({
        execDef: {
          type: 'nodeFunction',
          fn: () => new EventEmitter()
        },
        execEnv,
        commandVar: { name: 'streamy' },
        args: [],
        boundArgs: [],
        baseParamNames: [],
        finalizeResult: value => value
      })
    ).rejects.toThrow(`Node function 'streamy' returns an EventEmitter and requires subscriptions`);
  });

  it('keeps legacy-stream rejection semantics', async () => {
    const env = createEnv();
    const execEnv = env.createChild();

    await expect(
      executeNodeHandler({
        execDef: {
          type: 'nodeFunction',
          fn: () => ({
            pipe: () => undefined,
            on: () => undefined
          })
        },
        execEnv,
        commandVar: { name: 'legacyStream' },
        args: [],
        boundArgs: [],
        baseParamNames: [],
        finalizeResult: value => value
      })
    ).rejects.toThrow(`Node function 'legacyStream' returns a legacy stream without async iterator support`);
  });
});
