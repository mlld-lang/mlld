import { describe, it, expect, beforeEach } from 'vitest';
import { interpret } from '@interpreter/index';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';

describe('Template interpolation with structured values', () => {
  let fileSystem: MemoryFileSystem;
  let pathService: PathService;

  beforeEach(() => {
    fileSystem = new MemoryFileSystem();
    pathService = new PathService();
  });

  it('stringifies structured values in triple-colon templates via {{var}}', async () => {
    const input = `
/exe @structured() = js {
  const value = {
    type: 'object',
    text: '{"name":"Ada"}',
    data: { name: 'Ada' },
    metadata: { source: 'structured-test' },
    toString() { return this.text; },
    valueOf() { return this.text; },
    [Symbol.toPrimitive]() { return this.text; }
  };
  value[Symbol.for('mlld.StructuredValue')] = true;
  return value;
}

/var @data = @structured()
/var @doc = :::
Name: {{data}}
:::
/show @doc`;

    const output = await interpret(input, { fileSystem, pathService });
    expect(output.trim()).toBe('Name: {"name":"Ada"}');
  });

  it('stringifies structured values in backtick templates via @var', async () => {
    const input = `
/exe @structured() = js {
  const value = {
    type: 'object',
    text: '{"name":"Ada"}',
    data: { name: 'Ada' },
    metadata: { source: 'structured-backtick' },
    toString() { return this.text; },
    valueOf() { return this.text; },
    [Symbol.toPrimitive]() { return this.text; }
  };
  value[Symbol.for('mlld.StructuredValue')] = true;
  return value;
}

/var @data = @structured()
/var @line = \`Name: @data\`
/show @line`;

    const output = await interpret(input, { fileSystem, pathService });
    expect(output.trim()).toBe('Name: {"name":"Ada"}');
  });
});
