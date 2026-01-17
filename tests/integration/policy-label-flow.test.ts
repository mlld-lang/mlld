import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import os from 'os';
import { interpret } from '@interpreter/index';
import { NodeFileSystem } from '@services/fs/NodeFileSystem';
import { PathService } from '@services/fs/PathService';

describe('Policy label flow integration', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) {
        await fs.rm(dir, { recursive: true, force: true });
      }
    }
  });

  it('blocks labeled data from show output', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mlld-label-show-'));
    tempDirs.push(root);

    await fs.writeFile(
      path.join(root, 'main.mld'),
      [
        '/var @policyConfig = { labels: { secret: { deny: ["op:show"] } } }',
        '/policy @p = union(@policyConfig)',
        '/var secret @token = "abc"',
        '/show @token'
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
    ).rejects.toThrow("Label 'secret' cannot flow to 'op:show'");
  });

  it('blocks labeled data from run commands', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mlld-label-run-'));
    tempDirs.push(root);

    await fs.writeFile(
      path.join(root, 'main.mld'),
      [
        '/var @policyConfig = { labels: { secret: { deny: ["op:cmd"] } } }',
        '/policy @p = union(@policyConfig)',
        '/var secret @cmd = "echo blocked"',
        '/run { @cmd }'
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
    ).rejects.toThrow("Label 'secret' cannot flow to 'op:cmd'");
  });

  it('allows a more specific command rule', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mlld-label-allow-'));
    tempDirs.push(root);

    await fs.writeFile(
      path.join(root, 'main.mld'),
      [
        '/var @policyConfig = { labels: { secret: { deny: ["op:cmd:echo"], allow: ["op:cmd:echo:status"] } } }',
        '/policy @p = union(@policyConfig)',
        '/var secret @cmd = "echo status"',
        '/run { @cmd }'
      ].join('\n'),
      'utf8'
    );

    const output = await interpret(await fs.readFile(path.join(root, 'main.mld'), 'utf8'), {
      filePath: path.join(root, 'main.mld'),
      fileSystem: new NodeFileSystem(),
      pathService: new PathService(),
      approveAllImports: true
    });

    expect((output as string).trim()).toBe('status');
  });

  it('allows explicit using for secret-labeled input', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mlld-label-using-explicit-'));
    tempDirs.push(root);

    await fs.writeFile(
      path.join(root, 'main.mld'),
      [
        '/var @policyConfig = { labels: { secret: { deny: ["op:cmd"] } } }',
        '/policy @p = union(@policyConfig)',
        '/var secret @token = "abc"',
        '/run cmd { node -e "console.log(process.env.EXPLICIT_TOKEN)" } using @token as EXPLICIT_TOKEN'
      ].join('\n'),
      'utf8'
    );

    const output = await interpret(await fs.readFile(path.join(root, 'main.mld'), 'utf8'), {
      filePath: path.join(root, 'main.mld'),
      fileSystem: new NodeFileSystem(),
      pathService: new PathService(),
      approveAllImports: true
    });

    expect((output as string).trim()).toBe('abc');
  });

  it('injects policy auth credentials via using auth', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mlld-label-using-auth-'));
    tempDirs.push(root);

    const envVarName = 'MLLD_TEST_AUTH_TOKEN';
    const originalValue = process.env[envVarName];
    process.env[envVarName] = 'auth-token';

    try {
      await fs.writeFile(
        path.join(root, 'main.mld'),
        [
          `/var @policyConfig = { auth: { test: { from: "env:${envVarName}", as: "${envVarName}" } } }`,
          '/policy @p = union(@policyConfig)',
          `/run cmd { node -e "console.log(process.env.${envVarName})" } using auth:test`
        ].join('\n'),
        'utf8'
      );

      const output = await interpret(await fs.readFile(path.join(root, 'main.mld'), 'utf8'), {
        filePath: path.join(root, 'main.mld'),
        fileSystem: new NodeFileSystem(),
        pathService: new PathService(),
        approveAllImports: true
      });

      expect((output as string).trim()).toBe('auth-token');
    } finally {
      if (originalValue === undefined) {
        delete process.env[envVarName];
      } else {
        process.env[envVarName] = originalValue;
      }
    }
  });

  it('injects auth config from exec definitions with using', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mlld-label-using-exe-'));
    tempDirs.push(root);

    const envVarName = 'MLLD_TEST_EXEC_AUTH_TOKEN';
    const originalValue = process.env[envVarName];
    process.env[envVarName] = 'exec-auth-token';

    try {
      await fs.writeFile(
        path.join(root, 'main.mld'),
        [
          `/var @policyConfig = { auth: { test: { from: "env:${envVarName}", as: "${envVarName}" } } }`,
          '/policy @p = union(@policyConfig)',
          `/exe @spawn() = run cmd { node -e "console.log(process.env.${envVarName})" } using auth:test`,
          '/run @spawn()'
        ].join('\n'),
        'utf8'
      );

      const output = await interpret(await fs.readFile(path.join(root, 'main.mld'), 'utf8'), {
        filePath: path.join(root, 'main.mld'),
        fileSystem: new NodeFileSystem(),
        pathService: new PathService(),
        approveAllImports: true
      });

      expect((output as string).trim()).toBe('exec-auth-token');
    } finally {
      if (originalValue === undefined) {
        delete process.env[envVarName];
      } else {
        process.env[envVarName] = originalValue;
      }
    }
  });
});
