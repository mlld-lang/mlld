import { afterEach, describe, expect, it, vi } from 'vitest';
import { Environment } from '@interpreter/env/Environment';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { isStructuredValue } from '@interpreter/utils/structured-value';
import { wrapExecResult } from '@interpreter/utils/structured-exec';
import { executeTemplateHandler } from './execute-template';

const { interpolateMock } = vi.hoisted(() => ({
  interpolateMock: vi.fn()
}));

vi.mock('@interpreter/core/interpreter', () => ({
  interpolate: interpolateMock
}));

function createEnv(): Environment {
  return new Environment(new MemoryFileSystem(), new PathService(), '/');
}

describe('executeTemplateHandler branch extraction', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    interpolateMock.mockReset();
  });

  it('returns text interpolation output unchanged', async () => {
    interpolateMock.mockResolvedValue('template:PIPE');
    const env = createEnv();
    const execEnv = env.createChild();

    const result = await executeTemplateHandler({
      execEnv,
      execDef: {
        type: 'template',
        template: [{ type: 'Text', content: 'noop' }]
      }
    });

    expect(result).toBe('template:PIPE');
  });

  it('returns structured interpolation output unchanged', async () => {
    const structured = wrapExecResult({ ok: true });
    interpolateMock.mockResolvedValue(structured);
    const env = createEnv();
    const execEnv = env.createChild();

    const result = await executeTemplateHandler({
      execEnv,
      execDef: {
        type: 'template',
        template: [{ type: 'Text', content: 'noop' }]
      }
    });

    expect(result).toBe(structured);
    expect(isStructuredValue(result)).toBe(true);
  });

  it('uses template file directory for interpolation when provided', async () => {
    interpolateMock.mockResolvedValue('template:file');
    const env = createEnv();
    const execEnv = env.createChild('/call-site');

    await executeTemplateHandler({
      execEnv,
      execDef: {
        type: 'template',
        template: [{ type: 'Text', content: '<shared/context.md>' }],
        templateFileDirectory: '/template-dir'
      }
    });

    expect(interpolateMock).toHaveBeenCalledTimes(1);
    const interpolationEnv = interpolateMock.mock.calls[0][1] as Environment;
    expect(interpolationEnv.getFileDirectory()).toBe('/template-dir');
  });
});
