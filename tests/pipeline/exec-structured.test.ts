import { describe, it, expect } from 'vitest';
import { interpret } from '@interpreter/index';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';

describe('Exec pipeline structured flow', () => {

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
    expect(output.trim()).toBe('{"count": 5}\n\n{"count": 5}');
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

  it('keeps structured arguments native when mixing pipe input and explicit parameters', async () => {
    const fileSystem = new MemoryFileSystem();
    const pathService = new PathService();

    const input = `
/exe @zip(entries, names) = js {
  return entries.map((entry, index) => ({
    id: entry,
    name: names[index]
  }));
}

/var @ids = '[1,2]' | @json
/var @names = '["Alice","Bob"]' | @json
/var @paired = @ids | @zip(@names)
/show @paired
`;

    const output = await interpret(input, { fileSystem, pathService });
    const parsed = JSON.parse(output.trim());
    expect(parsed).toEqual([
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' }
    ]);
  });

  it('exposes retry history via pipeline.tries', async () => {
    const fileSystem = new MemoryFileSystem();
    const pathService = new PathService();

    const input = `
/exe @seed() = "s"

/exe @retryer(input, pipeline) = when first [
  @pipeline.try < 3 => retry
  * => \`done @pipeline.try\`
]

/exe @downstream(input, pipeline) = js {
  return JSON.stringify({
    tryCount: pipeline.try,
    tries: pipeline.tries,
    retries: pipeline.retries
  }, null, 2);
}

/var @result = @seed() with { pipeline: [@retryer(@p), @downstream(@p)] }
/show @result
`;

    const output = await interpret(input, { fileSystem, pathService });
    const parsed = JSON.parse(output.trim());
    expect(parsed.tryCount).toBe(1);
    expect(parsed.retries?.all?.length).toBeGreaterThan(0);
    expect(parsed.tries).toEqual([['s', 's']]);
  });
});
