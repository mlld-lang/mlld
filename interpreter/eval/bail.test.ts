import { beforeEach, describe, expect, it } from 'vitest';
import { interpret } from '@interpreter/index';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';

describe('bail directive evaluation', () => {
  let fileSystem: MemoryFileSystem;
  let pathService: PathService;

  const run = async (source: string, filePath = '/project/main.mld', mlldMode: 'strict' | 'markdown' = 'strict') => {
    return interpret(source, {
      fileSystem,
      pathService,
      basePath: '/project',
      filePath,
      mlldMode
    });
  };

  beforeEach(async () => {
    fileSystem = new MemoryFileSystem();
    pathService = new PathService();
    await fileSystem.mkdir('/project');
  });

  it('terminates with explicit string messages', async () => {
    await expect(run('bail "config missing"')).rejects.toMatchObject({ code: 'BAIL_EXIT' });
    await expect(run('bail "config missing"')).rejects.toThrow('config missing');
  });

  it('evaluates expression messages', async () => {
    const source = 'var @name = "Ada"\nbail `prereq @name missing`';
    await expect(run(source)).rejects.toThrow('prereq Ada missing');
  });

  it('uses a default message for bare bail', async () => {
    await expect(run('bail')).rejects.toThrow(/bail directive/i);
  });

  it('works in markdown mode with /bail syntax', async () => {
    await expect(run('/bail "markdown stop"', '/project/main.mld.md', 'markdown')).rejects.toThrow('markdown stop');
  });

  it('terminates from if/when blocks', async () => {
    await expect(run('if true [ bail "if stop" ]')).rejects.toThrow('if stop');
    await expect(run('when true => [ bail "when stop" ]')).rejects.toThrow('when stop');
  });

  it('terminates from for loops, including parallel for loops', async () => {
    await expect(run('for @item in [1, 2] [ bail `for stop @item` ]')).rejects.toThrow('for stop 1');
    await expect(run('for parallel @item in [1, 2] [ bail "parallel stop" ]')).rejects.toThrow('parallel stop');
  });

  it('terminates the caller when an imported module bails', async () => {
    await fileSystem.writeFile('/project/module.mld', 'bail "module stop"\nvar @value = "ok"\nexport { value }');

    const source = 'import { value } from "./module.mld"\nshow @value';
    await expect(run(source)).rejects.toThrow('module stop');
  });
});

