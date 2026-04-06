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
});
