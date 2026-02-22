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

describe('@typeof and @typeInfo builtins', () => {
  it('returns simple type names from @typeof', async () => {
    const env = createEnvironment();
    const { ast } = await parse([
      '/var @num = 42',
      '/var @arr = [1, 2]',
      '/var @obj = { a: 1 }',
      '/var @nil = null',
      '/exe @fn() = "ok"',
      '/var @numType = @typeof(@num)',
      '/var @arrType = @typeof(@arr)',
      '/var @objType = @typeof(@obj)',
      '/var @nilType = @typeof(@nil)',
      '/var @fnType = @typeof(@fn)',
      '/var @isNumber = (@typeof(@num) == "number")'
    ].join('\n'));

    await evaluate(ast, env);

    await expect(extractVariableValue(env.getVariable('numType')!, env)).resolves.toSatisfy(
      value => String(value) === 'number'
    );
    await expect(extractVariableValue(env.getVariable('arrType')!, env)).resolves.toSatisfy(
      value => String(value) === 'array'
    );
    await expect(extractVariableValue(env.getVariable('objType')!, env)).resolves.toSatisfy(
      value => String(value) === 'object'
    );
    await expect(extractVariableValue(env.getVariable('nilType')!, env)).resolves.toSatisfy(
      value => String(value) === 'null'
    );
    await expect(extractVariableValue(env.getVariable('fnType')!, env)).resolves.toSatisfy(
      value => String(value) === 'executable'
    );
    await expect(extractVariableValue(env.getVariable('isNumber')!, env)).resolves.toBe(true);
  });

  it('returns rich provenance details from @typeInfo', async () => {
    const env = createEnvironment();
    const { ast } = await parse([
      '/var @num = 42',
      '/exe @fn() = "ok"',
      '/var @numInfo = @typeInfo(@num)',
      '/var @fnInfo = @typeInfo(@fn)'
    ].join('\n'));

    await evaluate(ast, env);

    const numInfo = await extractVariableValue(env.getVariable('numInfo')!, env);
    const fnInfo = await extractVariableValue(env.getVariable('fnInfo')!, env);

    expect(String(numInfo)).toContain('primitive (number)');
    expect(String(numInfo)).toContain('[from /var]');
    expect(String(fnInfo)).toContain('executable');
    expect(String(fnInfo)).toContain('[from /');
  });
});
