import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import os from 'os';
import { interpret } from '@interpreter/index';
import { NodeFileSystem } from '@services/fs/NodeFileSystem';
import { PathService } from '@services/fs/PathService';

describe('Guard bypass config', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) {
        await fs.rm(dir, { recursive: true, force: true });
      }
    }
  });

  it('blocks guard bypass when allowGuardBypass is false', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mlld-guard-bypass-blocked-'));
    tempDirs.push(root);

    await fs.writeFile(
      path.join(root, 'mlld-config.json'),
      JSON.stringify({
        security: {
          allowGuardBypass: false
        }
      }),
      'utf8'
    );
    await fs.writeFile(
      path.join(root, 'main.mld'),
      [
        '/guard @blocker before op:run = when [ * => deny "Blocked" ]',
        '/run { echo test } with { guards: false }'
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
    ).rejects.toThrow('Guard bypass disabled by security config');
  });

  it('allows guard bypass when allowGuardBypass is true (explicit)', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mlld-guard-bypass-allowed-'));
    tempDirs.push(root);

    await fs.writeFile(
      path.join(root, 'mlld-config.json'),
      JSON.stringify({
        security: {
          allowGuardBypass: true
        }
      }),
      'utf8'
    );
    await fs.writeFile(
      path.join(root, 'main.mld'),
      [
        '/guard @blocker before op:run = when [ * => deny "Blocked" ]',
        '/run { echo test } with { guards: false }'
      ].join('\n'),
      'utf8'
    );

    const output = await interpret(await fs.readFile(path.join(root, 'main.mld'), 'utf8'), {
      filePath: path.join(root, 'main.mld'),
      fileSystem: new NodeFileSystem(),
      pathService: new PathService(),
      approveAllImports: true
    });

    expect((output as string).trim()).toBe('test');
  });

  it('allows guard bypass by default (no config)', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mlld-guard-bypass-default-'));
    tempDirs.push(root);

    await fs.writeFile(
      path.join(root, 'mlld-config.json'),
      JSON.stringify({}),
      'utf8'
    );
    await fs.writeFile(
      path.join(root, 'main.mld'),
      [
        '/guard @blocker before op:run = when [ * => deny "Blocked" ]',
        '/run { echo test } with { guards: false }'
      ].join('\n'),
      'utf8'
    );

    const output = await interpret(await fs.readFile(path.join(root, 'main.mld'), 'utf8'), {
      filePath: path.join(root, 'main.mld'),
      fileSystem: new NodeFileSystem(),
      pathService: new PathService(),
      approveAllImports: true
    });

    expect((output as string).trim()).toBe('test');
  });

  it('privileged guards still enforce even when bypass is allowed', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mlld-privileged-guards-'));
    tempDirs.push(root);

    await fs.writeFile(
      path.join(root, 'mlld-config.json'),
      JSON.stringify({
        security: {
          allowGuardBypass: true
        }
      }),
      'utf8'
    );
    await fs.writeFile(
      path.join(root, 'main.mld'),
      [
        '/var @policyConfig = { deny: { cmd: ["echo"] } }',
        '/policy @p = union(@policyConfig)',
        '/run { echo test } with { guards: false }'
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
    ).rejects.toThrow("Command 'echo' denied by policy");
  });
});
