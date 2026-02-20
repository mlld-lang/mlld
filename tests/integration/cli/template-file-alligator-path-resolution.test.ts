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

describe('template file alligator path resolution', () => {
  let tempDir: string;
  let projectDir: string;
  let scriptDir: string;
  let workersDir: string;
  let scriptPath: string;
  let outsideCwd: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mlld-template-alligator-'));
    projectDir = path.join(tempDir, 'project');
    scriptDir = path.join(projectDir, 'caller');
    workersDir = path.join(projectDir, 'workers');
    scriptPath = path.join(scriptDir, 'main.mld');
    outsideCwd = path.join(tempDir, 'outside');

    await fs.mkdir(scriptDir, { recursive: true });
    await fs.mkdir(path.join(scriptDir, 'shared'), { recursive: true });
    await fs.mkdir(path.join(workersDir, 'shared'), { recursive: true });
    await fs.mkdir(outsideCwd, { recursive: true });
    await fs.writeFile(path.join(projectDir, 'mlld-config.json'), JSON.stringify({}, null, 2), 'utf-8');

    await fs.writeFile(path.join(scriptDir, 'shared', 'workflow.md'), 'caller-shared', 'utf-8');
    await fs.writeFile(path.join(workersDir, 'shared', 'workflow.md'), 'worker-shared', 'utf-8');
    await fs.writeFile(
      path.join(workersDir, 'impl.att'),
      'Template path check: <shared/workflow.md>',
      'utf-8'
    );
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  it('resolves alligator paths inside template files from the template directory', async () => {
    const script = [
      '/exe @worker() = template "../workers/impl.att"',
      '/show @worker()'
    ].join('\n');
    await fs.writeFile(scriptPath, script, 'utf-8');

    const { stdout } = await execAsync(
      `TSX_TSCONFIG_PATH="${tsconfigPath}" node --import "${tsxImport}" "${mlldCliEntry}" "${scriptPath}"`,
      {
        cwd: outsideCwd,
        timeout: 15000
      }
    );

    expect(stdout).toContain('worker-shared');
    expect(stdout).not.toContain('caller-shared');
  });
});
