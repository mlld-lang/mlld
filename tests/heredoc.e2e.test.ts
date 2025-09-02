import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

describe('Heredoc large-variable handling (e2e)', () => {
  it('runs scripts/test-heredoc.cjs without failures', () => {
    const script = join(__dirname, '..', 'scripts', 'test-heredoc.cjs');
    const result = spawnSync(process.execPath, [script], {
      encoding: 'utf8',
      env: { ...process.env },
      maxBuffer: 20 * 1024 * 1024
    });
    if (result.status !== 0) {
      // Surface output to help debug in CI
      // Note: vitest prints this on assertion failure
      console.error('stdout:\n' + (result.stdout || ''));
      console.error('stderr:\n' + (result.stderr || ''));
    }
    expect(result.status).toBe(0);
  });
});

