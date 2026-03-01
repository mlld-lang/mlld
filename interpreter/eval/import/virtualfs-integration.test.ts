import { describe, expect, it } from 'vitest';
import { interpret } from '@interpreter/index';
import { PathService } from '@services/fs/PathService';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { VirtualFS } from '@services/fs/VirtualFS';
import type { PathContext } from '@core/services/PathContextService';

const pathContext: PathContext = {
  projectRoot: '/project',
  fileDirectory: '/project',
  executionDirectory: '/project',
  invocationDirectory: '/project',
  filePath: '/project/main.mld'
};

describe('VirtualFS interpreter integration', () => {
  it('keeps virtual mode parse fallback behavior for strict .mld module imports', async () => {
    const backing = new MemoryFileSystem();
    await backing.mkdir('/project/lib', { recursive: true });
    await backing.writeFile(
      '/project/lib/strict-module.mld',
      [
        'var @name = "Virtual"',
        'export { name }'
      ].join('\n')
    );

    const vfs = VirtualFS.over(backing);
    const result = await interpret(
      [
        '/import "./lib/strict-module.mld" as @mod',
        '/show @mod.name'
      ].join('\n'),
      {
        fileSystem: vfs,
        pathService: new PathService(),
        pathContext,
        approveAllImports: true
      }
    );

    expect(String(result).trim()).toBe('Virtual');
  });

  it('respects VirtualFS directory merge/mask behavior during directory imports', async () => {
    const backing = new MemoryFileSystem();
    await backing.mkdir('/project/agents/alpha', { recursive: true });
    await backing.mkdir('/project/agents/beta', { recursive: true });
    await backing.writeFile('/project/agents/alpha/index.mld', '/var @who = "alpha"');
    await backing.writeFile('/project/agents/beta/index.mld', '/var @who = "beta"');

    const vfs = VirtualFS.over(backing);
    await vfs.mkdir('/project/agents/gamma', { recursive: true });
    await vfs.writeFile('/project/agents/gamma/index.mld', '/var @who = "gamma"');
    await vfs.rm('/project/agents/beta', { recursive: true });

    const result = await interpret(
      [
        '/import "./agents/" as @agents',
        '/show @agents.alpha.who',
        '/show @agents.gamma.who'
      ].join('\n'),
      {
        fileSystem: vfs,
        pathService: new PathService(),
        pathContext,
        approveAllImports: true
      }
    );

    const lines = String(result).trim().split('\n').map(line => line.trim()).filter(Boolean);
    expect(lines).toEqual(['alpha', 'gamma']);
  });
});
