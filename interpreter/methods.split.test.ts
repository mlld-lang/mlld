import { describe, it, expect, beforeEach } from 'vitest';
import { interpret } from './index';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';

describe('String .split() + indexing + pipelines', () => {
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

  it('/show @var.split("_")[1] → bar', async () => {
    const src = `/var @foobar = "foo_bar"\n/show @foobar.split("_")[1]`;
    const out = await run(src);
    expect(out).toBe('bar');
  });

  it('/var @parts = @var.split("_"); /show @parts[1] → bar', async () => {
    const src = `/var @foobar = "foo_bar"\n/var @parts = @foobar.split("_")\n/show @parts[1]`;
    const out = await run(src);
    expect(out).toBe('bar');
  });

  it('pipeline after post-index: @...split("_")[1] | @wrap → X:bar', async () => {
    const src = `/var @foobar = "foo_bar"\n\n/exe @wrap(s) = ::\nX:@s\n::\n\n/show @foobar.split("_")[1] | @wrap`;
    const out = await run(src);
    expect(out).toBe('X:bar');
  });

  it('method call inside :: template: @str.split("_")[1] in /exe template', async () => {
    const src = `/var @str = "foo_bar"\n\n/exe @process(str) = ::\n@str.split("_")[1]\n::\n\n/show @process("foo_bar")`;
    const out = await run(src);
    expect(out).toBe('bar');
  });

  it('method call on exec result in simple /exe definition', async () => {
    const src = `/exe @getStr() = "hello world"\n/exe @checkHello() = @getStr().includes("hello")\n/var @result = @checkHello()\n/show @result`;
    const out = await run(src);
    expect(out).toBe('true');
  });
});
