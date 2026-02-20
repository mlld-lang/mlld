import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import os from 'os';
import { interpret } from '@interpreter/index';
import { NodeFileSystem } from '@services/fs/NodeFileSystem';
import { PathService } from '@services/fs/PathService';

describe('imported executable parameter shadowing', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) {
        await fs.rm(dir, { recursive: true, force: true });
      }
    }
  });

  it('allows imported executable parameters to shadow caller variable names', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mlld-import-param-shadowing-'));
    tempDirs.push(root);

    const helperPath = path.join(root, 'helper.mld');
    const mainPath = path.join(root, 'main.mld');

    await fs.writeFile(
      helperPath,
      [
        '/exe @saveRunState(runDir, run) = [',
        '  let @next = { id: @run.id, runDir: @runDir }',
        '  => @next',
        ']',
        '/export { @saveRunState }'
      ].join('\n'),
      'utf8'
    );

    await fs.writeFile(
      mainPath,
      [
        `/import { @saveRunState } from "${helperPath}"`,
        '/var @run = { id: "caller-run" }',
        '/if true [',
        '  let @newState = @saveRunState("/tmp/runs", { id: "param-run" })',
        '  show `new:@newState.id caller:@run.id`',
        ']'
      ].join('\n'),
      'utf8'
    );

    const output = await interpret(await fs.readFile(mainPath, 'utf8'), {
      filePath: mainPath,
      fileSystem: new NodeFileSystem(),
      pathService: new PathService(),
      approveAllImports: true,
      useMarkdownFormatter: false,
      normalizeBlankLines: true
    });

    expect((output as string).trim()).toBe('new:param-run caller:caller-run');
  });

  it('allows imported executable internal let bindings to shadow caller variable names', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mlld-import-let-shadowing-'));
    tempDirs.push(root);

    const helperPath = path.join(root, 'helper-let.mld');
    const mainPath = path.join(root, 'main-let.mld');

    await fs.writeFile(
      helperPath,
      [
        '/exe @buildContext() = [',
        '  let @descCountNum = 7',
        '  => `inner:@descCountNum`',
        ']',
        '/export { @buildContext }'
      ].join('\n'),
      'utf8'
    );

    await fs.writeFile(
      mainPath,
      [
        `/import { @buildContext } from "${helperPath}"`,
        '/var @descCountNum = 42',
        '/show `outer:@descCountNum`',
        '/show @buildContext()'
      ].join('\n'),
      'utf8'
    );

    const output = await interpret(await fs.readFile(mainPath, 'utf8'), {
      filePath: mainPath,
      fileSystem: new NodeFileSystem(),
      pathService: new PathService(),
      approveAllImports: true,
      useMarkdownFormatter: false,
      normalizeBlankLines: true
    });

    expect((output as string).trim()).toBe('outer:42\ninner:7');
  });

  it('unwraps nested structured arrays when passed to imported js executables', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mlld-import-array-unwrap-'));
    tempDirs.push(root);

    const helperPath = path.join(root, 'flatten-lib.mld');
    const mainPath = path.join(root, 'main-flatten.mld');

    await fs.writeFile(
      helperPath,
      [
        '/exe @flatten(arrays) = js { return arrays.filter(Boolean).flat() }',
        '/exe @tag(findings, phase, source) = js {',
        '  return (findings || []).map((f, i) => ({',
        '    ...f,',
        '    id: f.id || (phase + "-" + source + "-" + i),',
        '    phase: phase,',
        '    source: source',
        '  }));',
        '}',
        '/export { @flatten, @tag }'
      ].join('\n'),
      'utf8'
    );

    await fs.writeFile(
      mainPath,
      [
        `/import { @flatten, @tag } from "${helperPath}"`,
        '/var @items = ["a", "b"]',
        '/var @phase1 = for @item in @items [',
        '  => @tag([{sev: "high"}, {sev: "low"}], "p1", @item)',
        ']',
        '/var @p1flat = @flatten(@phase1)',
        '/var @phase2 = for @item in @items [',
        '  => @tag([{sev: "med"}], "p2", @item)',
        ']',
        '/var @p2flat = @flatten(@phase2)',
        '/var @all = @flatten([@p1flat, @p2flat])',
        '/show `p1:@p1flat.length p2:@p2flat.length all:@all.length`'
      ].join('\n'),
      'utf8'
    );

    const output = await interpret(await fs.readFile(mainPath, 'utf8'), {
      filePath: mainPath,
      fileSystem: new NodeFileSystem(),
      pathService: new PathService(),
      approveAllImports: true,
      useMarkdownFormatter: false,
      normalizeBlankLines: true
    });

    expect((output as string).trim()).toBe('p1:4 p2:2 all:6');
  });
});
