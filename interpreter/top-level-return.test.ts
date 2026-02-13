import { describe, expect, it } from 'vitest';
import { interpret } from '@interpreter/index';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import type { PathContext } from '@core/services/PathContextService';

const pathService = new PathService();

function contextFor(filePath: string): PathContext {
  return {
    projectRoot: '/project',
    fileDirectory: '/project',
    executionDirectory: '/project',
    invocationDirectory: '/project',
    filePath
  };
}

describe('top-level return behavior', () => {
  it('prints explicit script return output and stops execution in strict mode', async () => {
    const fileSystem = new MemoryFileSystem();
    const source = 'show "start"\n=> "done"\nshow "after"';

    const result = await interpret(source, {
      fileSystem,
      pathService,
      mlldMode: 'strict',
      filePath: '/project/main.mld',
      pathContext: contextFor('/project/main.mld'),
      streaming: { enabled: false }
    });

    expect(result).toContain('start');
    expect(result).toContain('done');
    expect(result).not.toContain('after');
    expect((result as string).trimEnd().endsWith('done')).toBe(true);
  });

  it('parses and executes bare top-level return in markdown mode', async () => {
    const fileSystem = new MemoryFileSystem();
    const source = '=> "markdown-done"\n/show "after"';

    const result = await interpret(source, {
      fileSystem,
      pathService,
      mlldMode: 'markdown',
      filePath: '/project/doc.mld.md',
      pathContext: contextFor('/project/doc.mld.md'),
      streaming: { enabled: false }
    });

    expect(result.trim()).toBe('markdown-done');
  });

  it('captures imported script return value as default export', async () => {
    const fileSystem = new MemoryFileSystem();
    await fileSystem.writeFile(
      '/project/top-level-return-module.mld',
      'var @before = "before"\n=> "captured"\nvar @after = "after"\n'
    );

    const source = [
      'import { default as @captured, before as @beforeValue } from "./top-level-return-module.mld"',
      '=> `@captured:@beforeValue`'
    ].join('\n');

    const result = await interpret(source, {
      fileSystem,
      pathService,
      mlldMode: 'strict',
      filePath: '/project/main.mld',
      pathContext: contextFor('/project/main.mld'),
      approveAllImports: true,
      streaming: { enabled: false }
    });

    expect(result.trim()).toBe('captured:before');
  });

  it('does not emit implicit final output without explicit return', async () => {
    const fileSystem = new MemoryFileSystem();
    const source = 'var @value = "silent"';

    const result = await interpret(source, {
      fileSystem,
      pathService,
      mlldMode: 'strict',
      filePath: '/project/main.mld',
      pathContext: contextFor('/project/main.mld'),
      streaming: { enabled: false }
    });

    expect(result.trim()).toBe('');
  });
});
