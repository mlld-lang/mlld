import { beforeEach, describe, expect, it } from 'vitest';
import { interpret } from './index';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';

describe('Executable Reference Preservation', () => {
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

  it('keeps bare executable refs intact outside pipeline contexts', async () => {
    const source = [
      '/exe @double(x) = js { return x * 2; }',
      '/var @arr = [@double]',
      '/var @obj = { fn: @double }',
      '/var @pipeline = 5 | @double',
      '/show @double',
      '/show @arr[0]',
      '/show @obj.fn',
      '/show @typeof(@double)',
      '/show @typeof(@arr[0])',
      '/show @typeof(@obj.fn)',
      '/show `direct: @double`',
      '/show `field: @obj.fn`',
      '/show @pipeline'
    ].join('\n');

    const output = await run(source);
    expect(output.split('\n').filter(Boolean)).toEqual([
      '[executable: double]',
      '[executable: double]',
      '[executable: double]',
      'executable',
      'executable',
      'executable',
      'direct: [executable: double]',
      'field: [executable: double]',
      '10'
    ]);
  });

  it('preserves executable references returned from block helpers', async () => {
    const source = [
      '/exe @search(query, sender) = js { return []; }',
      '/exe @getExe(entry) = [',
      '  let @e = @entry',
      '  => @e.mlld',
      ']',
      '/var tools @tools = {',
      '  search: { mlld: @search, labels: ["resolve:r"] }',
      '}',
      '/var @result = @getExe(@tools.search)',
      '/show @typeof(@result)',
      '/show @result.mx.params.length',
      '/show @getExe(@tools.search).mx.params.length',
      '/show @getExe(@tools.search)'
    ].join('\n');

    const output = await run(source);
    expect(output.split('\n').filter(Boolean)).toEqual([
      'executable',
      '2',
      '2',
      '[executable: search]'
    ]);
  });

  it('preserves executable references returned from when branches inside block helpers', async () => {
    const source = [
      '/exe @search(query, sender) = js { return []; }',
      '/exe @toolExe(toolEntry) = [',
      '  let @entry = @toolEntry',
      '  => when [',
      '    @typeof(@entry.mlld) == "executable" => @entry.mlld',
      '    * => null',
      '  ]',
      ']',
      '/var tools @tools = {',
      '  search: { mlld: @search, labels: ["resolve:r"] }',
      '}',
      '/show @toolExe(@tools.search).mx.params.length'
    ].join('\n');

    const output = await run(source);
    expect(output.split('\n').filter(Boolean)).toEqual(['2']);
  });

  it('tracks resolved executables instead of local alias names for nested dispatch', async () => {
    const source = [
      '/exe @leaf(x) = `leaf:@x`',
      '/var tools @tools = {',
      '  leaf: { mlld: @leaf, labels: ["tool:r"] }',
      '}',
      '/exe @agent(args) = [',
      '  let @entry = @tools.leaf',
      '  let @tool = @entry.mlld',
      '  => @tool(@args)',
      ']',
      '/var tools @agents = {',
      '  agent: { mlld: @agent, labels: ["agent:r"] }',
      '}',
      '/exe recursive @dispatch(entry, args) = [',
      '  let @tool = @entry.mlld',
      '  if @typeof(@tool) == "executable" [',
      '    => @tool(@args)',
      '  ]',
      '  => null',
      ']',
      '/show @dispatch(@agents.agent, "x")'
    ].join('\n');

    const output = await run(source);
    expect(output.split('\n').filter(Boolean)).toEqual(['leaf:x']);
  });
});
