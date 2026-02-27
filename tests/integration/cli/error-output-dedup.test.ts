import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { spawn } from 'child_process';

const projectRoot = process.cwd();
const cliEntryPath = path.resolve(projectRoot, 'cli/cli-entry.ts');
const tsxImportPath = path.resolve(projectRoot, 'node_modules/tsx/dist/esm/index.mjs');
const tsconfigPath = path.resolve(projectRoot, 'tsconfig.json');

interface CliRunResult {
  stdout: string;
  stderr: string;
  combined: string;
  exitCode: number;
}

function countLiteral(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let index = 0;
  while (index !== -1) {
    index = haystack.indexOf(needle, index);
    if (index !== -1) {
      count += 1;
      index += needle.length;
    }
  }
  return count;
}

function runCli(scriptPath: string): Promise<CliRunResult> {
  return new Promise(resolve => {
    const childEnv: NodeJS.ProcessEnv = {
      ...process.env,
      TSX_TSCONFIG_PATH: tsconfigPath
    };
    // Isolate CLI subprocess from vitest/test-runner globals so exit codes
    // reflect real CLI behavior in all modes (full + TESTFAST).
    delete childEnv.NODE_OPTIONS;
    delete childEnv.VITEST;
    delete childEnv.VITEST_WORKER_ID;
    delete childEnv.VITEST_POOL_ID;
    delete childEnv.TESTFAST;
    delete childEnv.SKIP_SLOW;
    delete childEnv.MLLD_STRICT;

    const child = spawn(
      process.execPath,
      ['--import', tsxImportPath, cliEntryPath, scriptPath],
      {
        cwd: projectRoot,
        env: childEnv
      }
    );

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', chunk => {
      stdout += String(chunk);
    });
    child.stderr.on('data', chunk => {
      stderr += String(chunk);
    });

    child.on('close', code => {
      resolve({
        stdout,
        stderr,
        combined: stdout + stderr,
        exitCode: typeof code === 'number' ? code : 1
      });
    });

    child.on('error', () => {
      resolve({
        stdout,
        stderr,
        combined: stdout + stderr,
        exitCode: 1
      });
    });
  });
}

describe('CLI error output deduplication', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mlld-error-dedup-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('prints policy denial message exactly once', async () => {
    const scriptPath = path.join(tempDir, 'policy-denial.mld');
    await fs.writeFile(
      scriptPath,
      [
        'var @policyConfig = {',
        '  capabilities: {',
        '    allow: ["cmd:git:*"],',
        '    deny: ["cmd:git:push"]',
        '  }',
        '}',
        '',
        'policy @p = union(@policyConfig)',
        '',
        'exe @push() = cmd { git push origin main }',
        '',
        'var @result = @push()'
      ].join('\n'),
      'utf8'
    );

    const result = await runCli(scriptPath);
    expect(result.exitCode).not.toBe(0);
    expect(countLiteral(result.combined, "Command 'git' denied by policy")).toBe(1);
  });

  it('prints missing import error exactly once', async () => {
    const scriptPath = path.join(tempDir, 'missing-import.mld');
    await fs.writeFile(
      scriptPath,
      ['import { @helper } from "./missing.mld"', 'show @helper'].join('\n'),
      'utf8'
    );

    const result = await runCli(scriptPath);
    expect(result.exitCode).not.toBe(0);
    expect(countLiteral(result.combined, 'File not found: ./missing.mld')).toBe(1);
  });

  it('prints runtime command error summary exactly once', async () => {
    const scriptPath = path.join(tempDir, 'runtime-error.mld');
    await fs.writeFile(
      scriptPath,
      [
        'exe @boom() = js { throw new Error("boom") }',
        'show @boom()'
      ].join('\n'),
      'utf8'
    );

    const result = await runCli(scriptPath);
    expect(result.exitCode).not.toBe(0);
    expect(countLiteral(result.combined, 'MlldCommandExecution: boom')).toBe(1);
  });
});
