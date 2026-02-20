import { describe, expect, it } from 'vitest';
import { interpret } from '@interpreter/index';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';

describe('exe return expression evaluation', () => {
  it('evaluates arithmetic on exec invocations in exe return lines', async () => {
    const output = await interpret(
      [
        '/exe @countFiles(dir, pattern) = js { return 2 }',
        '/exe @toNumber(dir, pattern) = [',
        '  => @countFiles(@dir, @pattern) * 1',
        ']',
        '/show @toNumber("/tmp", "*.md")'
      ].join('\n'),
      {
        fileSystem: new MemoryFileSystem(),
        pathService: new PathService(),
        useMarkdownFormatter: false,
        normalizeBlankLines: true
      } as any
    );

    expect((output as string).trim()).toBe('2');
  });
});
