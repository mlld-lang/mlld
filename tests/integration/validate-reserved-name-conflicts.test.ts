import { describe, it, expect } from 'vitest';
import { analyze } from '../../cli/commands/analyze';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('validate classifies reserved conflicts and builtin shadowing', () => {
  let testDir: string;

  async function writeAndAnalyze(filename: string, content: string) {
    testDir = `/tmp/mlld-validate-reserved-test-${Date.now()}`;
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

  it('detects let @exists shadowing a builtin transformer in exe blocks', async () => {
    const result = await writeAndAnalyze('test.mld', [
      'exe @test() = [',
      '  let @exists = "hello"',
      '  => @exists',
      ']',
      'var @r = @test()',
    ].join('\n'));

    expect(result.valid).toBe(true);
    expect(result.redefinitions?.some(r => r.variable === 'exists' && r.reason === 'builtin-conflict')).toBe(true);
  });

  it('detects let @json shadowing a builtin transformer in exe blocks', async () => {
    const result = await writeAndAnalyze('test-json.mld', [
      'exe @process() = [',
      '  let @json = "not-a-transformer"',
      '  => @json',
      ']',
    ].join('\n'));

    expect(result.valid).toBe(true);
    expect(result.redefinitions?.some(r => r.variable === 'json' && r.reason === 'builtin-conflict')).toBe(true);
  });

  it('detects let @parse shadowing a builtin transformer in exe blocks', async () => {
    const result = await writeAndAnalyze('test-parse.mld', [
      'exe @process() = [',
      '  let @parse = "not-a-transformer"',
      '  => @parse',
      ']',
    ].join('\n'));

    expect(result.valid).toBe(true);
    expect(result.redefinitions?.some(r => r.variable === 'parse' && r.reason === 'builtin-conflict')).toBe(true);
  });

  it('detects var @now as a reserved-name conflict at top level', async () => {
    const result = await writeAndAnalyze('test-now.mld', [
      'var @now = "not-the-time"',
    ].join('\n'));

    expect(result.valid).toBe(true);
    expect(result.redefinitions?.some(r => r.variable === 'now' && r.reason === 'reserved-conflict')).toBe(true);
  });
});
