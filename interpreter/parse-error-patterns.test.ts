import { describe, it, expect, beforeEach } from 'vitest';
import { interpret } from './index';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';

describe('parse error patterns', () => {
  let fileSystem: MemoryFileSystem;
  let pathService: PathService;

  beforeEach(() => {
    fileSystem = new MemoryFileSystem();
    pathService = new PathService();
  });

  it('maps bare pipeline braces to command guidance in strict mode', async () => {
    const source = `/var @x = "hi"\n\n@x | { echo "hi" }\n`;

    await expect(
      interpret(source, {
        fileSystem,
        pathService,
        mlldMode: 'strict'
      })
    ).rejects.toThrow('Text content not allowed in strict mode');
  });

  it('includes for...when pre-filter guidance in ambiguous when block errors', async () => {
    const source = `/var @cond = true\nwhen @cond [\n  show "x"\n]\n`;

    await expect(
      interpret(source, {
        fileSystem,
        pathService,
        mlldMode: 'strict'
      })
    ).rejects.toThrow('var @items = @cond ? @list : []');
  });
});
