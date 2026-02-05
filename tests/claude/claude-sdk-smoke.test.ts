import { describe, it, expect, beforeAll } from 'vitest';
import path from 'node:path';
import { execute } from '@sdk/execute';
import { claudeAvailable } from './claude-test-utils';

const describeClaude = claudeAvailable ? describe : describe.skip;

describeClaude('Claude SDK smoke (mlld file)', () => {
  let modulePath: string;

  beforeAll(() => {
    modulePath = path.join(process.cwd(), 'tests/claude/claude-sdk-smoke.mld');
  });

  it('returns a response for the embedded claude exe', async () => {
    const result = await execute(modulePath, {});
    const output = String((result as any).output || '').trim();
    expect(output.length).toBeGreaterThan(0);
    expect(output.toUpperCase()).not.toContain('COMMAND NOT FOUND');
    expect(output.toUpperCase()).not.toContain('NOT_FOUND_ERROR');
  }, 20000);
});
