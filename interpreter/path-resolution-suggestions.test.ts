import { beforeEach, describe, expect, it } from 'vitest';
import { interpret } from './index';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';

describe('Path Resolution Suggestions', () => {
  let fileSystem: MemoryFileSystem;
  let pathService: PathService;

  beforeEach(async () => {
    fileSystem = new MemoryFileSystem();
    pathService = new PathService();

    await fileSystem.mkdir('/project');
    await fileSystem.mkdir('/project/scripts');
    await fileSystem.mkdir('/project/workflows');
    await fileSystem.mkdir('/project/tmp');
    await fileSystem.mkdir('/project/data');
    await fileSystem.writeFile('/project/tmp/utils.mld', '/var @value = "ok"');
    await fileSystem.writeFile('/project/tmp/prompt.att', 'Prompt for @name');
    await fileSystem.writeFile('/project/data/input.json', '{"ok": true}');
  });

  it('suggests @base for missing import paths outside the script directory', async () => {
    await expect(
      interpret('/import { value } from "tmp/utils.mld"\n/show @value', {
        fileSystem,
        pathService,
        basePath: '/project',
        filePath: '/project/scripts/main.mld',
        localFileFuzzyMatch: false
      })
    ).rejects.toThrow(/Did you mean:[\s\S]*@base\/tmp\/utils\.mld/);
  });

  it('suggests @base for missing template file paths', async () => {
    await expect(
      interpret('/exe @render(name) = template "tmp/prompt.att"\n/show @render("Ada")', {
        fileSystem,
        pathService,
        basePath: '/project',
        filePath: '/project/workflows/template.mld',
        localFileFuzzyMatch: false
      })
    ).rejects.toThrow(/Did you mean:[\s\S]*@base\/tmp\/prompt\.att/);
  });

  it('preserves file-not-found suggestions for content loader errors', async () => {
    const run = interpret('/show <data/input.json>', {
      fileSystem,
      pathService,
      basePath: '/project',
      filePath: '/project/scripts/load.mld',
      localFileFuzzyMatch: false
    });

    await expect(run).rejects.toThrow(/File not found: data\/input\.json/);
    await expect(run).rejects.toThrow(/Did you mean:[\s\S]*@base\/data\/input\.json/);
    await expect(run).rejects.toThrow(/Paths resolve relative to the current mlld file directory/);
  });
});
