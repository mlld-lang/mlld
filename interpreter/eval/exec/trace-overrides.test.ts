import { describe, expect, it } from 'vitest';
import { interpret } from '@interpreter/index';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';

function traceFixtureSource(body: string): string {
  return `
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
${body}
  `.trim();
}

async function interpretStructured(source: string, trace: 'off' | 'effects' | 'handle' | 'handles' | 'verbose' = 'off') {
  return interpret(source, {
    fileSystem: new MemoryFileSystem(),
    pathService: new PathService(),
    basePath: '/',
    mode: 'structured',
    trace
  }) as Promise<any>;
}

describe('exec trace overrides', () => {
  it('suppresses inner trace events with with { trace: "off" } inside a traced run', async () => {
    const result = await interpretStructured(traceFixtureSource(`
/exe @writeSelected() = @shelf.write(@pipeline.selected, @emitContact())
/show @writeSelected() with { trace: "off" }
    `), 'effects');

    expect(result.traceEvents).toEqual([]);
  });

  it('allows nested invocations to raise trace level above an outer with { trace: "off" }', async () => {
    const result = await interpretStructured(traceFixtureSource(`
/exe @innerWrite() = @shelf.write(@pipeline.selected, @emitContact())
/exe @outerWrite() = @innerWrite() with { trace: "effects" }
/show @outerWrite() with { trace: "off" }
    `), 'verbose');

    expect(result.traceEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: 'shelf',
          event: 'shelf.write',
          level: 'effects'
        })
      ])
    );
  });

  it('rejects invalid with { trace } values', async () => {
    await expect(
      interpretStructured(traceFixtureSource(`
/exe @writeSelected() = @shelf.write(@pipeline.selected, @emitContact())
/show @writeSelected() with { trace: "loud" }
      `), 'effects')
    ).rejects.toThrow('trace must be one of: off, effects, handle, handles, verbose.');
  });
});
