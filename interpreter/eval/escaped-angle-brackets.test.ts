import { beforeEach, describe, expect, it } from 'vitest';
import { interpret } from '../index';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';

describe('Escaped angle bracket expressions (runtime)', () => {
  let fileSystem: MemoryFileSystem;
  let pathService: PathService;

  beforeEach(async () => {
    fileSystem = new MemoryFileSystem();
    pathService = new PathService();

    await fileSystem.mkdir('/project', { recursive: true });
    await fileSystem.writeFile('/project/file.md', 'LOADED_FILE_CONTENT');
  });

  it('renders <<hello>> as <hello>', async () => {
    const output = await interpret('/show `<<hello>>`', {
      fileSystem,
      pathService,
      basePath: '/project',
      filePath: '/project/main.mld'
    } as any);

    expect(String(output).trim()).toBe('<hello>');
  });

  it('interpolates @var inside <<...>>', async () => {
    const source = '/var @tag = "div"\n/show `<<@tag>>`';
    const output = await interpret(source, {
      fileSystem,
      pathService,
      basePath: '/project',
      filePath: '/project/main.mld'
    } as any);

    expect(String(output).trim()).toBe('<div>');
  });

  it('supports closing tag form <</@var>>', async () => {
    const source = '/var @tag = "span"\n/show `<</@tag>>`';
    const output = await interpret(source, {
      fileSystem,
      pathService,
      basePath: '/project',
      filePath: '/project/main.mld'
    } as any);

    expect(String(output).trim()).toBe('</span>');
  });

  it('supports @var interpolation in attributes', async () => {
    const source = '/var @attr = "data-kind"\n/show `<<my-component @attr="value">>`';
    const output = await interpret(source, {
      fileSystem,
      pathService,
      basePath: '/project',
      filePath: '/project/main.mld'
    } as any);

    expect(String(output).trim()).toBe('<my-component data-kind="value">');
  });

  it('keeps line-start << as comment marker', async () => {
    const source = '<< this is a comment at line start\n/show `<<hello>>`';
    const output = await interpret(source, {
      fileSystem,
      pathService,
      basePath: '/project',
      filePath: '/project/main.mld'
    } as any);

    expect(String(output).trim()).toBe('<hello>');
  });

  it('does not load files for <<file.md>>', async () => {
    const output = await interpret('/show `<<file.md>>`', {
      fileSystem,
      pathService,
      basePath: '/project',
      filePath: '/project/main.mld'
    } as any);

    expect(String(output).trim()).toBe('<file.md>');
  });

  it('supports <<<file.md>.mx.filename>> as nested interpolation', async () => {
    const output = await interpret('/show `<<<file.md>.mx.filename>>`', {
      fileSystem,
      pathService,
      basePath: '/project',
      filePath: '/project/main.mld'
    } as any);

    expect(String(output).trim()).toBe('<file.md>');
  });
});

