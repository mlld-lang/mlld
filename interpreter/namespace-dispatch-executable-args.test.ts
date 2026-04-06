import { beforeEach, describe, expect, it } from 'vitest';
import { interpret } from './index';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';

describe('Namespace Dispatch Executable Arguments', () => {
  let fileSystem: MemoryFileSystem;
  let pathService: PathService;

  beforeEach(() => {
    fileSystem = new MemoryFileSystem();
    pathService = new PathService();
  });

  async function run(source: string): Promise<string> {
    const result = await interpret(source, {
      fileSystem,
      pathService,
      useMarkdownFormatter: false,
      normalizeBlankLines: true
    } as any);
    return (typeof result === 'string' ? result : result.output).trim();
  }

  it('preserves inline executable arrays through object-method dispatch', async () => {
    const source = [
      '/exe resolve:r @s1(q) = js { return []; }',
      '/exe execute:w @x1(to) = js { return ""; }',
      '/exe @labelsStayDistinct(tools) = [',
      '  let @labels = for @t in @tools => @t.mx.labels[0]',
      '  => @labels[0] == "resolve:r" && @labels[1] == "execute:w"',
      ']',
      '/var @ns = { run: @labelsStayDistinct }',
      '/var @t = [@s1, @x1]',
      '/show @ns.run([@s1, @x1])',
      '/show @ns.run(@t)'
    ].join('\n');

    const output = await run(source);
    expect(output.split('\n').filter(Boolean)).toEqual(['true', 'true']);
  });

  it('preserves executable arrays nested inside inline object arguments', async () => {
    const source = [
      '/exe resolve:r @s1(q) = js { return []; }',
      '/exe execute:w @x1(to) = js { return ""; }',
      '/exe @count(cfg) = [',
      '  let @filtered = for @t in @cfg.tools when @t.mx.labels.includes("resolve:r") => @t',
      '  => @filtered.length',
      ']',
      '/var @builder = { run: @count }',
      '/var @t = [@s1, @x1]',
      '/var @cfg = { tools: @t }',
      '/show @builder.run({ tools: [@s1, @x1] })',
      '/show @builder.run({ tools: @t })',
      '/show @builder.run(@cfg)'
    ].join('\n');

    const output = await run(source);
    expect(output.split('\n').filter(Boolean)).toEqual(['1', '1', '1']);
  });
});
