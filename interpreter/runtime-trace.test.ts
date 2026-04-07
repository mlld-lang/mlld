import { describe, expect, it } from 'vitest';
import { interpret } from '@interpreter/index';
import { Environment } from '@interpreter/env/Environment';
import { createCallMcpConfig } from '@interpreter/env/executors/call-mcp-config';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';

function createEnvironment(basePath = '/tmp/mlld-runtime-trace'): Environment {
  return new Environment(new MemoryFileSystem(), new PathService(), basePath);
}

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

  it('supports handle tracing via the handles alias and emits renamed handle lifecycle events', async () => {
    const env = createEnvironment();
    env.setRuntimeTrace('handles');

    const callConfig = await createCallMcpConfig({
      tools: [],
      env
    });
    env.setLlmToolConfig(callConfig);

    try {
      const issued = env.issueHandle('ada@example.com');
      env.emitRuntimeTrace('effects', 'shelf', 'shelf.write', {
        slot: '@state.selected',
        action: 'write',
        success: true
      });
      env.resolveHandle(issued.handle);
      await callConfig.cleanup();

      expect(env.getRuntimeTraceEvents()).toEqual([
        expect.objectContaining({
          category: 'handle',
          event: 'handle.issued',
          data: expect.objectContaining({
            handle: issued.handle,
            sessionId: callConfig.sessionId
          })
        }),
        expect.objectContaining({
          category: 'handle',
          event: 'handle.resolved',
          data: expect.objectContaining({
            handle: issued.handle,
            sessionId: callConfig.sessionId
          })
        }),
        expect.objectContaining({
          category: 'handle',
          event: 'handle.released',
          data: {
            sessionId: callConfig.sessionId,
            handleCount: 1
          }
        })
      ]);
    } finally {
      env.cleanup();
    }
  });

  it('includes handle events in verbose traces', () => {
    const env = createEnvironment();
    env.setRuntimeTrace('verbose');

    env.issueHandle('ada@example.com');

    expect(env.getRuntimeTraceEvents()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: 'handle',
          event: 'handle.issued'
        })
      ])
    );

    env.cleanup();
  });
});
