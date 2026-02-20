import { afterEach, describe, expect, it, vi } from 'vitest';
import { Environment } from '@interpreter/env/Environment';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { isStructuredValue } from '@interpreter/utils/structured-value';
import { wrapExecResult } from '@interpreter/utils/structured-exec';
import { executeCodeHandler } from './execute-code';
import { executeNodeHandler } from './execute-node';
import { executeTemplateHandler } from './execute-template';
import { executeCommandRefHandler } from './execute-command-ref';

const { interpolateMock } = vi.hoisted(() => ({
  interpolateMock: vi.fn()
}));

vi.mock('@interpreter/core/interpreter', () => ({
  interpolate: interpolateMock
}));

function createEnv(): Environment {
  return new Environment(new MemoryFileSystem(), new PathService(), '/');
}

describe('non-command branch matrix parity', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    interpolateMock.mockReset();
  });

  it('keeps normalized output-shape parity across code, node, template, and commandRef handlers', async () => {
    const env = createEnv();
    const execEnv = env.createChild();
    const leafExec = {
      type: 'executable',
      name: 'leaf',
      internal: { executableDef: { type: 'template' } }
    };
    execEnv.setVariable('leaf', leafExec as any);
    vi.spyOn(env, 'executeCode').mockResolvedValue('shared-output');
    interpolateMock
      .mockResolvedValueOnce('return "shared-output";')
      .mockResolvedValueOnce('shared-output');

    const codeResult = await executeCodeHandler({
      env,
      execEnv,
      execDef: {
        type: 'code',
        language: 'javascript',
        codeTemplate: [{ type: 'Text', content: 'noop' }],
        paramNames: []
      },
      finalizeResult: value => value
    });

    const nodeResult = await executeNodeHandler({
      execDef: {
        type: 'nodeFunction',
        fn: () => 'shared-output'
      },
      execEnv,
      commandVar: { name: 'nodeStage' },
      args: [],
      boundArgs: [],
      baseParamNames: [],
      finalizeResult: value => value
    });

    const templateResult = await executeTemplateHandler({
      execEnv,
      execDef: {
        type: 'template',
        template: [{ type: 'Text', content: 'noop' }]
      }
    });

    const commandRefResult = await executeCommandRefHandler({
      env,
      execEnv,
      execDef: {
        type: 'commandRef',
        commandRef: 'leaf'
      },
      finalizeResult: value => value,
      executeCommandVariable: async () => 'shared-output'
    });

    const shape = (value: unknown) => ({ kind: typeof value, isArray: Array.isArray(value) });
    expect(codeResult).toBe('shared-output');
    expect(nodeResult).toBe('shared-output');
    expect(templateResult).toBe('shared-output');
    expect(commandRefResult).toBe('shared-output');
    expect(shape(codeResult)).toEqual(shape(nodeResult));
    expect(shape(codeResult)).toEqual(shape(templateResult));
    expect(shape(codeResult)).toEqual(shape(commandRefResult));
  });

  it('keeps label propagation parity for finalized non-template branches', async () => {
    const env = createEnv();
    const execEnv = env.createChild();
    const leafExec = {
      type: 'executable',
      name: 'leaf',
      internal: { executableDef: { type: 'template' } }
    };
    execEnv.setVariable('leaf', leafExec as any);
    vi.spyOn(env, 'executeCode').mockResolvedValue('shared-output');
    interpolateMock.mockResolvedValue('return "shared-output";');

    const finalizeResult = (value: unknown) => {
      const wrapped = wrapExecResult(value);
      wrapped.mx = {
        ...(wrapped.mx ?? {}),
        labels: [...(wrapped.mx?.labels ?? []), 'policy-label']
      };
      return wrapped;
    };

    const codeResult = await executeCodeHandler({
      env,
      execEnv,
      execDef: {
        type: 'code',
        language: 'javascript',
        codeTemplate: [{ type: 'Text', content: 'noop' }],
        paramNames: []
      },
      finalizeResult
    });

    const nodeResult = await executeNodeHandler({
      execDef: {
        type: 'nodeFunction',
        fn: () => 'shared-output'
      },
      execEnv,
      commandVar: { name: 'nodeStage' },
      args: [],
      boundArgs: [],
      baseParamNames: [],
      finalizeResult
    });

    const commandRefResult = await executeCommandRefHandler({
      env,
      execEnv,
      execDef: {
        type: 'commandRef',
        commandRef: 'leaf'
      },
      finalizeResult,
      executeCommandVariable: async () => finalizeResult('shared-output')
    });

    const templateResult = await executeTemplateHandler({
      execEnv,
      execDef: {
        type: 'template',
        template: [{ type: 'Text', content: 'noop' }]
      }
    });

    expect(isStructuredValue(codeResult)).toBe(true);
    expect(isStructuredValue(nodeResult)).toBe(true);
    expect(isStructuredValue(commandRefResult)).toBe(true);
    expect((codeResult as any).mx?.labels ?? []).toContain('policy-label');
    expect((nodeResult as any).mx?.labels ?? []).toContain('policy-label');
    expect((commandRefResult as any).mx?.labels ?? []).toContain('policy-label');
    expect(typeof templateResult).toBe('string');
  });
});
