import { describe, it, expect, beforeEach } from 'vitest';
import { interpret } from './index';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';

describe('optional field access syntax', () => {
  let fs: MemoryFileSystem;
  let paths: PathService;

  beforeEach(() => {
    fs = new MemoryFileSystem();
    paths = new PathService();
  });

  async function run(src: string): Promise<string> {
    const result = await interpret(src, {
      fileSystem: fs,
      pathService: paths,
      useMarkdownFormatter: false,
      normalizeBlankLines: true
    } as any);
    return (result as string).trim();
  }

  it('accepts optional field access on present fields', async () => {
    const src = `/var @obj = { a: 1 }\n/show @obj.a?`;
    const out = await run(src);
    expect(out).toBe('1');
  });

  it('returns empty output for missing optional fields', async () => {
    const src = `/var @obj = { a: 1 }\n/show @obj.missing?`;
    const out = await run(src);
    expect(out).toBe('');
  });

  it('shows an extension hint when template path interpolation parses as field access', async () => {
    const src = [
      '/var @runDir = "tmp"',
      '/var @filename = "report"',
      '/show `@runDir/reviews/@filename.json`'
    ].join('\n');

    await expect(run(src)).rejects.toThrow('\'@filename.json\' looks like field access');
    await expect(run(src)).rejects.toThrow('escape the dot: \'@filename\\.json\'');
  });

  it('supports escaped dots for interpolated filename extensions', async () => {
    const src = [
      '/var @runDir = "tmp"',
      '/var @filename = "report"',
      '/show `@runDir/reviews/@filename\\.json`'
    ].join('\n');

    const out = await run(src);
    expect(out).toBe('tmp/reviews/report.json');
  });
});
