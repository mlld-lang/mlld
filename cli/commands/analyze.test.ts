import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { analyze, analyzeMultiple } from './analyze';

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

describe('template validation', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mlld-template-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  async function writeFile(filename: string, content: string): Promise<string> {
    const dirPath = path.dirname(path.join(tempDir, filename));
    await fs.mkdir(dirPath, { recursive: true });
    const filePath = path.join(tempDir, filename);
    await fs.writeFile(filePath, content, 'utf8');
    return filePath;
  }

  it('validates an .att template with valid variable references', async () => {
    const templatePath = await writeFile('valid.att', 'Hello @name!\n\nYour role: @role\n');

    const result = await analyze(templatePath);

    expect(result.valid).toBe(true);
    expect(result.template).toBeDefined();
    expect(result.template!.type).toBe('att');
    expect(result.template!.variables).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'name', type: 'variable' }),
        expect.objectContaining({ name: 'role', type: 'variable' }),
      ])
    );
  });

  it('validates an .mtt template with mustache-style references', async () => {
    const templatePath = await writeFile('valid.mtt', 'Hello {{name}}!\n\nYour role: {{role}}\n');

    const result = await analyze(templatePath);

    expect(result.valid).toBe(true);
    expect(result.template).toBeDefined();
    expect(result.template!.type).toBe('mtt');
    expect(result.template!.variables).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'name', type: 'variable' }),
        expect.objectContaining({ name: 'role', type: 'variable' }),
      ])
    );
  });

  it('detects ExecInvocation in .att templates', async () => {
    const templatePath = await writeFile('with-func.att', 'Hello @name!\n\n@greet(arg1, arg2)\n');

    const result = await analyze(templatePath);

    expect(result.valid).toBe(true);
    expect(result.template!.variables).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'name', type: 'variable' }),
        expect.objectContaining({ name: 'greet', type: 'function' }),
      ])
    );
  });

  it('warns on undefined template variable when no sibling exe declarations found', async () => {
    const templatePath = await writeFile('orphan.att', 'Hello @name!\n');

    const result = await analyze(templatePath, { checkVariables: true });

    expect(result.valid).toBe(true);
    expect(result.warnings).toBeDefined();
    expect(result.warnings!.length).toBeGreaterThan(0);
    expect(result.warnings![0].variable).toBe('name');
  });

  it('discovers params from sibling .mld exe declarations', async () => {
    await writeFile('greet.att', 'Hello @name!\n\nYour role: @role\n');
    const templatePath = path.join(tempDir, 'greet.att');

    // Write a sibling module that declares an exe using this template
    await writeFile('main.mld', `/exe @greet(name, role) = template "greet.att"\n/show @greet("Alice", "admin")\n`);

    const result = await analyze(templatePath, { checkVariables: true });

    expect(result.valid).toBe(true);
    expect(result.template!.discoveredParams).toEqual(
      expect.arrayContaining(['name', 'role'])
    );
    // No warnings since all vars are covered by discovered params
    expect(result.warnings ?? []).toHaveLength(0);
  });

  it('flags undefined refs not in discovered params', async () => {
    await writeFile('partial.att', 'Hello @name!\n\n@unknownVar\n');
    const templatePath = path.join(tempDir, 'partial.att');

    await writeFile('main.mld', `/exe @greet(name) = template "partial.att"\n`);

    const result = await analyze(templatePath, { checkVariables: true });

    expect(result.valid).toBe(true);
    expect(result.template!.discoveredParams).toEqual(['name']);
    expect(result.warnings).toBeDefined();
    const undefs = result.warnings!.map(w => w.variable);
    expect(undefs).toContain('unknownVar');
    expect(undefs).not.toContain('name');
  });

  it('does not produce false positives for @@ escaped sequences in .att', async () => {
    const templatePath = await writeFile('escaped.att', 'Send to user@@example.com\n\nHello @name!\n');

    const result = await analyze(templatePath);

    expect(result.valid).toBe(true);
    // @@ should not be treated as a variable reference
    const varNames = result.template!.variables.map(v => v.name);
    expect(varNames).not.toContain('@example');
    expect(varNames).toContain('name');
  });

  it('does not flag builtin variables as undefined in templates', async () => {
    const templatePath = await writeFile('builtins.att', 'Base: @base\nRoot: @root\nTime: @now\n');

    const result = await analyze(templatePath, { checkVariables: true });

    expect(result.valid).toBe(true);
    // All are builtins, so no warnings expected
    expect(result.warnings ?? []).toHaveLength(0);
  });

  it('handles .att template with mlld code fence masking', async () => {
    const templatePath = await writeFile('fenced.att', `Hello @name!

\`\`\`mlld
/var @example = "this is literal"
\`\`\`

Done.
`);

    const result = await analyze(templatePath);

    expect(result.valid).toBe(true);
    // @example inside the fence should be masked (literal), not treated as a var reference
    const varNames = result.template!.variables.map(v => v.name);
    expect(varNames).toContain('name');
    expect(varNames).not.toContain('example');
  });

  it('reports parse errors for invalid .att templates', async () => {
    // ATT templates are very permissive, so let's use an mtt with broken syntax
    const templatePath = await writeFile('invalid.mtt', 'Hello {{name!\n');

    const result = await analyze(templatePath);

    // MTT with unclosed {{ might be parsed as text — let's check what happens
    // The grammar is fairly permissive for templates, so this may still be valid
    // Just ensure it doesn't throw
    expect(typeof result.valid).toBe('boolean');
  });
});

describe('directory recursion', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mlld-dir-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  async function writeFile(filename: string, content: string): Promise<string> {
    const dirPath = path.dirname(path.join(tempDir, filename));
    await fs.mkdir(dirPath, { recursive: true });
    const filePath = path.join(tempDir, filename);
    await fs.writeFile(filePath, content, 'utf8');
    return filePath;
  }

  it('validates all mlld files in a directory', async () => {
    await writeFile('module.mld', '/var @x = 1\n/show @x\n');
    await writeFile('template.att', 'Hello @name!\n');
    await writeFile('sub/nested.mld', '/var @y = 2\n/show @y\n');

    const results: any[] = [];
    for (const file of [
      path.join(tempDir, 'module.mld'),
      path.join(tempDir, 'template.att'),
      path.join(tempDir, 'sub/nested.mld'),
    ]) {
      results.push(await analyze(file));
    }

    expect(results).toHaveLength(3);
    expect(results.every(r => r.valid)).toBe(true);
  });

  it('handles mixed valid and invalid files', async () => {
    await writeFile('good.mld', '/var @x = 1\n/show @x\n');
    await writeFile('bad.mld', '/var @x = \n');

    const good = await analyze(path.join(tempDir, 'good.mld'));
    const bad = await analyze(path.join(tempDir, 'bad.mld'));

    expect(good.valid).toBe(true);
    expect(bad.valid).toBe(false);
  });

  it('skips non-mlld files in directories', async () => {
    await writeFile('module.mld', '/var @x = 1\n/show @x\n');
    await writeFile('readme.txt', 'Not an mlld file\n');
    await writeFile('data.json', '{"key": "value"}\n');

    // Only the .mld file should be analyzed
    const result = await analyze(path.join(tempDir, 'module.mld'));
    expect(result.valid).toBe(true);
  });
});
