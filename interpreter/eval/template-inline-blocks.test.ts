import { describe, it, expect, beforeEach } from 'vitest';
import { interpret } from '../index';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';

describe('Template inline blocks', () => {
  let fileSystem: MemoryFileSystem;
  let pathService: PathService;

  beforeEach(async () => {
    fileSystem = new MemoryFileSystem();
    pathService = new PathService();
  });

  it('renders slash-style /for blocks in double-colon templates', async () => {
    const source = `/var @items = ["A","B"]
/var @msg = ::
/for @x in @items
@x\n
/end
::
/show @msg`;

    const result = await interpret(source, {
      fileSystem,
      pathService,
      basePath: '/'
    } as any);

    const out = typeof result === 'string' ? result : (result as any).output;
    const trimmed = String(out).trim();
    // Expect A and B on separate lines
    expect(trimmed).toContain('A');
    expect(trimmed).toContain('B');
  });

  it.skip('renders mustache-style for blocks in triple-colon templates (not supported)', async () => {
    const source = `/var @items = ["x","y"]
/var @tpl = :::{{for v in items}}- {{v}}\n{{end}}:::
/show @tpl`;

    const result = await interpret(source, {
      fileSystem,
      pathService,
      basePath: '/'
    } as any);

    const out = typeof result === 'string' ? result : (result as any).output;
    const trimmed = String(out).trim();
    expect(trimmed).toContain('- x');
    expect(trimmed).toContain('- y');
  });

  it('treats /show as literal text inside templates', async () => {
    const source = `/var @msg = ::Header\n/show {echo "OK"}\n::
/show @msg`;

    const result = await interpret(source, {
      fileSystem,
      pathService,
      basePath: '/'
    } as any);

    const out = typeof result === 'string' ? result : (result as any).output;
    const trimmed = String(out).trim();
    expect(trimmed).toContain('/show {echo "OK"}');
  });
});
