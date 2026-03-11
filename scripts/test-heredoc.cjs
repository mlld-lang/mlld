#!/usr/bin/env node

const { spawnSync } = require('node:child_process');
const { mkdtempSync, writeFileSync, rmSync, existsSync, statSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function resolveMlldBin() {
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

function fail(message, details = {}) {
  console.error(`[heredoc-test] ${message}`);
  if (details.stdout) {
    console.error('stdout:\n' + details.stdout);
  }
  if (details.stderr) {
    console.error('stderr:\n' + details.stderr);
  }
  process.exit(1);
}

const projectDir = mkdtempSync(path.join(os.tmpdir(), 'mlld-heredoc-script-'));
const scriptPath = path.join(projectDir, 'large-variable.mld');
const mlldBin = resolveMlldBin();

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

try {
  writeFileSync(scriptPath, script, 'utf8');

  const childEnv = { ...process.env, MLLD_BASH_HEREDOC: '1' };
  delete childEnv.MLLD_TEST;
  delete childEnv.MLLD_TEST_MODE;
  delete childEnv.MLLD_STREAMING;

  const result = spawnSync(process.execPath, [mlldBin, scriptPath], {
    cwd: projectDir,
    env: childEnv,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
    timeout: 25_000,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  const stdout = result.stdout || '';
  const stderr = result.stderr || '';

  if (result.status !== 0) {
    fail(`Expected exit code 0 but got ${result.status}`, { stdout, stderr });
  }

  if (!stdout.includes('shell executed')) {
    fail('Expected output to include "shell executed"', { stdout, stderr });
  }

  if (!stdout.includes('215920')) {
    fail('Expected output to include "215920"', { stdout, stderr });
  }

  const nodeEchoCount = (stdout.match(/node executed/g) || []).length;
  if (nodeEchoCount < 2) {
    fail(`Expected "node executed" at least 2 times but got ${nodeEchoCount}`, { stdout, stderr });
  }
} finally {
  rmSync(projectDir, { recursive: true, force: true });
}

console.log('[heredoc-test] ok');
