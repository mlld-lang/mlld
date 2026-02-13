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

  it('warns when a bare when action inside an exe block implies an early return', async () => {
    const modulePath = await writeModule('when-exe-implicit-return.mld', `/exe @guard(x) = [
  when !@x => "missing"
  => "ok"
]
`);

    const result = await analyze(modulePath, { checkVariables: true });

    expect(result.valid).toBe(true);
    const whenWarnings = (result.antiPatterns ?? []).filter(entry => entry.code === 'when-exe-implicit-return');
    expect(whenWarnings).toHaveLength(1);
    expect(whenWarnings[0]?.message).toContain('returns from the exe');
  });

  it('does not warn for explicit block-form when returns in exe blocks', async () => {
    const modulePath = await writeModule('when-exe-explicit-return.mld', `/exe @guard(x) = [
  when !@x => [
    => "missing"
  ]
  => "ok"
]
`);

    const result = await analyze(modulePath, { checkVariables: true });

    expect(result.valid).toBe(true);
    const whenWarnings = (result.antiPatterns ?? []).filter(entry => entry.code === 'when-exe-implicit-return');
    expect(whenWarnings).toHaveLength(0);
  });

  it('does not warn for directive actions in when branches inside exe blocks', async () => {
    const modulePath = await writeModule('when-exe-directive-action.mld', `/exe @guard(x) = [
  when !@x => show "missing"
  => "ok"
]
`);

    const result = await analyze(modulePath, { checkVariables: true });

    expect(result.valid).toBe(true);
    const whenWarnings = (result.antiPatterns ?? []).filter(entry => entry.code === 'when-exe-implicit-return');
    expect(whenWarnings).toHaveLength(0);
  });

  it('does not flag @root as undefined', async () => {
    const modulePath = await writeModule('root-builtin.mld', `var @dir = @root
show @dir
`);

    const result = await analyze(modulePath, { checkVariables: true });

    expect(result.valid).toBe(true);
    const undefs = (result.undefinedVariables ?? []).map(w => w.variable);
    expect(undefs).not.toContain('root');
  });

  it('does not flag guard names as undefined', async () => {
    const modulePath = await writeModule('guard-name-decl.mld', `guard @blockDestructive before op:run = when [* => allow]
show @blockDestructive
`);

    const result = await analyze(modulePath, { checkVariables: true });

    expect(result.valid).toBe(true);
    const undefs = (result.undefinedVariables ?? []).map(w => w.variable);
    expect(undefs).not.toContain('blockDestructive');
  });

  it('does not flag for-loop key variables as undefined', async () => {
    const modulePath = await writeModule('for-key-decl.mld', `var @items = { a: 1, b: 2 }
for @k, @v in @items => show @k
`);

    const result = await analyze(modulePath, { checkVariables: true });

    expect(result.valid).toBe(true);
    const undefs = (result.undefinedVariables ?? []).map(w => w.variable);
    expect(undefs).not.toContain('k');
    expect(undefs).not.toContain('v');
  });
});
