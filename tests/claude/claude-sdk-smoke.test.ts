import { describe, it, expect, beforeAll } from 'vitest';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { execute } from '@sdk/execute';

const shouldRunClaude = process.env.MLLD_RUN_CLAUDE_TESTS === '1';

function resolveClaudeOnPath(): boolean {
  if (process.env.CLAUDE_BIN) {
    const dir = path.dirname(process.env.CLAUDE_BIN);
    if (!process.env.PATH?.split(path.delimiter).includes(dir)) {
      process.env.PATH = `${dir}${path.delimiter}${process.env.PATH || ''}`;
    }
    return true;
  }

  const shell = process.env.SHELL || '/bin/sh';
  const probe = spawnSync(shell, ['-lc', 'command -v claude'], {
    encoding: 'utf8'
  });
  return probe.status === 0 && !!probe.stdout?.trim();
}

const claudeAvailable = shouldRunClaude && resolveClaudeOnPath();
const describeClaude = shouldRunClaude ? describe : describe.skip;

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
