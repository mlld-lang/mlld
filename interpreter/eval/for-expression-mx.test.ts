import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NodeFileSystem } from '@services/fs/NodeFileSystem';
import { PathService } from '@services/fs/PathService';
import { Environment } from '@interpreter/env/Environment';
import { parse } from '@grammar/parser';
import { evaluate } from '@interpreter/core/interpreter';
import { extractVariableValue } from '@interpreter/utils/variable-resolution';
import { isStructuredValue } from '@interpreter/utils/structured-value';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

describe('For expression - load-content metadata', () => {
  let tempDir: string;
  let fsService: NodeFileSystem;
  let pathService: PathService;
  let env: Environment;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mlld-for-mx-'));
    fsService = new NodeFileSystem();
    pathService = new PathService();
    env = new Environment(fsService, pathService, tempDir);
    await fs.mkdir(path.join(tempDir, 'docs'), { recursive: true });
    await fs.writeFile(path.join(tempDir, 'docs', 'a.md'), 'Alpha');
    await fs.writeFile(path.join(tempDir, 'docs', 'b.md'), 'Beta');
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('resolves .mx metadata inside object literals in for expressions', async () => {
    const src = '/var @files = <docs/*.md>\n/var @result = for @f in @files => { file: @f.mx.relative }';
    const { ast } = await parse(src);
    await evaluate(ast, env);

    const resultVar = env.getVariable('result');
    expect(resultVar).toBeDefined();
    const value = await extractVariableValue(resultVar!, env);
    expect(Array.isArray(value)).toBe(true);
    const files = (value as Array<{ file: string }>).map(item => item.file).sort();
    const expected = [
      `./${path.join('docs', 'a.md')}`,
      `./${path.join('docs', 'b.md')}`
    ];
    expect(files).toEqual(expected);
  });

  it('preserves file metadata through exec parameters', async () => {
    const src = '/exe @getFile(f) = @f.mx.relative\n/var @files = <docs/*.md>\n/var @result = for @f in @files => @getFile(@f)';
    const { ast } = await parse(src);
    await evaluate(ast, env);

    const resultVar = env.getVariable('result');
    expect(resultVar).toBeDefined();
    const value = await extractVariableValue(resultVar!, env);
    expect(Array.isArray(value)).toBe(true);
    const files = (value as string[]).slice().sort();
    const expected = [
      `./${path.join('docs', 'a.md')}`,
      `./${path.join('docs', 'b.md')}`
    ];
    expect(files).toEqual(expected);
  });

  it('preserves file metadata when mapping load-content results', async () => {
    const src = '/var @files = <docs/*.md>\n/var @mapped = for @f in @files => @f';
    const { ast } = await parse(src);
    await evaluate(ast, env);

    const mappedVar = env.getVariable('mapped');
    expect(mappedVar).toBeDefined();
    const value = await extractVariableValue(mappedVar!, env);
    expect(Array.isArray(value)).toBe(true);
    const items = value as unknown[];
    expect(items.length).toBe(2);
    expect(items.every(item => isStructuredValue(item))).toBe(true);
    const filenames = items
      .map(item => (item as any).mx?.filename)
      .filter(Boolean)
      .sort();
    expect(filenames).toEqual(['a.md', 'b.md']);
  });

  it('preserves file metadata when filtering load-content results', async () => {
    const src = '/var @files = <docs/*.md>\n/var @filtered = for @f in @files when @f.mx.filename == \"a.md\" => @f';
    const { ast } = await parse(src);
    await evaluate(ast, env);

    const filteredVar = env.getVariable('filtered');
    expect(filteredVar).toBeDefined();
    const value = await extractVariableValue(filteredVar!, env);
    expect(Array.isArray(value)).toBe(true);
    const items = value as unknown[];
    expect(items.length).toBe(1);
    const item = items[0];
    expect(isStructuredValue(item)).toBe(true);
    expect((item as any).mx?.filename).toBe('a.md');
  });
});
