import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NodeFileSystem } from '@services/fs/NodeFileSystem';
import { PathService } from '@services/fs/PathService';
import { Environment } from '@interpreter/env/Environment';
import { parse } from '@grammar/parser';
import { evaluate } from '@interpreter/core/interpreter';
import { extractVariableValue } from '@interpreter/utils/variable-resolution';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

describe('For expression - when condition logic', () => {
  let tempDir: string;
  let env: Environment;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mlld-for-when-'));
    const fsService = new NodeFileSystem();
    const pathService = new PathService();
    env = new Environment(fsService, pathService, tempDir);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('filters with logical OR in when conditions', async () => {
    const src = [
      '/var @items = ["apple", "banana", "cherry", "date"]',
      '/var @filtered = for @item in @items when @item.startsWith("b") || @item.startsWith("c") => @item'
    ].join('\n');
    const { ast } = await parse(src);
    await evaluate(ast, env);

    const resultVar = env.getVariable('filtered');
    expect(resultVar).toBeDefined();
    const value = await extractVariableValue(resultVar!, env);
    expect(value).toEqual(['banana', 'cherry']);
  });
});
