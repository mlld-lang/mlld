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

  it('resolves @base and @root to project root (both are aliases)', async () => {
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

    // Both @base and @root write to project root
    const baseFile = await fs.readFile(path.join(projectDir, 'base.txt'), 'utf-8');
    const rootFile = await fs.readFile(path.join(projectDir, 'root.txt'), 'utf-8');

    expect(baseFile.trim()).toBe('base-write');
    expect(rootFile.trim()).toBe('root-write');
    // Neither file should appear in CWD
    await expect(fs.stat(path.join(outsideCwd, 'base.txt'))).rejects.toThrow();
    await expect(fs.stat(path.join(outsideCwd, 'root.txt'))).rejects.toThrow();
  });

  it('resolves relative output paths from script file directory', async () => {
    const script = [
      '/output "relative-write" to "local-output.txt"'
    ].join('\n');
    await fs.writeFile(scriptPath, script, 'utf-8');

    await execAsync(
      `TSX_TSCONFIG_PATH="${tsconfigPath}" node --import "${tsxImport}" "${mlldCliEntry}" "${scriptPath}"`,
      {
      cwd: outsideCwd,
      timeout: 15000
      }
    );

    // Relative path resolves from script directory, not CWD or project root
    const localFile = await fs.readFile(path.join(scriptDir, 'local-output.txt'), 'utf-8');
    expect(localFile.trim()).toBe('relative-write');
    await expect(fs.stat(path.join(outsideCwd, 'local-output.txt'))).rejects.toThrow();
    await expect(fs.stat(path.join(projectDir, 'local-output.txt'))).rejects.toThrow();
  });

  it('resolves relative import paths from script file directory', async () => {
    const scriptLibDir = path.join(scriptDir, 'lib');
    const cwdLibDir = path.join(outsideCwd, 'lib');
    await fs.mkdir(scriptLibDir, { recursive: true });
    await fs.mkdir(cwdLibDir, { recursive: true });

    await fs.writeFile(
      path.join(scriptLibDir, 'local-helper.mld'),
      [
        '/var @source = "script-dir-helper"',
        '/export { @source }'
      ].join('\n'),
      'utf-8'
    );
    await fs.writeFile(
      path.join(cwdLibDir, 'local-helper.mld'),
      [
        '/var @source = "cwd-helper"',
        '/export { @source }'
      ].join('\n'),
      'utf-8'
    );

    const script = [
      '/import { @source } from "./lib/local-helper.mld"',
      '/show @source'
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

    expect(lines).toContain('script-dir-helper');
    expect(lines).not.toContain('cwd-helper');
  });
});
