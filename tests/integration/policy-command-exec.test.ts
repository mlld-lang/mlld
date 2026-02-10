import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import os from 'os';
import { interpret } from '@interpreter/index';
import { NodeFileSystem } from '@services/fs/NodeFileSystem';
import { PathService } from '@services/fs/PathService';

describe('Policy command deny for executable commands', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) {
        await fs.rm(dir, { recursive: true, force: true });
      }
    }
  });

  it('denies /run command with capabilities deny pattern', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mlld-policy-run-deny-'));
    tempDirs.push(root);

    await fs.writeFile(
      path.join(root, 'main.mld'),
      [
        '/var @policyConfig = {',
        '  capabilities: {',
        '    allow: ["cmd:echo:*"],',
        '    deny: ["cmd:echo:hello"]',
        '  }',
        '}',
        '/policy @p = union(@policyConfig)',
        '/run { echo hello }'
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

  it('denies cmd executable invocation with capabilities deny pattern', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mlld-policy-exec-deny-'));
    tempDirs.push(root);

    await fs.writeFile(
      path.join(root, 'main.mld'),
      [
        '/var @policyConfig = {',
        '  capabilities: {',
        '    allow: ["cmd:echo:*"],',
        '    deny: ["cmd:echo:hello"]',
        '  }',
        '}',
        '/policy @p = union(@policyConfig)',
        '/exe @say() = cmd { echo hello }',
        '/var @result = @say()'
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

  it('applies deny prefix pattern for /run command with args', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mlld-policy-run-deny-prefix-'));
    tempDirs.push(root);

    await fs.writeFile(
      path.join(root, 'main.mld'),
      [
        '/var @policyConfig = {',
        '  capabilities: {',
        '    allow: ["cmd:echo:*"],',
        '    deny: ["cmd:echo:push"]',
        '  }',
        '}',
        '/policy @p = union(@policyConfig)',
        '/run { echo push origin main }'
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

  it('applies deny prefix pattern for cmd executable invocation with args', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mlld-policy-exec-deny-prefix-'));
    tempDirs.push(root);

    await fs.writeFile(
      path.join(root, 'main.mld'),
      [
        '/var @policyConfig = {',
        '  capabilities: {',
        '    allow: ["cmd:echo:*"],',
        '    deny: ["cmd:echo:push"]',
        '  }',
        '}',
        '/policy @p = union(@policyConfig)',
        '/exe @say() = cmd { echo push origin main }',
        '/var @result = @say()'
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
