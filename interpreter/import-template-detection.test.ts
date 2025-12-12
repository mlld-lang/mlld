import { describe, it, expect, beforeEach } from 'vitest';
import { interpret } from './index';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';

describe('Template import detection', () => {
  let fileSystem: MemoryFileSystem;
  let pathService: PathService;

  beforeEach(async () => {
    fileSystem = new MemoryFileSystem();
    pathService = new PathService();

    // New convention: templates are executable and come from files by extension
    await fileSystem.writeFile('/simple.att', 'Hello @name!');
    await fileSystem.writeFile('/simple.mtt', 'Hello {{name}}!');
  });

  it('defines an exe from .att and invokes with params', async () => {
    const source = '/exe @tpl(name) = template "/simple.att"\n/show @tpl("World")';

    const result = await interpret(source, {
      fileSystem,
      pathService,
      basePath: '/'
    } as any);

    const out = typeof result === 'string' ? result : (result as any).output;
    expect(String(out).trim()).toBe('Hello World!');
  });

  it('defines an exe from .mtt and invokes with params', async () => {
    const source = '/exe @tpl(name) = template "/simple.mtt"\n/show @tpl("Alice")';

    const result = await interpret(source, {
      fileSystem,
      pathService,
      basePath: '/'
    } as any);

    const out = typeof result === 'string' ? result : (result as any).output;
    expect(String(out).trim()).toBe('Hello Alice!');
  });

  // No need for closing markers with extension-based detection

  it('does not treat YAML as frontmatter in .mtt templates and interpolates {{var}} inside YAML', async () => {
    await fileSystem.writeFile('/tpl-yaml.mtt', '---\ntitle: {{title}}\nmeta: {{meta}}\n---\nBody: {{body}}');

    const source = '/exe @tpl(title, meta, body) = template "/tpl-yaml.mtt"\n/show @tpl("Doc", "m1", "Hello")';

    const result = await interpret(source, {
      fileSystem,
      pathService,
      basePath: '/'
    } as any);

    const out = typeof result === 'string' ? result : (result as any).output;
    expect(String(out).trim()).toBe('---\ntitle: Doc\nmeta: m1\n---\n\nBody: Hello');
  });
});
