import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { execute } from '@sdk/execute';

const shouldRun = process.env.MLLD_RUN_CLAUDE_TESTS === '1';
const describeTest = shouldRun ? describe : describe.skip;

describeTest('Claude escaping patterns (E2E with SDK)', () => {
  it('pattern 1: pipes value through claude', async () => {
    const script = path.join(process.cwd(), 'tmp/claude-test-1-pipe-value.mld');
    const result = await execute(script, {});

    const output = String((result as any).output || '').trim();
    expect(output.length).toBeGreaterThan(0);
    expect(output.toUpperCase()).toContain('OK');
  }, 30000);

  it('pattern 2: uses value inside cmd body', async () => {
    const script = path.join(process.cwd(), 'tmp/claude-test-2-value-in-cmd.mld');
    const result = await execute(script, {});

    const output = String((result as any).output || '').trim();
    expect(output.length).toBeGreaterThan(0);
    expect(output.toUpperCase()).toContain('OK');
  }, 30000);

  it('pattern 3: pipes result from another function', async () => {
    const script = path.join(process.cwd(), 'tmp/claude-test-3-pipe-other-func.mld');
    const result = await execute(script, {});

    const output = String((result as any).output || '').trim();
    expect(output.length).toBeGreaterThan(0);
    expect(output.toUpperCase()).toContain('OK');
  }, 30000);

  it('pattern 4: pipes js result through claude', async () => {
    const script = path.join(process.cwd(), 'tmp/claude-test-4-pipe-js.mld');
    const result = await execute(script, {});

    const output = String((result as any).output || '').trim();
    expect(output.length).toBeGreaterThan(0);
    expect(output.toUpperCase()).toContain('OK');
  }, 30000);

  it('pattern 5: pipes cmd result through claude', async () => {
    const script = path.join(process.cwd(), 'tmp/claude-test-5-pipe-cmd.mld');
    const result = await execute(script, {});

    const output = String((result as any).output || '').trim();
    expect(output.length).toBeGreaterThan(0);
    expect(output.toUpperCase()).toContain('OK');
  }, 30000);

  it('pattern 6: double pipe through claude', async () => {
    const script = path.join(process.cwd(), 'tmp/claude-test-6-double-pipe.mld');
    const result = await execute(script, {});

    const output = String((result as any).output || '').trim();
    expect(output.length).toBeGreaterThan(0);
  }, 30000);
});
