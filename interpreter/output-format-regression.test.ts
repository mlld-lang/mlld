import { describe, expect, it } from 'vitest';
import { interpret } from './index';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';

describe('output format regressions', () => {
  it('applies xml formatting when interpret format is xml', async () => {
    const fileSystem = new MemoryFileSystem();
    const pathService = new PathService(fileSystem, '/');

    const output = await interpret('/show "Hello XML"', {
      fileSystem,
      pathService,
      format: 'xml',
      mlldMode: 'markdown',
      useMarkdownFormatter: false
    });

    expect(output.trim().startsWith('<')).toBe(true);
    expect(output).toContain('Hello XML');
  });
});
