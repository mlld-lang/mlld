import { describe, expect, it } from 'vitest';
import { parse } from '@grammar/parser';
import { evaluate } from '@interpreter/core/interpreter';
import { Environment } from '@interpreter/env/Environment';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { extractVariableValue } from '@interpreter/utils/variable-resolution';

function createEnvironment(): Environment {
  return new Environment(new MemoryFileSystem(), new PathService(), '/');
}

describe('js inline typing and implicit return regressions', () => {
  it('keeps inline js var assignments typed (not stringified)', async () => {
    const env = createEnvironment();
    const { ast } = await parse([
      '/var @arr = js { return [] }',
      '/var @obj = js { return {} }',
      '/var @num = js { return 42 }',
      '/var @arrType = @typeof(@arr)',
      '/var @objType = @typeof(@obj)',
      '/var @numType = @typeof(@num)'
    ].join('\n'));

    await evaluate(ast, env);

    await expect(extractVariableValue(env.getVariable('arr')!, env)).resolves.toEqual([]);
    await expect(extractVariableValue(env.getVariable('obj')!, env)).resolves.toEqual({});
    await expect(extractVariableValue(env.getVariable('num')!, env)).resolves.toBe(42);

    await expect(extractVariableValue(env.getVariable('arrType')!, env)).resolves.toSatisfy(
      value => String(value) === 'array'
    );
    await expect(extractVariableValue(env.getVariable('objType')!, env)).resolves.toSatisfy(
      value => String(value) === 'object'
    );
    await expect(extractVariableValue(env.getVariable('numType')!, env)).resolves.toSatisfy(
      value => String(value) === 'number'
    );
  });

  it('adds implicit return for top-level js expressions with nested callback returns', async () => {
    const env = createEnvironment();
    const { ast } = await parse([
      '/var @items = [{"name":"b"},{"name":"a"}]',
      '/exe @sortByName(values) = js {(',
      '  values.slice().sort((left, right) => {',
      '    if (left.name < right.name) return -1;',
      '    if (left.name > right.name) return 1;',
      '    return 0;',
      '  })',
      ')}',
      '/var @sorted = @sortByName(@items)',
      '/var @first = @sorted[0].name'
    ].join('\n'));

    await evaluate(ast, env);
    await expect(extractVariableValue(env.getVariable('first')!, env)).resolves.toSatisfy(
      value => String(value) === 'a'
    );
  });
});
