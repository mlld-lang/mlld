import { describe, it, expect, beforeAll } from 'vitest';
import path from 'node:path';
import { execute } from '@sdk/execute';
import { claudeAvailable } from './claude-test-utils';

const describeClaude = claudeAvailable ? describe : describe.skip;

describeClaude('Claude sign/verify demo (mlld file)', () => {
  let modulePath: string;

  beforeAll(() => {
    modulePath = path.join(process.cwd(), 'tests/claude/claude-sign-verify-demo.mld');
  });

  it('runs the signed prompt demo', async () => {
    const result = await execute(modulePath, {});
    const output = String((result as any).output || '').trim();
    expect(output.length).toBeGreaterThan(0);
    expect(output.toUpperCase()).not.toContain('COMMAND NOT FOUND');
    expect(output.toUpperCase()).not.toContain('NOT_FOUND_ERROR');
  }, 20000);
});
