import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import os from 'os';
import { interpret } from '@interpreter/index';
import { NodeFileSystem } from '@services/fs/NodeFileSystem';
import { PathService } from '@services/fs/PathService';

describe('Policy config integration', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) {
        await fs.rm(dir, { recursive: true, force: true });
      }
    }
  });

  it('imports policies defined in mlld-config.json', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mlld-policy-config-'));
    tempDirs.push(root);

    await fs.mkdir(path.join(root, 'policies'), { recursive: true });
    await fs.writeFile(
      path.join(root, 'policies', 'prod.mld'),
      '/var @config = { allow: { cmd: ["echo"] } }',
      'utf8'
    );
    await fs.writeFile(
      path.join(root, 'mlld-config.json'),
      JSON.stringify({
        policy: {
          import: ['./policies/prod.mld'],
          environment: 'production'
        }
      }),
      'utf8'
    );
    await fs.writeFile(
      path.join(root, 'main.mld'),
      [
        '/show @ctx.policy.activePolicies[0]',
        '/show @ctx.policy.environment',
        '/show @ctx.policy.configs.allow.cmd'
      ].join('\n'),
      'utf8'
    );

    const output = await interpret(await fs.readFile(path.join(root, 'main.mld'), 'utf8'), {
      filePath: path.join(root, 'main.mld'),
      fileSystem: new NodeFileSystem(),
      pathService: new PathService(),
      approveAllImports: true
    });

    expect((output as string).trim()).toBe(['prod', 'production', '["echo"]'].join('\n\n'));
  });

  it('applies policy environment without imports', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mlld-policy-env-'));
    tempDirs.push(root);

    await fs.writeFile(
      path.join(root, 'mlld-config.json'),
      JSON.stringify({
        policy: {
          environment: 'staging'
        }
      }),
      'utf8'
    );
    await fs.writeFile(path.join(root, 'main.mld'), '/show @ctx.policy.environment', 'utf8');

    const output = await interpret(await fs.readFile(path.join(root, 'main.mld'), 'utf8'), {
      filePath: path.join(root, 'main.mld'),
      fileSystem: new NodeFileSystem(),
      pathService: new PathService(),
      approveAllImports: true
    });

    expect((output as string).trim()).toBe('staging');
  });
});
