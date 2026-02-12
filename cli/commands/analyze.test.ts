import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { analyze } from './analyze';

describe('analyze/validate warnings', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mlld-analyze-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  async function writeModule(filename: string, content: string): Promise<string> {
    const filePath = path.join(tempDir, filename);
    await fs.writeFile(filePath, content, 'utf8');
    return filePath;
  }

  it('detects built-in name conflicts for let assignments', async () => {
    const modulePath = await writeModule('builtin-conflicts.mld', `/exe @test() = [
  let @exists = "yes"
  let @upper = "HELLO"
  => @exists
]
/var @out = @test()
`);

    const result = await analyze(modulePath, { checkVariables: true });

    expect(result.valid).toBe(true);
    const builtinConflicts = (result.redefinitions ?? [])
      .filter(entry => entry.reason === 'builtin-conflict')
      .map(entry => entry.variable)
      .sort();

    expect(builtinConflicts).toEqual(['exists', 'upper']);
  });

  it('warns for local mutable-state anti-patterns', async () => {
    const modulePath = await writeModule('mutable-state-pattern.mld', `/exe @loop() = [
  let @state = { stop: false }
  when @state.stop => [
    => "done"
  ]
  => @state
]
`);

    const result = await analyze(modulePath, { checkVariables: true });

    expect(result.valid).toBe(true);
    expect(result.antiPatterns).toHaveLength(1);
    expect(result.antiPatterns?.[0]?.code).toBe('mutable-state');
    expect(result.antiPatterns?.[0]?.message).toContain('@state');
  });
});
