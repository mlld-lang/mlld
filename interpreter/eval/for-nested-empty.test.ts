import { describe, it, expect } from 'vitest';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { Environment } from '@interpreter/env/Environment';
import { parse } from '@grammar/parser';
import { evaluate } from '@interpreter/core/interpreter';

describe('For expression - nested empty arrays', () => {
  it('returns an empty array for nested /for over empty arrays', async () => {
    const fs = new MemoryFileSystem();
    const pathService = new PathService();
    const env = new Environment(fs, pathService, process.cwd());

    const src = `/var @empty = []\n/var @result = for @a in @empty => for @b in [] => @b`;
    const { ast } = await parse(src);
    await evaluate(ast, env);

    const resultVar = env.getVariable('result');
    expect(resultVar).toBeDefined();
    expect(resultVar?.type).toBe('array');

    const { extractVariableValue } = await import('@interpreter/utils/variable-resolution');
    const value = await extractVariableValue(resultVar!, env);
    expect(Array.isArray(value)).toBe(true);
    expect((value as unknown[]).length).toBe(0);
  });
});

