import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, writeFile, rm } from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const mlldBin = path.resolve(process.cwd(), 'dist/cli.cjs');

describe('Bash heredoc integration', () => {
  let projectDir: string;

  beforeAll(async () => {
    projectDir = await mkdtemp(path.join(os.tmpdir(), 'mlld-heredoc-'));
  });

  afterAll(async () => {
    await rm(projectDir, { recursive: true, force: true }).catch(() => {});
  });

  it('reproduces large variable heredoc issue', async () => {
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

    const MAX_BUFFER = 10 * 1024 * 1024; // 10MB for large outputs
    const { stdout } = await execAsync(
      `node "${mlldBin}" "${scriptPath}"`,
      {
        cwd: projectDir,
        env: { ...process.env, MLLD_BASH_HEREDOC: '1' },
        maxBuffer: MAX_BUFFER
      }
    );

    expect(stdout).toContain('shell executed');
    // Should appear at least twice: once from /show, once from /run exec-invocation
    const nodeEchoCount = (stdout.match(/node executed/g) || []).length;
    expect(nodeEchoCount).toBeGreaterThanOrEqual(2);
    expect(stdout).toContain('215920');
  });
});
