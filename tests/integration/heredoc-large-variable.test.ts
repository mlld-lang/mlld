import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, rm } from 'fs/promises';
import { existsSync, statSync } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { spawnSync } from 'child_process';

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

// These tests require low concurrency to avoid resource contention with parallel tests.
// Run with: npm run test:heredoc
describe.sequential('Bash heredoc integration', () => {
  let projectDir: string;

  beforeEach(async () => {
    projectDir = await mkdtemp(path.join(os.tmpdir(), 'mlld-heredoc-'));
  });

  afterEach(async () => {
    await rm(projectDir, { recursive: true, force: true }).catch(() => {});
  });

  it('reproduces large variable heredoc issue', { timeout: 30000 }, async () => {
    const script = `run sh {
  head -c 215920 < /dev/zero | tr '\\0' 'a' > big.txt
}
var @content = <big.txt>
exe @shell_echo(arg) = sh { echo "shell executed" }
exe @native_echo(arg) = sh { echo "node executed" }
show @shell_echo(@content)
show @native_echo(@content)
run @native_echo(@content)
show @content.length()
run { rm -f big.txt }
`;

    const scriptPath = path.join(projectDir, 'large-variable.mld');
    await writeFile(scriptPath, script);

    // Create clean env without test-specific variables that might affect execution
    const childEnv = { ...process.env, MLLD_BASH_HEREDOC: '1' };
    delete childEnv.MLLD_TEST;
    delete childEnv.MLLD_TEST_MODE;
    delete childEnv.MLLD_STREAMING;

    const result = spawnSync(process.execPath, [mlldBin, scriptPath], {
      cwd: projectDir,
      env: childEnv,
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
      timeout: 25000,
      // Don't inherit stdin to prevent pollution from test runner
      stdio: ['ignore', 'pipe', 'pipe']
    });

    const stdout = result.stdout || '';
    const stderr = result.stderr || '';
    const nodeEchoCount = (stdout.match(/node executed/g) || []).length;

    expect(result.status, `Exit code should be 0, stderr: ${stderr.slice(0, 200)}`).toBe(0);
    expect(stdout).toContain('shell executed');
    expect(stdout).toContain('215920');
    // Should appear at least twice: once from /show, once from /run exec-invocation
    expect(nodeEchoCount, `node executed should appear 2+ times but got ${nodeEchoCount}`).toBeGreaterThanOrEqual(2);
  });
});
