import { describe, expect, it } from 'vitest';
import { interpret } from '@interpreter/index';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';

describe('shell path parameter stringification', () => {
  it('coerces path objects to resolved paths for sh parameter env vars', async () => {
    const output = await interpret(
      [
        '/exe @foo(dir) = sh { printf "%s" "$dir" }',
        '/show @foo(@base)'
      ].join('\n'),
      {
        fileSystem: new MemoryFileSystem(),
        pathService: new PathService(),
        useMarkdownFormatter: false,
        normalizeBlankLines: true
      } as any
    );

    expect((output as string).trim()).toBe(process.cwd());
  });
});
