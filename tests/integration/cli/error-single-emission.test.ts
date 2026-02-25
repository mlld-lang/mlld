import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'fs/promises';
import { existsSync, statSync } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const mlldBin = resolveMlldBin();

function resolveMlldBin(): string {
  const distPath = path.resolve(process.cwd(), 'dist/cli.cjs');
  const sourcePath = path.resolve(process.cwd(), 'cli/cli-entry.ts');
  const wrapperPath = path.resolve(process.cwd(), 'bin/mlld-wrapper.cjs');

  if (!existsSync(distPath)) return wrapperPath;
  if (!existsSync(sourcePath)) return distPath;
  try {
    return statSync(sourcePath).mtimeMs > statSync(distPath).mtimeMs ? wrapperPath : distPath;
  } catch {
    return distPath;
  }
}

async function runAndCaptureStderr(scriptPath: string, cwd: string): Promise<string> {
  try {
    const result = await execAsync(`node "${mlldBin}" "${scriptPath}"`, { cwd });
    return String(result.stderr ?? '');
  } catch (error: any) {
    return String(error?.stderr ?? '');
  }
}

describe('CLI error emission', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mlld-error-single-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('emits one formatted error block for missing file failures', async () => {
    const scriptPath = path.join(tempDir, 'missing-file.mld');
    await fs.writeFile(
      scriptPath,
      ['/var @x = <@root/does-not-exist.json>', '/show @x'].join('\n'),
      'utf8'
    );

    const stderr = await runAndCaptureStderr(scriptPath, tempDir);
    const blocks = stderr.match(/mlld error/g) ?? [];

    expect(stderr).toContain('File not found');
    expect(blocks).toHaveLength(1);
  });

  it('emits one formatted error block for command execution failures', async () => {
    const scriptPath = path.join(tempDir, 'command-failure.mld');
    await fs.writeFile(
      scriptPath,
      '/run js { throw new Error("single-emission-check") }',
      'utf8'
    );

    const stderr = await runAndCaptureStderr(scriptPath, tempDir);
    const blocks = stderr.match(/mlld error/g) ?? [];

    expect(stderr).toContain('single-emission-check');
    expect(blocks).toHaveLength(1);
  });
});
