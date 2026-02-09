import { describe, it, expect } from 'vitest';
import { analyze } from '../../cli/commands/analyze';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Regression tests for m-50a8: mlld validate should catch reserved/builtin
 * variable name conflicts at validation time, not just at runtime.
 *
 * Currently, `let @exists = ...` inside an exe block passes validate clean
 * but fails at runtime with "Variable 'exists' is already defined".
 *
 * See: tk show m-50a8
 */
describe('validate catches reserved variable name conflicts (m-50a8)', () => {
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

  it('should detect let @exists shadowing builtin transformer in exe block', async () => {
    const result = await writeAndAnalyze('test.mld', [
      'exe @test() = [',
      '  let @exists = "hello"',
      '  => @exists',
      ']',
      'var @r = @test()',
    ].join('\n'));

    // Currently passes as valid — once fixed, should report a redefinition
    // warning or error for 'exists' shadowing the builtin @exists transformer.
    const hasConflict =
      (result.redefinitions && result.redefinitions.some(r => r.variable === 'exists')) ||
      (result.warnings && result.warnings.some(w => w.variable === 'exists')) ||
      (result.errors && result.errors.some(e => e.message.includes('exists')));

    expect(hasConflict).toBe(true);
  });

  it('should detect let @json shadowing builtin transformer in exe block', async () => {
    const result = await writeAndAnalyze('test-json.mld', [
      'exe @process() = [',
      '  let @json = "not-a-transformer"',
      '  => @json',
      ']',
    ].join('\n'));

    const hasConflict =
      (result.redefinitions && result.redefinitions.some(r => r.variable === 'json')) ||
      (result.warnings && result.warnings.some(w => w.variable === 'json')) ||
      (result.errors && result.errors.some(e => e.message.includes('json')));

    expect(hasConflict).toBe(true);
  });

  it('should detect var @now shadowing reserved variable at top level', async () => {
    const result = await writeAndAnalyze('test-now.mld', [
      'var @now = "not-the-time"',
    ].join('\n'));

    const hasConflict =
      (result.redefinitions && result.redefinitions.some(r => r.variable === 'now')) ||
      (result.warnings && result.warnings.some(w => w.variable === 'now')) ||
      (result.errors && result.errors.some(e => e.message.includes('now')));

    expect(hasConflict).toBe(true);
  });
});
