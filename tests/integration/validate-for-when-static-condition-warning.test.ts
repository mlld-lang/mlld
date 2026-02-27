import { describe, it, expect, afterEach } from 'vitest';
import { analyze } from '../../cli/commands/analyze';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('validate for...when static condition warnings', () => {
  let testDir = '';

  async function writeAndAnalyze(filename: string, content: string) {
    testDir = `/tmp/mlld-validate-for-when-static-${Date.now()}`;
    await fs.mkdir(testDir, { recursive: true });
    const filepath = path.join(testDir, filename);
    await fs.writeFile(filepath, content, 'utf8');
    return analyze(filepath);
  }

  afterEach(async () => {
    if (testDir) {
      await fs.rm(testDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  it('warns when for...when condition does not reference loop variables', async () => {
    const result = await writeAndAnalyze(
      'static-for-when.mld',
      [
        '/var @list = ["a"]',
        '/var @shouldRun = true',
        '/var @out = for @item in @list when @shouldRun [',
        '  => @item',
        ']'
      ].join('\n')
    );

    expect(result.valid).toBe(true);
    const warnings = (result.antiPatterns ?? []).filter(entry => entry.code === 'for-when-static-condition');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.suggestion).toContain('var @items = @cond ? @list : []');
  });

  it('does not warn when for...when condition references the loop variable', async () => {
    const result = await writeAndAnalyze(
      'dynamic-for-when.mld',
      [
        '/var @list = ["a"]',
        '/var @out = for @item in @list when @item [',
        '  => @item',
        ']'
      ].join('\n')
    );

    expect(result.valid).toBe(true);
    const warnings = (result.antiPatterns ?? []).filter(entry => entry.code === 'for-when-static-condition');
    expect(warnings).toHaveLength(0);
  });

  it('suppresses for...when static-condition warnings when configured', async () => {
    testDir = `/tmp/mlld-validate-for-when-static-${Date.now()}`;
    await fs.mkdir(testDir, { recursive: true });
    await fs.writeFile(
      path.join(testDir, 'mlld-config.json'),
      JSON.stringify({
        validate: {
          suppressWarnings: ['for-when-static-condition']
        }
      }, null, 2),
      'utf8'
    );

    const filepath = path.join(testDir, 'suppressed-for-when.mld');
    await fs.writeFile(filepath, [
      '/var @list = ["a"]',
      '/var @shouldRun = true',
      '/var @out = for @item in @list when @shouldRun [',
      '  => @item',
      ']'
    ].join('\n'));

    const result = await analyze(filepath);

    expect(result.valid).toBe(true);
    const warnings = (result.antiPatterns ?? []).filter(entry => entry.code === 'for-when-static-condition');
    expect(warnings).toHaveLength(0);
  });
});
