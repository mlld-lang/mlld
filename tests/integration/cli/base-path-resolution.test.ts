import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const mlldCliEntry = path.resolve(process.cwd(), 'cli/cli-entry.ts');
const tsxImport = path.resolve(process.cwd(), 'node_modules/tsx/dist/esm/index.mjs');
const tsconfigPath = path.resolve(process.cwd(), 'tsconfig.json');

describe('@base and @root path resolution', () => {
  let tempDir: string;
  let projectDir: string;
  let scriptDir: string;
  let scriptPath: string;
  let outsideCwd: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mlld-base-root-'));
    projectDir = path.join(tempDir, 'project');
    scriptDir = path.join(projectDir, 'scripts', 'nested');
    scriptPath = path.join(scriptDir, 'main.mld');
    outsideCwd = path.join(tempDir, 'outside');

    await fs.mkdir(scriptDir, { recursive: true });
    await fs.mkdir(outsideCwd, { recursive: true });
    await fs.writeFile(path.join(projectDir, 'mlld-config.json'), JSON.stringify({}, null, 2), 'utf-8');
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  it('resolves @base to script directory and @root to project root', async () => {
    const script = [
      '/output "base-write" to "@base/base.txt"',
      '/output "root-write" to "@root/root.txt"',
      '/show <@base/base.txt>',
      '/show <@root/root.txt>',
      '/show @base'
    ].join('\n');
    await fs.writeFile(scriptPath, script, 'utf-8');

    const { stdout } = await execAsync(
      `TSX_TSCONFIG_PATH="${tsconfigPath}" node --import "${tsxImport}" "${mlldCliEntry}" "${scriptPath}"`,
      {
      cwd: outsideCwd,
      timeout: 15000
      }
    );
    const lines = stdout
      .split(/\r?\n/g)
      .map(line => line.trim())
      .filter(line => line.length > 0);

    expect(lines).toContain('base-write');
    expect(lines).toContain('root-write');

    const baseFile = await fs.readFile(path.join(scriptDir, 'base.txt'), 'utf-8');
    const rootFile = await fs.readFile(path.join(projectDir, 'root.txt'), 'utf-8');

    expect(baseFile.trim()).toBe('base-write');
    expect(rootFile.trim()).toBe('root-write');
    await expect(fs.stat(path.join(outsideCwd, 'base.txt'))).rejects.toThrow();
    await expect(fs.stat(path.join(outsideCwd, 'root.txt'))).rejects.toThrow();
  });
});
