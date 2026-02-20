import { afterEach, describe, expect, it, vi } from 'vitest';
import type { VariableSource } from '@core/types/variable';
import { createSimpleTextVariable } from '@core/types/variable';
import { Environment } from '@interpreter/env/Environment';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import {
  asText,
  isStructuredValue,
  wrapStructured
} from '@interpreter/utils/structured-value';
import { executeCodeHandler } from './execute-code';

const {
  evaluateWhenExpressionMock,
  evaluateForeachCommandMock,
  evaluateForExpressionMock,
  evaluateLoopExpressionMock,
  extractVariableValueMock,
  interpolateMock
} = vi.hoisted(() => ({
  evaluateWhenExpressionMock: vi.fn(),
  evaluateForeachCommandMock: vi.fn(),
  evaluateForExpressionMock: vi.fn(),
  evaluateLoopExpressionMock: vi.fn(),
  extractVariableValueMock: vi.fn(),
  interpolateMock: vi.fn()
}));

vi.mock('@interpreter/eval/when-expression', () => ({
  evaluateWhenExpression: evaluateWhenExpressionMock
}));

vi.mock('@interpreter/eval/foreach', () => ({
  evaluateForeachCommand: evaluateForeachCommandMock
}));

vi.mock('@interpreter/eval/for', () => ({
  evaluateForExpression: evaluateForExpressionMock
}));

vi.mock('@interpreter/eval/loop', () => ({
  evaluateLoopExpression: evaluateLoopExpressionMock
}));

vi.mock('@interpreter/utils/variable-resolution', () => ({
  extractVariableValue: extractVariableValueMock
}));

vi.mock('@interpreter/core/interpreter', () => ({
  interpolate: interpolateMock
}));

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

describe('executeCodeHandler branch extraction', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    evaluateWhenExpressionMock.mockReset();
    evaluateForeachCommandMock.mockReset();
    evaluateForExpressionMock.mockReset();
    evaluateLoopExpressionMock.mockReset();
    extractVariableValueMock.mockReset();
    interpolateMock.mockReset();
  });

  it('passes through retry metadata for mlld-when', async () => {
    const retrySignal = { value: 'retry', hint: { reason: 'again' } };
    evaluateWhenExpressionMock.mockResolvedValue({ value: retrySignal });

    const env = createEnv();
    const execEnv = env.createChild();
    const result = await executeCodeHandler({
      env,
      execEnv,
      execDef: {
        type: 'code',
        language: 'mlld-when',
        codeTemplate: [{ type: 'WhenExpression' }]
      },
      finalizeResult: value => value
    });

    expect(result).toEqual(retrySignal);
  });

  it('covers mlld-foreach normalization behavior', async () => {
    evaluateForeachCommandMock.mockResolvedValue([
      wrapStructured({ id: 1 }, 'object', '{"id":1}'),
      '{"id":2}',
      'plain',
      3
    ]);

    const finalizeResult = vi.fn((value, options) => ({ value, options }));
    const env = createEnv();
    const execEnv = env.createChild();

    const result = await executeCodeHandler({
      env,
      execEnv,
      execDef: {
        type: 'code',
        language: 'mlld-foreach',
        codeTemplate: [{ type: 'ForeachExpression' }]
      },
      finalizeResult
    });

    expect(finalizeResult).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      value: [{ id: 1 }, { id: 2 }, 'plain', 3],
      options: {
        type: 'array',
        text: '[{"id":1},{"id":2},"plain",3]'
      }
    });
  });

  it('covers mlld-for and mlld-loop subpaths with stable typing', async () => {
    evaluateForExpressionMock.mockResolvedValue({ type: 'array' });
    extractVariableValueMock.mockResolvedValue(['a', 'b']);
    evaluateLoopExpressionMock.mockResolvedValue({ done: true });

    const env = createEnv();
    const execEnv = env.createChild();
    const finalizeResult = vi.fn((value, options) => ({ value, options }));

    const forResult = await executeCodeHandler({
      env,
      execEnv,
      execDef: {
        type: 'code',
        language: 'mlld-for',
        codeTemplate: [{ type: 'ForExpression' }]
      },
      finalizeResult
    });

    const loopResult = await executeCodeHandler({
      env,
      execEnv,
      execDef: {
        type: 'code',
        language: 'mlld-loop',
        codeTemplate: [{ type: 'LoopExpression' }]
      },
      finalizeResult
    });

    expect(forResult).toEqual({
      value: ['a', 'b'],
      options: { type: 'array', text: '["a","b"]' }
    });
    expect(loopResult).toEqual({
      value: { done: true },
      options: { type: 'object', text: '{"done":true}' }
    });
  });

  it('covers regular code path, parameter binding, and pipeline auto-parse', async () => {
    interpolateMock.mockResolvedValue('return "ok";');

    const env = createEnv();
    const execEnv = env.createChild();
    setParam(execEnv, 'input', '{"count":5}');
    setParam(execEnv, 'extra', 'EX');

    const executeCodeSpy = vi.spyOn(env, 'executeCode').mockResolvedValue('{"ok":true}');

    const result = await executeCodeHandler({
      env,
      execEnv,
      execDef: {
        type: 'code',
        language: 'javascript',
        codeTemplate: [{ type: 'Text', content: 'noop' }],
        paramNames: ['input', 'extra']
      },
      pipelineCtx: { stage: 1 },
      stageLanguage: 'javascript',
      finalizeResult: value => value
    });

    expect(executeCodeSpy).toHaveBeenCalledTimes(1);
    const params = executeCodeSpy.mock.calls[0]?.[2] as Record<string, unknown>;
    expect(params).toMatchObject({
      input: '{"count":5}',
      extra: 'EX'
    });
    expect(isStructuredValue(result)).toBe(true);
    expect((result as any).data).toEqual({ ok: true });
    expect(asText(result as any)).toBe('{"ok":true}');
  });
});
