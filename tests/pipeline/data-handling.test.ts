import { describe, it, expect, beforeEach } from 'vitest';
import { interpret } from '@interpreter/index';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';

describe('Data handling accessors', () => {
  let fileSystem: MemoryFileSystem;
  let pathService: PathService;

  beforeEach(() => {
    fileSystem = new MemoryFileSystem();
    pathService = new PathService();
  });

  it('parses JSON strings with .data before JavaScript execution', async () => {
    const input = `
/var @payload = '[{"num":1},{"num":2},{"num":3}]'
/exe @sum(items) = js {
  return items.reduce((total, item) => total + item.num, 0)
}
/var @result = @sum(@payload.data)
/show @result`;

    const output = await interpret(input, { fileSystem, pathService });
    expect(output.trim()).toBe('6');
  });

  it('preserves raw strings with .text', async () => {
    const input = `
/var @payload = '{"key":123}'
/exe @length(str) = js {
  return str.length
}
/var @result = @length(@payload.text)
/show @result`;

    const output = await interpret(input, { fileSystem, pathService });
    expect(output.trim()).toBe('11');
  });

  it('lets native mlld pipeline stages operate on parsed objects without helpers', async () => {
    const input = `
/exe @filterHigh(array) = for @item in @array => when [
  @item.finding.startsWith("High") => @item
  none => skip
]

/exe @addFlag(entry) = js {
  return { ...entry, flagged: true }
}

/exe @addFlagForeach(entries) = foreach @addFlag(@entries)

/var @entries = '[{"finding":"High-1"},{"finding":"Low-1"},{"finding":"High-2"}]'
/var @result = @entries | @filterHigh | @addFlagForeach | @json
/show @result`;

    const output = await interpret(input, { fileSystem, pathService });
    const parsed = JSON.parse(output.trim());
    expect(parsed).toEqual([
      { finding: 'High-1', flagged: true },
      { finding: 'High-2', flagged: true }
    ]);
  });

  it('passes parsed arrays between native and JS pipeline stages automatically', async () => {
    const input = `
/exe @filterHigh(array) = for @item in @array => when [
  @item.finding.startsWith("High") => @item
  none => skip
]

/exe @probe(entries) = js {
  const first = entries[0] || {};
  return Array.isArray(entries) && typeof first === 'object' && !Array.isArray(first);
}

/var @entries = '[{"finding":"High-1"},{"finding":"Low-1"}]'
/var @result = @entries | @filterHigh | @probe
/show @result`;

    const output = await interpret(input, { fileSystem, pathService });
    expect(output.trim()).toBe('true');
  });

  it('lets foreach consume StructuredValue arrays produced by pipelines', async () => {
    const input = `
/exe @echoUser(user) = js {
  return user
}

/var @users = '[{"id":1},{"id":2}]' | @json
/var @results = foreach @echoUser(@users)
/show @results | @json`;

    const output = await interpret(input, { fileSystem, pathService });
    const parsed = JSON.parse(output.trim());
    expect(parsed).toEqual([
      { id: 1 },
      { id: 2 }
    ]);
  });

  it('exposes chunked pipeline results as structured arrays', async () => {
    const input = `
/exe @chunk(arr, sz) = js {
  return Array.from(
    { length: Math.ceil(arr.length / sz) },
    (_, i) => arr.slice(i * sz, i * sz + sz)
  );
}

/exe @inspect(value) = js {
  return {
    isStructured: Boolean(value && typeof value === 'object' && value[Symbol.for('mlld.StructuredValue')]),
    type: value?.type,
    valueType: typeof value,
    isArray: Array.isArray(value),
    dataIsArray: Array.isArray(value?.data),
    data: value?.data,
    text: value?.text ?? value
  };
}

/var @numbers = '[1, 2, 3, 4]' | @json
/var @chunks = @numbers | @chunk(2)
/show @inspect(@chunks) | @json`;

    const output = await interpret(input, { fileSystem, pathService });
    const info = JSON.parse(output.trim());
    expect(info).toEqual({
      isStructured: false,
      valueType: 'object',
      isArray: true,
      dataIsArray: false,
      text: [
        [1, 2],
        [3, 4]
      ]
    });
  });

  it('lets foreach consume StructuredValue arrays created by chained pipelines', async () => {
    const input = `
/exe @chunk(arr, sz) = js {
  return Array.from(
    { length: Math.ceil(arr.length / sz) },
    (_, i) => arr.slice(i * sz, i * sz + sz)
  );
}

/exe @sum(values) = js {
  return values.reduce((total, value) => total + value, 0);
}

/var @numbers = '[1, 2, 3, 4]' | @json
/var @chunks = @numbers | @chunk(2)
/var @sums = foreach @sum(@chunks)
/show @chunks | @json
/show @sums | @json`;

    const output = await interpret(input, { fileSystem, pathService });
    const normalized = output.replace(/\s+/g, '');
    const splitIndex = normalized.indexOf('][');
    expect(splitIndex).toBeGreaterThan(0);
    const chunksJson = normalized.slice(0, splitIndex + 1);
    const sumsJson = normalized.slice(splitIndex + 1);
    expect(JSON.parse(chunksJson)).toEqual([[1, 2], [3, 4]]);
    expect(JSON.parse(sumsJson)).toEqual([3, 7]);
  });

  it('stores structured assignments as wrappers and exposes data to field access, iteration, and equality', async () => {
    const input = `
/exe @structuredProfile() = js {
  const wrapper = {
    type: 'object',
    text: '{"name":"Ada","pets":["Rex"]}',
    data: { name: 'Ada', pets: ['Rex'] },
    metadata: { source: 'test' },
    toString() { return this.text; },
    valueOf() { return this.text; },
    [Symbol.toPrimitive]() { return this.text; }
  };
  wrapper[Symbol.for('mlld.StructuredValue')] = true;
  return wrapper;
}

/var @profile = @structuredProfile()

/exe @describePets(pets) = js {
  if (!Array.isArray(pets)) {
    throw new Error('pets not array');
  }
  return pets.join(',');
}

/var @summary = @profile.pets | @describePets
/show @profile.name
/show @summary
/when [
  @profile.name == "Ada" => show "matched"
  none => show "unmatched"
]
`;

    const output = await interpret(input, { fileSystem, pathService });
    expect(output.trim()).toBe('Ada\nRex\nmatched');
  });

  it('wraps load-content assignments with structured metadata', async () => {
    await fileSystem.writeFile('/project/doc.md', 'Structured body');

    const input = `
/var @doc = <doc.md>
/var @name = @doc.filename
/var @body = @doc.text
/show @name
/show @body`;

    const output = await interpret(input, {
      fileSystem,
      pathService,
      filePath: '/project/test.mld'
    });
    expect(output.trim()).toBe('doc.md\nStructured body');
  });
});
