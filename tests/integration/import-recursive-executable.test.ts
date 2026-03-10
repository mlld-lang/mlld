import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import os from 'os';
import { interpret } from '@interpreter/index';
import { NodeFileSystem } from '@services/fs/NodeFileSystem';
import { PathService } from '@services/fs/PathService';
import { PythonPackageManagerFactory } from '@core/registry/python/PythonPackageManager';

const FAKE_PYTHON_MANAGER = {
  name: 'pip',
  isAvailable: async () => true,
  install: async () => ({ package: 'stub', status: 'already-installed' as const }),
  list: async () => [],
  checkAvailable: async () => true,
  getDependencies: async () => ({}),
  resolveVersion: async (spec: string) => ({
    name: spec,
    version: '0.0.0',
    requires: []
  })
};

describe('imported recursive executables', () => {
  const tempDirs: string[] = [];

  beforeEach(() => {
    PythonPackageManagerFactory.reset();
    vi.spyOn(PythonPackageManagerFactory, 'getDefault').mockResolvedValue(FAKE_PYTHON_MANAGER as any);
  });

  afterEach(async () => {
    PythonPackageManagerFactory.reset();
    vi.restoreAllMocks();
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) {
        await fs.rm(dir, { recursive: true, force: true });
      }
    }
  });

  it('preserves the recursive label across module imports', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mlld-import-recursive-exe-'));
    tempDirs.push(root);

    const helperPath = path.join(root, 'lib.mld');
    const mainPath = path.join(root, 'main.mld');

    await fs.writeFile(
      helperPath,
      [
        'exe @lte1(n) = js { return n <= 1 }',
        'exe @dec(n) = js { return n - 1 }',
        'exe @mul(a, b) = js { return a * b }',
        '',
        'exe recursive @fact(n) = [',
        '  when @lte1(@n) => 1',
        '  let @prev = @dec(@n)',
        '  let @rest = @fact(@prev)',
        '  => @mul(@n, @rest)',
        ']',
        '',
        'exe @wrapper(n) = [ => @fact(@n) ]',
        'export { @wrapper }'
      ].join('\n'),
      'utf8'
    );

    await fs.writeFile(
      mainPath,
      [
        `import { @wrapper } from "${helperPath}"`,
        'show @wrapper(5)'
      ].join('\n'),
      'utf8'
    );

    const output = await interpret(await fs.readFile(mainPath, 'utf8'), {
      filePath: mainPath,
      fileSystem: new NodeFileSystem(),
      pathService: new PathService(),
      approveAllImports: true,
      useMarkdownFormatter: false,
      normalizeBlankLines: true
    });

    expect((output as string).trim()).toBe('120');
  });
});
