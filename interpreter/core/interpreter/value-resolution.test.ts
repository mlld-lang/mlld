import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  createComputedVariable,
  createImportedVariable,
  createObjectVariable,
  createPathVariable,
  createPipelineInputVariable,
  createPrimitiveVariable,
  createSimpleTextVariable
} from '@core/types/variable';
import { wrapStructured } from '@interpreter/utils/structured-value';
import * as dataValueEvaluator from '@interpreter/eval/data-value-evaluator';
import { Environment } from '@interpreter/env/Environment';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { resolveVariableValue } from './value-resolution';

const SOURCE = {
  directive: 'var' as const,
  syntax: 'literal' as const,
  hasInterpolation: false,
  isMultiLine: false
};

function createEnv(): Environment {
  return new Environment(new MemoryFileSystem(), new PathService(), '/');
}

describe('value-resolution helper', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('resolves primitive and text-like values directly', async () => {
    const env = createEnv();
    const primitive = createPrimitiveVariable('count', 7, SOURCE);
    const text = createSimpleTextVariable('name', 'Ada', SOURCE);

    expect(await resolveVariableValue(primitive, env)).toBe(7);
    expect(await resolveVariableValue(text, env)).toBe('Ada');
  });

  it('resolves path and pipeline-input values with display extraction', async () => {
    const env = createEnv();
    const path = createPathVariable('file', '/tmp/demo.txt', './demo.txt', false, true, SOURCE);
    const pipelinePayload = wrapStructured({ ok: true }, 'json', '{"ok":true}');
    const pipelineInput = createPipelineInputVariable(
      'input',
      pipelinePayload as any,
      'json',
      '{"ok":true}',
      SOURCE
    );

    expect(await resolveVariableValue(path, env)).toBe('/tmp/demo.txt');
    expect(await resolveVariableValue(pipelineInput, env)).toBe('{"ok":true}');
  });

  it('keeps non-complex structured values unchanged', async () => {
    const env = createEnv();
    const value = { nested: { id: 1 } };
    const variable = createObjectVariable('obj', value, false, SOURCE);

    expect(await resolveVariableValue(variable, env)).toBe(value);
  });

  it('evaluates complex structured values through evaluateDataValue', async () => {
    const env = createEnv();
    const complexValue = { type: 'VariableReference', identifier: 'name' };
    const variable = createObjectVariable('obj', complexValue as any, true, SOURCE);
    const evaluateSpy = vi
      .spyOn(dataValueEvaluator, 'evaluateDataValue')
      .mockResolvedValue({ resolved: 'ok' });

    const result = await resolveVariableValue(variable, env);

    expect(evaluateSpy).toHaveBeenCalledWith(complexValue, env);
    expect(result).toEqual({ resolved: 'ok' });
  });

  it('returns imported and computed values unchanged', async () => {
    const env = createEnv();
    const imported = createImportedVariable(
      'moduleValue',
      { enabled: true },
      'object',
      './mod.mld',
      false,
      'moduleValue',
      SOURCE
    );
    const computed = createComputedVariable(
      'answer',
      { total: 42 },
      'js',
      'return { total: 42 };',
      SOURCE
    );

    expect(await resolveVariableValue(imported, env)).toEqual({ enabled: true });
    expect(await resolveVariableValue(computed, env)).toEqual({ total: 42 });
  });
});
