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

  it('reports built-in transform shadowing for let assignments', async () => {
    const modulePath = await writeModule('builtin-conflicts.mld', `/exe @test() = [
  let @exists = "yes"
  let @upper = "HELLO"
  => @exists
]
/var @out = @test()
`);

    const result = await analyze(modulePath, { checkVariables: true });

    expect(result.valid).toBe(true);
    const builtinShadowing = (result.redefinitions ?? [])
      .filter(entry => entry.reason === 'builtin-conflict')
      .map(entry => entry.variable)
      .sort();

    expect(builtinShadowing).toEqual(['exists', 'upper']);
    expect((result.redefinitions ?? []).filter(entry => entry.reason === 'scope-redefinition')).toHaveLength(0);
  });

  it('warns on deprecated @json transformer aliases', async () => {
    const modulePath = await writeModule('deprecated-json-alias.mld', `/var @payload = '{"count":2}'
/var @parsed = @payload | @json.strict
/show @parsed
`);

    const result = await analyze(modulePath, { checkVariables: true });

    expect(result.valid).toBe(true);
    const deprecations = (result.antiPatterns ?? []).filter(
      entry => entry.code === 'deprecated-json-transform'
    );
    expect(deprecations).toHaveLength(1);
    expect(deprecations[0]?.message).toContain('@json.strict');
    expect(deprecations[0]?.suggestion).toContain('@parse.strict');
  });

  it('does not warn on @json alias usage when user-defined @json shadows the builtin', async () => {
    const modulePath = await writeModule('deprecated-json-shadowed.mld', `/exe @json(input) = @input | @upper
/var @out = "ok" | @json
/show @out
`);

    const result = await analyze(modulePath, { checkVariables: true });

    expect(result.valid).toBe(true);
    const deprecations = (result.antiPatterns ?? []).filter(
      entry => entry.code === 'deprecated-json-transform'
    );
    expect(deprecations).toHaveLength(0);
  });

  it('keeps reserved names as hard conflicts', async () => {
    const modulePath = await writeModule('reserved-conflict.mld', `/exe @test() = [
  let @base = "shadow"
  => @base
]
`);

    const result = await analyze(modulePath, { checkVariables: true });

    expect(result.valid).toBe(true);
    const reservedConflicts = (result.redefinitions ?? [])
      .filter(entry => entry.reason === 'reserved-conflict')
      .map(entry => entry.variable)
      .sort();

    expect(reservedConflicts).toEqual(['base']);
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

  it('warns when exe parameters use generic names that can shadow caller variables', async () => {
    const modulePath = await writeModule('exe-param-shadowing.mld', `/var @result = "queued"
/exe @logItemDone(result) = [
  => @result
]
/show @logItemDone("done")
`);

    const result = await analyze(modulePath, { checkVariables: true });

    expect(result.valid).toBe(true);
    const paramWarnings = (result.antiPatterns ?? []).filter(
      entry => entry.code === 'exe-parameter-shadowing'
    );
    expect(paramWarnings).toHaveLength(1);
    expect(paramWarnings[0]?.message).toContain('Parameter @result');
    expect(paramWarnings[0]?.suggestion).toContain('@status');
  });

  it('supports suppressing exe parameter shadowing warnings in mlld-config.json', async () => {
    await fs.writeFile(
      path.join(tempDir, 'mlld-config.json'),
      JSON.stringify({
        validate: {
          suppressWarnings: ['exe-parameter-shadowing']
        }
      }, null, 2),
      'utf8'
    );

    const modulePath = await writeModule('exe-param-shadowing-suppressed.mld', `/exe @logItemDone(result) = [
  => @result
]
/show @logItemDone("done")
`);

    const result = await analyze(modulePath, { checkVariables: true });

    expect(result.valid).toBe(true);
    const paramWarnings = (result.antiPatterns ?? []).filter(
      entry => entry.code === 'exe-parameter-shadowing'
    );
    expect(paramWarnings).toHaveLength(0);
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

  it('extracts guard timing from guard fields instead of subtype', async () => {
    const modulePath = await writeModule('guard-timing.mld', `guard @beforeGuard before op:run = when [* => allow]
guard @afterGuard after op:run = when [* => allow]
guard @alwaysGuard always op:run = when [* => allow]
`);

    const result = await analyze(modulePath, { checkVariables: false });

    expect(result.valid).toBe(true);
    expect(result.guards).toEqual(expect.arrayContaining([
      { name: 'beforeGuard', timing: 'before' },
      { name: 'afterGuard', timing: 'after' },
      { name: 'alwaysGuard', timing: 'always' }
    ]));
  });

  it('includes guards and needs from directives in analyze output', async () => {
    const modulePath = await writeModule('analyze-json-guards-needs.mld', `/needs { sh }
guard @g before op:run = when [* => allow]
/exe @hello() = \`hi\`
/export { @hello }
`);

    const result = await analyze(modulePath, { checkVariables: false });

    expect(result.valid).toBe(true);
    expect(result.guards).toEqual(expect.arrayContaining([
      { name: 'g', timing: 'before' }
    ]));
    expect(result.needs?.cmd).toBeDefined();
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

  it('warns for undefined variables in executable invocation arguments', async () => {
    const modulePath = await writeModule('exe-invocation-undefined-arg.mld', `/exe @greet(name) = \`Hello @name\`
/var @result = @greet(@typo)
/show @result
`);

    const result = await analyze(modulePath, { checkVariables: true });

    expect(result.valid).toBe(true);
    const undefs = (result.warnings ?? []).map(w => w.variable);
    expect(undefs).toContain('typo');
  });
});
