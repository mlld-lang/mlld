import { describe, expect, it } from 'vitest';
import { parse } from '@grammar/parser';
import { evaluate } from '@interpreter/core/interpreter';
import { interpret } from '@interpreter/index';
import { Environment } from '@interpreter/env/Environment';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';

async function createEnvironment(source: string, filePath = '/main.mld'): Promise<Environment> {
  const fs = new MemoryFileSystem();
  await fs.writeFile(filePath, source);
  const env = new Environment(fs, new PathService(), '/');
  env.setCurrentFilePath(filePath);
  const { ast } = await parse(source, { mode: 'markdown' });
  await evaluate(ast, env);
  return env;
}

describe('runtime trace', () => {
  it('supports per-invocation trace overrides via with { trace }', async () => {
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
/exe @writeSelected() = @shelf.write(@pipeline.selected, @emitContact())
/show @writeSelected() with { trace: "effects" }
    `.trim();

    const result = await interpret(source, {
      fileSystem,
      pathService,
      basePath: '/',
      mode: 'structured'
    }) as any;

    expect(result.traceEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: 'shelf',
          event: 'shelf.write',
          level: 'effects',
          data: expect.objectContaining({ slot: '@pipeline.selected' })
        })
      ])
    );
  });

  it('emits shelf.remove events with removal details', async () => {
    const fileSystem = new MemoryFileSystem();
    const pathService = new PathService();
    const source = `
/record @contact = {
  key: id,
  facts: [id: string, email: string, name: string]
}
/shelf @pipeline = {
  recipients: contact[]
}
/exe @emitContact(id, name) = {
  id: @id,
  email: \`@id@example.com\`,
  name: @name
} => contact
@shelve(@pipeline.recipients, @emitContact("c_1", "Ada"))
@shelve(@pipeline.recipients, @emitContact("c_2", "Bob"))
@shelf.remove(@pipeline.recipients, "c_1")
/show "done"
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
          event: 'shelf.remove',
          data: expect.objectContaining({
            slot: '@pipeline.recipients',
            removedCount: 1
          })
        })
      ])
    );
  });

  it('emits shelf.stale_read diagnostics when a same-context read diverges from the last write', async () => {
    const env = await createEnvironment(`
/record @contact = {
  key: id,
  facts: [id: string, email: string, name: string]
}
/shelf @pipeline = {
  selected: contact?
}
    `);

    env.setRuntimeTrace('effects');
    env.writeShelfSlot('pipeline', 'selected', { id: 'c_1', email: 'ada@example.com', name: 'Ada' });
    (env as any).shelfState.get('pipeline').set('selected', {
      id: 'c_2',
      email: 'stale@example.com',
      name: 'Stale'
    });
    env.readShelfSlot('pipeline', 'selected');

    expect(env.getRuntimeTraceEvents()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: 'shelf',
          event: 'shelf.stale_read',
          data: expect.objectContaining({
            slot: '@pipeline.selected'
          })
        })
      ])
    );
  });

  it('records llm call durations in verbose traces', async () => {
    const fileSystem = new MemoryFileSystem();
    const pathService = new PathService();
    const source = `
/exe llm @agent(prompt, config) = js {
  return {
    ok: true,
    prompt,
    model: config?.model ?? null
  };
}
/show @agent("hello", { model: "fake-model" })
    `.trim();

    const result = await interpret(source, {
      fileSystem,
      pathService,
      basePath: '/',
      mode: 'structured',
      trace: 'verbose'
    }) as any;

    const llmCall = result.traceEvents.find((event: any) => event.event === 'llm.call');
    expect(llmCall).toBeDefined();
    expect(llmCall.data.model).toBe('fake-model');
    expect(llmCall.data.ok).toBe(true);
    expect(typeof llmCall.data.durationMs).toBe('number');
    expect(llmCall.data.durationMs).toBeGreaterThanOrEqual(0);
  });
});
