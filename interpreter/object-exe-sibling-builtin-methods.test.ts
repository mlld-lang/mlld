import { beforeEach, describe, expect, it } from 'vitest';
import { interpret } from './index';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';

describe('Object Fields With Executable Siblings', () => {
  let fileSystem: MemoryFileSystem;
  let pathService: PathService;

  beforeEach(() => {
    fileSystem = new MemoryFileSystem();
    pathService = new PathService();
  });

  async function run(source: string): Promise<string> {
    const result = await interpret(source, {
      fileSystem,
      pathService,
      useMarkdownFormatter: false,
      normalizeBlankLines: true
    } as any);
    return (typeof result === 'string' ? result : result.output).trim();
  }

  it('preserves sibling field builtin methods when an object also stores an executable', async () => {
    const source = [
      '/exe @noop() = js { return null; }',
      '/var @agent = {',
      '  label: "  hi  ",',
      '  items: ["a", "b", "c"],',
      '  handler: @noop',
      '}',
      '/show @agent.label.trim()',
      '/show @agent.items.join("/")',
      '/show @agent.items.includes("b")'
    ].join('\n');

    const output = await run(source);
    expect(output.split('\n').filter(Boolean)).toEqual([
      'hi',
      'a/b/c',
      'true'
    ]);
  });
});
