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
    ).rejects.toThrow('Use cmd { … } for commands or data { … } for objects.');
  });
});
