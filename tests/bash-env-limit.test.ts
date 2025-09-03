import { describe, it, expect } from 'vitest';
import fs from 'fs';
import { adaptVariablesForBash } from '@interpreter/env/bash-variable-adapter';
import { BashExecutor } from '@interpreter/env/executors/BashExecutor';
import { ErrorUtils } from '@interpreter/env/ErrorUtils';

const variableProvider = {
  getVariables: () => new Map(),
};

describe('Bash oversized env var handling', () => {
  it('returns raw values; heredoc injection happens in BashExecutor', async () => {
    const large = 'a'.repeat(150000);
    const env = { getVariable: () => null } as any;
    const { envVars, tempFiles } = await adaptVariablesForBash({ big: large }, env);
    // Adapter returns raw strings; no temp files used here
    expect(envVars.big).toBe(large);
    expect(Array.isArray(tempFiles)).toBe(true);
    expect(tempFiles.length).toBe(0);
  });

  it('allows executing commands with oversized params', async () => {
    const large = 'a'.repeat(150000);
    const executor = new BashExecutor(new ErrorUtils(), process.cwd(), variableProvider);
    const output = await executor.execute('echo "ok"', undefined, undefined, { big: large });
    expect(output.trim()).toBe('ok');
  });

  it('handles very large heredoc values (>1MB) correctly', async () => {
    // Ensure heredoc path is enabled
    process.env.MLLD_BASH_HEREDOC = '1';
    // Create ~1.2MB of data
    const size = 1_200_000;
    const large = 'a'.repeat(size);
    const executor = new BashExecutor(new ErrorUtils(), process.cwd(), variableProvider);
    // Use printf to avoid adding a trailing newline and count bytes precisely
    const out = await executor.execute('printf "%s" "$big" | wc -c', undefined, undefined, { big: large });
    expect(Number(out.trim())).toBe(size);
  });
});
