import { describe, expect, it } from 'vitest';
import { interpret } from '@interpreter/index';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';

describe('runtime trace', () => {
  it('collects runtime trace events end-to-end when tracing is enabled', async () => {
    const fileSystem = new MemoryFileSystem();
    const pathService = new PathService();
    const source = `
/record @contact = {
  key: id,
  facts: [id: string, email: string, name: string]
}
/shelf @pipeline = {
  selected: contact?
}
/exe @emitContact() = {
  id: "c_1",
  email: "ada@example.com",
  name: "Ada"
} => contact
/show @shelf.write(@pipeline.selected, @emitContact())
    `.trim();

    const result = await interpret(source, {
      fileSystem,
      pathService,
      basePath: '/',
      mode: 'structured',
      trace: 'effects'
    }) as any;

    expect(result.traceEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: 'shelf',
          event: 'shelf.write',
          level: 'effects',
          scope: expect.objectContaining({
            exe: '@shelf.write'
          })
        })
      ])
    );
  });
});
