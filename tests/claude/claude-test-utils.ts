import path from 'node:path';
import { spawnSync } from 'node:child_process';

export const shouldRunClaude = process.env.MLLD_RUN_CLAUDE_TESTS === '1';

export function resolveClaudeOnPath(): boolean {
  if (process.env.CLAUDE_BIN) {
    const dir = path.dirname(process.env.CLAUDE_BIN);
    if (!process.env.PATH?.split(path.delimiter).includes(dir)) {
      process.env.PATH = `${dir}${path.delimiter}${process.env.PATH || ''}`;
    }
  }

  const shell = process.env.SHELL || '/bin/sh';
  const probe = spawnSync(shell, ['-lc', 'command -v claude'], {
    encoding: 'utf8'
  });
  return probe.status === 0 && !!probe.stdout?.trim();
}

export const claudeAvailable = shouldRunClaude && resolveClaudeOnPath();
