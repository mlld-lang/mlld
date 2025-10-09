import { describe, it, expect, beforeEach } from 'vitest';
import { interpret } from '@interpreter/index';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';

describe('Pipeline Structured Execution', () => {
  let fileSystem: MemoryFileSystem;
  let pathService: PathService;

  beforeEach(() => {
    fileSystem = new MemoryFileSystem();
    pathService = new PathService();
  });

  it('parses JSON inputs before invoking stages', async () => {
    const input = `
/exe @extractNames(input) = js {
  if (!Array.isArray(input)) {
    throw new Error('input is not parsed JSON array');
  }
  return input.map(u => u.name).join(', ');
}

/var @jsonData = \`[{"name": "Alice"}, {"name": "Bob"}]\`
/var @names = @jsonData with { format: "json", pipeline: [@extractNames] }
/show @names`;

    const result = await interpret(input, { fileSystem, pathService });
    expect(result.trim()).toBe('Alice, Bob');
  });

  it('parses CSV inputs into row arrays', async () => {
    const input = `
/exe @countCSVRows(input) = js {
  if (!Array.isArray(input)) {
    throw new Error('input is not parsed CSV array');
  }
  const rows = input;
  return \`\${rows.length} rows, \${rows[0].length} columns\`;
}

/var @csvData = \`Name,Age,City\nAlice,30,NYC\nBob,25,LA\`
/var @analysis = @csvData with { format: "csv", pipeline: [@countCSVRows] }
/show @analysis`;

    const result = await interpret(input, { fileSystem, pathService });
    expect(result.trim()).toBe('3 rows, 3 columns');
  });

  it('passes XML inputs as plain strings', async () => {
    const input = `
/exe @processXML(input) = js {
  return typeof input === 'string' ? input : String(input);
}

/var @xmlData = "test data"
/var @xmlTest = @xmlData with { format: "xml", pipeline: [@processXML] }
/show @xmlTest`;

    const result = await interpret(input, { fileSystem, pathService });
    expect(result.trim()).toContain('test data');
  });

  it('propagates JSON parse errors with stage context', async () => {
    const input = `
/exe @tryParse(input) = js {
  return 'unreachable';
}

/var @invalid = "{ invalid json"
/var @result = @invalid with { format: "json", pipeline: [@tryParse] }
/show @result`;

    await expect(interpret(input, { fileSystem, pathService })).rejects.toThrow(/Failed to parse JSON/);
  });

  it('keeps text format pipelines compatible with string functions', async () => {
    const input = `
/exe @uppercase(input) = js {
  if (typeof input !== 'string') {
    throw new Error('expected string input');
  }
  return input.toUpperCase();
}

/var @result = "hello" with { pipeline: [@uppercase] }
/show @result`;

    const result = await interpret(input, { fileSystem, pathService });
    expect(result.trim()).toBe('HELLO');
  });

  it('passes structured data across multiple stages', async () => {
    const input = `
/exe @stage1(input) = js {
  if (!Array.isArray(input)) {
    throw new Error('stage1 expected array');
  }
  return {
    users: input,
    count: input.length
  };
}

/exe @stage2(input) = js {
  if (!input || typeof input.count !== 'number') {
    throw new Error('stage2 expected aggregated object');
  }
  return \`Total users: \${input.count}\`;
}

/var @users = [{"name": "Alice"}, {"name": "Bob"}]
/var @result = @users with { format: "json", pipeline: [@stage1, @stage2] }
/show @result`;

    const result = await interpret(input, { fileSystem, pathService });
    expect(result.trim()).toBe('Total users: 2');
  });

  it('allows parent variables alongside structured inputs', async () => {
    const input = `
/var @multiplier = "3"

/exe @useParent(input, mult) = js {
  if (!Array.isArray(input)) {
    throw new Error('useParent expected array input');
  }
  const multiplier = Number(mult);
  return input[0].value * multiplier;
}
/var @data = [{"value": 10}]
/var @result = @data with { format: "json", pipeline: [@useParent(@multiplier)] }
/show @result`;

    const result = await interpret(input, { fileSystem, pathService });
    expect(result.trim()).toBe('30');
  });
});
