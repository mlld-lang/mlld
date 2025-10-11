import { beforeEach, describe, expect, it } from 'vitest';
import { Environment } from '../env/Environment';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { parse } from '@grammar/parser';
import { evaluate } from '../core/interpreter';
import type { ArrayVariable } from '@core/types/variable/VariableTypes';

describe('evaluateForeachCommand (structured boundaries)', () => {
  let env: Environment;

  beforeEach(() => {
    const fs = new MemoryFileSystem();
    const pathService = new PathService();
    env = new Environment(fs, pathService, '/');
  });

  it('preserves structured foreach results for template consumers', async () => {
    const source = `
/var @ids = '[{"file": 1}, {"file": 2}]' | @json
/exe @passthrough(data) = js { return data }
/var @result = foreach @passthrough(@ids)
`;

    const { ast } = await parse(source);
    await evaluate(ast, env);

    const foreachResult = env.getVariable('result') as ArrayVariable | undefined;
    expect(foreachResult).toBeDefined();
    if (!foreachResult) {
      return;
    }

    const value = foreachResult.value;
    expect(Array.isArray(value)).toBe(true);
    expect(value).toEqual([
      { file: 1 },
      { file: 2 }
    ]);
  });
});
