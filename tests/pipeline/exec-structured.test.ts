import { describe, beforeEach, afterEach, it, expect } from 'vitest';
import { interpret } from '@interpreter/index';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';

describe('Exec pipeline structured flow (feature flag)', () => {
  let previousFlag: string | undefined;

  beforeEach(() => {
    previousFlag = process.env.MLLD_ENABLE_STRUCTURED_EXEC;
    process.env.MLLD_ENABLE_STRUCTURED_EXEC = 'true';
  });

  afterEach(() => {
    if (previousFlag === undefined) {
      delete process.env.MLLD_ENABLE_STRUCTURED_EXEC;
    } else {
      process.env.MLLD_ENABLE_STRUCTURED_EXEC = previousFlag;
    }
  });

  it('allows field access on structured pipeline results', async () => {
    const fileSystem = new MemoryFileSystem();
    const pathService = new PathService();

    const input = `
/exe @emit() = js { return '{"count": 5}' }
/exe @parseJson(val) = js { return JSON.parse(val) }
/var @result = @emit() with { pipeline: [@parseJson] }
/show @result.text
/show @result
`;

    const output = await interpret(input, { fileSystem, pathService });
    expect(output.trim()).toBe('{"count": 5}\n{"count": 5}');
  });

  it('pipes parsed JSON arrays into JS executables (#435 regression)', async () => {
    const fileSystem = new MemoryFileSystem();
    const pathService = new PathService();

    const input = `
/exe @attach(entries, ages) = js {
  if (!Array.isArray(entries)) {
    throw new Error('entries is not array');
  }
  return entries.map((entry, index) => ({ ...entry, age: ages[index] }));
}

/var @ages = [30, 40]
/var @result = '[{"id": 1}, {"id": 2}]' | @json | @attach(@ages)
/show @result
`;

    const output = await interpret(input, { fileSystem, pathService });
    const parsed = JSON.parse(output.trim());
    expect(parsed).toEqual([
      { id: 1, age: 30 },
      { id: 2, age: 40 }
    ]);
  });

  it('passes parsed JSON loader data into JS executables (#435 regression)', async () => {
    const fileSystem = new MemoryFileSystem();
    const pathService = new PathService();
    await fileSystem.writeFile('/project/data.json', '[{"id":1},{"id":2},{"id":3}]');

    const input = `
/exe @collectIds(entries) = js {
  if (!Array.isArray(entries)) {
    throw new Error('entries is not array');
  }
  return entries.map(entry => entry.id);
}

/var @entries = <data.json>
/var @ids = @collectIds(@entries)
/show @ids
`;

    const output = await interpret(input, {
      fileSystem,
      pathService,
      filePath: '/project/test.mld'
    });
    const parsed = JSON.parse(output.trim());
    expect(parsed).toEqual([1, 2, 3]);
  });
});
