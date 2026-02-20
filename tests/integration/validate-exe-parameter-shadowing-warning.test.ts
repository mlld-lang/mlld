import { describe, it, expect } from 'vitest';
import { analyze } from '../../cli/commands/analyze';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('validate exe parameter shadowing warnings', () => {
  let testDir: string;

  async function writeAndAnalyze(filename: string, content: string) {
    testDir = `/tmp/mlld-validate-exe-parameter-shadowing-${Date.now()}`;
    await fs.mkdir(testDir, { recursive: true });
    const filepath = path.join(testDir, filename);
    await fs.writeFile(filepath, content);
    return analyze(filepath);
  }

  afterEach(async () => {
    if (testDir) {
      await fs.rm(testDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  it('warns when an exe parameter uses a generic name', async () => {
    const result = await writeAndAnalyze('generic-param.mld', [
      'var @result = "pending"',
      'exe @logItemDone(result) = [',
      '  => @result',
      ']',
    ].join('\n'));

    expect(result.valid).toBe(true);
    const warnings = (result.antiPatterns ?? []).filter(entry => entry.code === 'exe-parameter-shadowing');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.suggestion).toContain('@status');
  });

  it('suppresses the warning when configured in mlld-config.json', async () => {
    testDir = `/tmp/mlld-validate-exe-parameter-shadowing-${Date.now()}`;
    await fs.mkdir(testDir, { recursive: true });
    await fs.writeFile(
      path.join(testDir, 'mlld-config.json'),
      JSON.stringify({
        validate: {
          suppressWarnings: ['exe-parameter-shadowing']
        }
      }, null, 2),
      'utf8'
    );

    const filepath = path.join(testDir, 'suppressed-param.mld');
    await fs.writeFile(filepath, [
      'exe @logItemDone(result) = [',
      '  => @result',
      ']',
    ].join('\n'));

    const result = await analyze(filepath);

    expect(result.valid).toBe(true);
    const warnings = (result.antiPatterns ?? []).filter(entry => entry.code === 'exe-parameter-shadowing');
    expect(warnings).toHaveLength(0);
  });
});
