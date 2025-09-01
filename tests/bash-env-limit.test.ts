import { describe, it, expect } from 'vitest';
import fs from 'fs';
import { adaptVariablesForBash } from '@interpreter/env/bash-variable-adapter';
import { BashExecutor } from '@interpreter/env/executors/BashExecutor';
import { ErrorUtils } from '@interpreter/env/ErrorUtils';

const variableProvider = {
  getVariables: () => new Map(),
};

describe('Bash oversized env var handling', () => {
  it('writes large values to temporary files', async () => {
    const large = 'a'.repeat(150000);
    const env = { getVariable: () => null } as any;
    const { envVars, tempFiles } = await adaptVariablesForBash({ big: large }, env);
    const tmpPath = envVars.big;
    expect(fs.readFileSync(tmpPath, 'utf8')).toBe(large);
    tempFiles.forEach(f => fs.unlinkSync(f));
  });

  it('allows executing commands with oversized params', async () => {
    const large = 'a'.repeat(150000);
    const executor = new BashExecutor(new ErrorUtils(), process.cwd(), variableProvider);
    const output = await executor.execute('echo "ok"', undefined, undefined, { big: large });
    expect(output.trim()).toBe('ok');
  });
});
