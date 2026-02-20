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

describe('@ escaping consistency across interpolation contexts', () => {
  let tempDir: string;
  let projectDir: string;
  let scriptPath: string;
  let outsideCwd: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mlld-escaping-at-'));
    projectDir = path.join(tempDir, 'project');
    outsideCwd = path.join(tempDir, 'outside');
    scriptPath = path.join(projectDir, 'script.mld');

    await fs.mkdir(projectDir, { recursive: true });
    await fs.mkdir(outsideCwd, { recursive: true });
    await fs.writeFile(path.join(projectDir, 'mlld-config.json'), JSON.stringify({}, null, 2), 'utf-8');
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  it('treats @@ and \\@ identically in backticks, quotes, :: templates, .att, and cmd blocks', async () => {
    await fs.writeFile(
      path.join(projectDir, 'escape.att'),
      'ATT:@@start,user@@example.com,@name@@domain,\\@start,user\\@example.com,@name\\@domain\n',
      'utf-8'
    );

    const script = [
      '/var @user = "alice"',
      '',
      '/var @bt1 = `@@start`',
      '/var @bt2 = `user@@example.com`',
      '/var @bt3 = `@user@@domain`',
      '/var @bt4 = `\\@start`',
      '/var @bt5 = `user\\@example.com`',
      '/var @bt6 = `@user\\@domain`',
      '/show `BT:@bt1,@bt2,@bt3,@bt4,@bt5,@bt6`',
      '',
      '/var @dq1 = "@@start"',
      '/var @dq2 = "user@@example.com"',
      '/var @dq3 = "@user@@domain"',
      '/var @dq4 = "\\@start"',
      '/var @dq5 = "user\\@example.com"',
      '/var @dq6 = "@user\\@domain"',
      '/show `DQ:@dq1,@dq2,@dq3,@dq4,@dq5,@dq6`',
      '',
      '/var @sq1 = \'@@start\'',
      '/var @sq2 = \'user@@example.com\'',
      '/var @sq3 = \'@user@@domain\'',
      '/var @sq4 = \'\\@start\'',
      '/var @sq5 = \'user\\@example.com\'',
      '/var @sq6 = \'@user\\@domain\'',
      '/show `SQ:@sq1,@sq2,@sq3,@sq4,@sq5,@sq6`',
      '',
      '/var @dc1 = ::@@start::',
      '/var @dc2 = ::user@@example.com::',
      '/var @dc3 = ::@user@@domain::',
      '/var @dc4 = ::\\@start::',
      '/var @dc5 = ::user\\@example.com::',
      '/var @dc6 = ::@user\\@domain::',
      '/show `DC:@dc1,@dc2,@dc3,@dc4,@dc5,@dc6`',
      '',
      '/exe @render(name) = template "escape.att"',
      '/show @render(@user)',
      '',
      '/var @cmd1 = run cmd { echo @@start }',
      '/var @cmd2 = run cmd { echo user@@example.com }',
      '/var @cmd3 = run cmd { echo @user@@domain }',
      '/var @cmd4 = run cmd { echo \\@start }',
      '/var @cmd5 = run cmd { echo user\\@example.com }',
      '/var @cmd6 = run cmd { echo @user\\@domain }',
      '/show `CMD:@cmd1,@cmd2,@cmd3,@cmd4,@cmd5,@cmd6`'
    ].join('\n');

    await fs.writeFile(scriptPath, script, 'utf-8');

    const { stdout } = await execAsync(
      `TSX_TSCONFIG_PATH="${tsconfigPath}" node --import "${tsxImport}" "${mlldCliEntry}" "${scriptPath}"`,
      { cwd: outsideCwd, timeout: 15000 }
    );

    const lines = stdout
      .split(/\r?\n/g)
      .map(line => line.trim())
      .filter(line => line.length > 0);

    expect(lines).toContain('BT:@start,user@example.com,alice@domain,@start,user@example.com,alice@domain');
    expect(lines).toContain('DQ:@start,user@example.com,alice@domain,@start,user@example.com,alice@domain');
    expect(lines).toContain('SQ:@start,user@example.com,@user@domain,@start,user@example.com,@user@domain');
    expect(lines).toContain('DC:@start,user@example.com,alice@domain,@start,user@example.com,alice@domain');
    expect(lines).toContain('ATT:@start,user@example.com,alice@domain,@start,user@example.com,alice@domain');
    expect(lines).toContain('CMD:@start,user@example.com,alice@domain,@start,user@example.com,alice@domain');
  });
});
