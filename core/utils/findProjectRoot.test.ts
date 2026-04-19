import { beforeEach, describe, expect, it } from 'vitest';
import { findProjectRoot } from './findProjectRoot';
import { VirtualFS } from '@services/fs/VirtualFS';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';

describe('findProjectRoot with VirtualFS', () => {
  let vfs: VirtualFS;

  beforeEach(async () => {
    vfs = VirtualFS.empty();
    await vfs.mkdir('/project/src/nested', { recursive: true });
    await vfs.writeFile('/project/mlld-config.json', '{}');
    await vfs.writeFile('/project/src/nested/script.mld', '/show "ok"');
  });

  it('finds project root via virtual fs config files', async () => {
    const root = await findProjectRoot('/project/src/nested', vfs);
    expect(root).toBe('/project');
  });

  it('ignores nested lock files when a parent mlld-config.json exists', async () => {
    await vfs.writeFile('/project/src/nested/mlld-lock.json', '{}');

    const root = await findProjectRoot('/project/src/nested', vfs);
    expect(root).toBe('/project');
  });

  it('falls back to start path when no indicators exist', async () => {
    const isolated = VirtualFS.empty();
    await isolated.mkdir('/isolated/work', { recursive: true });
    const root = await findProjectRoot('/isolated/work', isolated);
    expect(root).toBe('/isolated/work');
  });

  it('supports overlaying a backing fs through VirtualFS.over', async () => {
    const backing = new MemoryFileSystem();
    await backing.mkdir('/workspace/app/src', { recursive: true });
    await backing.writeFile('/workspace/app/package.json', '{"name":"app"}');

    const overlay = VirtualFS.over(backing);
    const root = await findProjectRoot('/workspace/app/src', overlay);
    expect(root).toBe('/workspace/app');
  });

  it('falls back to the nearest .git directory when no mlld-config.json or package.json exists', async () => {
    const gitRepo = VirtualFS.empty();
    await gitRepo.mkdir('/repo/.git', { recursive: true });
    await gitRepo.mkdir('/repo/src/nested', { recursive: true });

    const root = await findProjectRoot('/repo/src/nested', gitRepo);
    expect(root).toBe('/repo');
  });
});
