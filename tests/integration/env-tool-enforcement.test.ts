import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import os from 'os';
import { interpret } from '@interpreter/index';
import { NodeFileSystem } from '@services/fs/NodeFileSystem';
import { PathService } from '@services/fs/PathService';

describe('env tools runtime enforcement', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) {
        await fs.rm(dir, { recursive: true, force: true });
      }
    }
  });

  it('blocks run cmd when Bash is not present in env tools', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mlld-env-tools-deny-'));
    tempDirs.push(root);

    await fs.writeFile(
      path.join(root, 'main.mld'),
      [
        '/var @cfg = { tools: ["Read", "Write"] }',
        '/env @cfg [',
        '  run cmd { echo blocked }',
        ']'
      ].join('\n'),
      'utf8'
    );

    await expect(
      interpret(await fs.readFile(path.join(root, 'main.mld'), 'utf8'), {
        filePath: path.join(root, 'main.mld'),
        fileSystem: new NodeFileSystem(),
        pathService: new PathService(),
        approveAllImports: true
      })
    ).rejects.toThrow(/Bash.*env\.tools|ENV_TOOL_DENIED|Tool.*denied/i);
  });

  it('allows run cmd when Bash is present in env tools', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mlld-env-tools-allow-'));
    tempDirs.push(root);

    await fs.writeFile(
      path.join(root, 'main.mld'),
      [
        '/var @cfg = { tools: ["Read", "Write", "Bash"] }',
        '/env @cfg [',
        '  run cmd { echo allowed }',
        ']'
      ].join('\n'),
      'utf8'
    );

    const output = await interpret(await fs.readFile(path.join(root, 'main.mld'), 'utf8'), {
      filePath: path.join(root, 'main.mld'),
      fileSystem: new NodeFileSystem(),
      pathService: new PathService(),
      approveAllImports: true
    });
    expect(output.trim()).toBe('allowed');
  });
});
