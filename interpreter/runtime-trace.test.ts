import { describe, expect, it } from 'vitest';
import { parseSync } from '@grammar/parser';
import { interpret } from '@interpreter/index';
import { evaluate } from '@interpreter/core/interpreter';
import { Environment } from '@interpreter/env/Environment';
import { createCallMcpConfig } from '@interpreter/env/executors/call-mcp-config';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { asText, isStructuredValue, wrapStructured } from '@interpreter/utils/structured-value';
import { buildSessionWriteTraceEnvelope } from '@interpreter/session/trace-envelope';
import { estimateRuntimeTraceValueBytes } from '@interpreter/tracing/RuntimeTraceValue';
import { makeSecurityDescriptor } from '@core/types/security';
import { fileURLToPath } from 'url';

const callToolFromConfigPath = fileURLToPath(
  new URL('../tests/support/mcp/call-tool-from-config.cjs', import.meta.url)
);

function createEnvironment(basePath = '/tmp/mlld-runtime-trace'): Environment {
  return new Environment(new MemoryFileSystem(), new PathService(), basePath);
}

describe('runtime trace', () => {
  it('emits memory trace events when traceMemory is enabled without an explicit trace level', async () => {
    const fileSystem = new MemoryFileSystem();
    const pathService = new PathService();

    const result = await interpret('/show "ok"', {
      fileSystem,
      pathService,
      basePath: '/',
      mode: 'structured',
      traceMemory: true
    }) as any;

    expect(result.traceEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: 'memory',
          event: expect.stringMatching(/^memory\.(sample|delta)$/),
          level: 'effects',
          data: expect.objectContaining({
            label: expect.any(String),
            rss: expect.any(Number),
            heapUsed: expect.any(Number),
            heapTotal: expect.any(Number),
            external: expect.any(Number),
            arrayBuffers: expect.any(Number)
          })
        })
      ])
    );
    expect(result.traceEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: 'memory',
          event: 'memory.summary',
          level: 'effects',
          data: expect.objectContaining({
            sampleCount: expect.any(Number),
            peakRss: expect.any(Object),
            peakHeapUsed: expect.any(Object),
            topDeltas: expect.any(Array),
            topLabels: expect.any(Array)
          })
        })
      ])
    );
  });

  it('does not enable non-memory effects when only traceMemory is requested', async () => {
    const fileSystem = new MemoryFileSystem();
    const pathService = new PathService();
    const source = [
      '/var session @planner = {',
      '  count: number?',
      '}',
      '/exe tool:w @track() = [',
      '  @planner.increment("count")',
      '  => "ok"',
      ']',
      '/var @toolList = [@track]',
      `/exe llm @agent(prompt, config) = cmd { node "${callToolFromConfigPath}" "@mx.llm.config" track '{}' }`,
      '/var @result = @agent("hello", { tools: @toolList }) with { session: @planner }'
    ].join('\n');

    const result = await interpret(source, {
      fileSystem,
      pathService,
      basePath: '/',
      mode: 'structured',
      traceMemory: true
    }) as any;

    expect(result.traceEvents.some((event: any) => event.category === 'memory')).toBe(true);
    expect(result.traceEvents.some((event: any) => event.event === 'session.write')).toBe(false);
    expect(result.traceEvents.some((event: any) =>
      event.category === 'memory' &&
      event.data?.label === 'session.write'
    )).toBe(false);
    const memorySummary = result.traceEvents.find((event: any) => event.event === 'memory.summary') as any;
    expect(memorySummary?.data?.sessionWrites).toMatchObject({
      count: expect.any(Number),
      totalValueBytes: expect.any(Number),
      maxValueBytes: expect.any(Number)
    });
    expect(memorySummary.data.sessionWrites.count).toBeGreaterThan(0);
  });

  it('bounds retained runtime trace events when a retain limit is configured', () => {
    const env = createEnvironment();
    env.setRuntimeTrace('effects', { memory: true, retainLimit: 2 });

    env.emitRuntimeMemoryTrace('one', 'sample');
    env.emitRuntimeMemoryTrace('two', 'sample');
    env.emitRuntimeMemoryTrace('three', 'sample');

    expect(env.getRuntimeTraceEvents()).toHaveLength(2);
    expect(env.getRuntimeTraceEvents().map((event: any) => event.data.label)).toEqual(['two', 'three']);
  });

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

  it('includes approximate size metadata on summarized traced values', async () => {
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

    const shelfWrite = result.traceEvents.find((event: any) => event.event === 'shelf.write');
    expect(shelfWrite?.data?.value).toEqual(
      expect.objectContaining({
        kind: 'object',
        bytes: expect.any(Number),
        human: expect.stringMatching(/B$/)
      })
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

  it('emits redacted session write and final trace events at effects level', async () => {
    const fileSystem = new MemoryFileSystem();
    const pathService = new PathService();
    const source = [
      '/var session @planner = {',
      '  note: string?',
      '}',
      '/var secret @secretNote = "sk-live-123"',
      '/exe tool:w @track() = [',
      '  @planner.write("note", @secretNote)',
      '  => "ok"',
      ']',
      '/var @toolList = [@track]',
      `/exe llm @agent(prompt, config) = cmd { node "${callToolFromConfigPath}" "@mx.llm.config" track '{}' }`,
      '/var @result = @agent("hello", { tools: @toolList }) with { session: @planner }'
    ].join('\n');

    const result = await interpret(source, {
      fileSystem,
      pathService,
      basePath: '/',
      mode: 'structured',
      trace: 'effects'
    }) as any;

    const writeEvent = result.traceEvents.find((event: any) => event.event === 'session.write');
    const finalEvent = result.traceEvents.find((event: any) => event.event === 'session.final');

    expect(writeEvent).toBeDefined();
    expect(writeEvent.data.value).toMatch(/^<labels=\[secret\] size=\d+>$/);
    expect(finalEvent).toBeDefined();
    expect(finalEvent.data.finalState.note).toMatch(/^<labels=\[secret\] size=\d+>$/);
    expect(result.sessions[0]?.name).toBe('planner');
    const finalNote = result.sessions[0]?.finalState?.note;
    expect(isStructuredValue(finalNote) ? asText(finalNote) : finalNote).toBe('sk-live-123');
    expect((finalNote as any)?.mx?.labels ?? []).toEqual(expect.arrayContaining(['secret']));
  });

  it('does not stringify redacted session trace payloads just to compute size', () => {
    const env = createEnvironment();
    env.setRuntimeTrace('effects');

    let stringified = false;
    const payload = {
      value: 'x'.repeat(1_000_000),
      toJSON() {
        stringified = true;
        return { value: this.value };
      }
    };
    const wrappedPayload = wrapStructured(payload, 'object', undefined, {
      security: makeSecurityDescriptor({ labels: ['untrusted'] })
    });
    stringified = false;

    const envelope = buildSessionWriteTraceEnvelope({
      env,
      frameId: 'session-1',
      definition: {
        id: 'test#planner',
        canonicalName: 'planner',
        slots: {},
        originPath: '/test.mld'
      },
      path: 'state',
      operation: 'set',
      previousValue: undefined,
      nextValue: wrappedPayload
    });

    expect(envelope.data.value).toMatch(/^<labels=\[untrusted\] size=\d+>$/);
    expect(stringified).toBe(false);
  });

  it('estimates runtime trace value sizes without materializing toJSON payloads', () => {
    let stringified = false;
    const payload = {
      value: 'x'.repeat(1_000_000),
      toJSON() {
        stringified = true;
        return { value: this.value };
      }
    };

    const bytes = estimateRuntimeTraceValueBytes(payload);

    expect(bytes).toBeGreaterThan(1_000_000);
    expect(stringified).toBe(false);
  });

  it('emits session.seed events for seeded slots before the first callback', async () => {
    const fileSystem = new MemoryFileSystem();
    const pathService = new PathService();
    const source = [
      '/var session @planner = {',
      '  query: string,',
      '  count: number',
      '}',
      '/exe llm @agent(prompt, config) = js {',
      '  return "ok";',
      '}',
      '/var @result = @agent("hello", {}) with {',
      '  session: @planner,',
      '  seed: { query: "seeded", count: 4 }',
      '}'
    ].join('\n');

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
          event: 'session.seed',
          data: expect.objectContaining({
            sessionName: 'planner',
            path: 'query',
            value: 'seeded'
          })
        }),
        expect.objectContaining({
          event: 'session.seed',
          data: expect.objectContaining({
            sessionName: 'planner',
            path: 'count',
            value: 4
          })
        })
      ])
    );
  });

  it('keeps session trace payloads bounded at verbose trace level', async () => {
    const fileSystem = new MemoryFileSystem();
    const pathService = new PathService();
    const source = [
      '/var session @planner = {',
      '  note: string?',
      '}',
      '/var secret @secretNote = "sk-live-123"',
      '/exe tool:w @track() = [',
      '  @planner.write("note", @secretNote)',
      '  => "ok"',
      ']',
      '/var @toolList = [@track]',
      `/exe llm @agent(prompt, config) = cmd { node "${callToolFromConfigPath}" "@mx.llm.config" track '{}' }`,
      '/var @result = @agent("hello", { tools: @toolList }) with { session: @planner }'
    ].join('\n');

    const result = await interpret(source, {
      fileSystem,
      pathService,
      basePath: '/',
      mode: 'structured',
      trace: 'verbose'
    }) as any;

    const writeEvent = result.traceEvents.find((event: any) => event.event === 'session.write');
    const finalEvent = result.traceEvents.find((event: any) => event.event === 'session.final');
    const verboseWriteValue = writeEvent?.data?.value;
    const verboseFinalValue = finalEvent?.data?.finalState?.note;

    expect(verboseWriteValue).toMatch(/^<labels=\[secret\] size=\d+>$/);
    expect(verboseFinalValue).toMatch(/^<labels=\[secret\] size=\d+>$/);
    const finalNote = result.sessions[0]?.finalState?.note;
    expect(isStructuredValue(finalNote) ? asText(finalNote) : finalNote).toBe('sk-live-123');
  });

  it('applies defaults.unlabeled redaction to session traces at effects level', async () => {
    const fileSystem = new MemoryFileSystem();
    await fileSystem.writeFile('/note.txt', 'from file');
    const pathService = new PathService();
    const source = [
      '/var @policyConfig = {',
      '  defaults: { unlabeled: "untrusted" }',
      '}',
      '/policy @p = union(@policyConfig)',
      '/var session @planner = {',
      '  note: string?',
      '}',
      '/var @note = </note.txt>',
      '/exe tool:w @track() = [',
      '  @planner.write("note", @note)',
      '  => "ok"',
      ']',
      '/var @toolList = [@track]',
      `/exe llm @agent(prompt, config) = cmd { node "${callToolFromConfigPath}" "@mx.llm.config" track '{}' }`,
      '/var @result = @agent("hello", { tools: @toolList }) with { session: @planner }'
    ].join('\n');

    const result = await interpret(source, {
      fileSystem,
      pathService,
      basePath: '/',
      mode: 'structured',
      trace: 'effects'
    }) as any;

    const writeEvent = result.traceEvents.find((event: any) => event.event === 'session.write');
    const finalEvent = result.traceEvents.find((event: any) => event.event === 'session.final');

    expect(writeEvent?.data?.value).toMatch(/^<labels=\[untrusted\] size=\d+>$/);
    expect(finalEvent?.data?.finalState?.note).toMatch(/^<labels=\[untrusted\] size=\d+>$/);
    const finalNote = result.sessions[0]?.finalState?.note;
    expect(isStructuredValue(finalNote) ? asText(finalNote) : finalNote).toBe('from file');
    expect((finalNote as any)?.mx?.labels ?? []).toEqual(expect.arrayContaining(['untrusted']));
  });

  it('caps oversized session trace values at effects level', async () => {
    const fileSystem = new MemoryFileSystem();
    const pathService = new PathService();
    const largeValue = 'x'.repeat(1500);
    const source = [
      '/var session @planner = {',
      '  log: string?',
      '}',
      '/exe llm @agent(prompt, config) = js {',
      '  return "ok";',
      '}',
      '/var @result = @agent("hello", {}) with {',
      '  session: @planner,',
      `  seed: { log: "${largeValue}" }`,
      '}'
    ].join('\n');

    const result = await interpret(source, {
      fileSystem,
      pathService,
      basePath: '/',
      mode: 'structured',
      trace: 'effects'
    }) as any;

    const seedEvent = result.traceEvents.find((event: any) => event.event === 'session.seed');
    const finalEvent = result.traceEvents.find((event: any) => event.event === 'session.final');

    expect(seedEvent?.data?.value).toMatch(/^<size=\d+>$/);
    expect(finalEvent?.data?.finalState?.log).toMatch(/^<size=\d+>$/);
    expect(result.sessions[0]?.finalState?.log).toHaveLength(1500);
  });

  it('emits the committed session snapshot on guarded denial without leaking denied writes', async () => {
    const fileSystem = new MemoryFileSystem();
    const pathService = new PathService();
    const env = new Environment(fileSystem, pathService, '/');
    env.setRuntimeTrace('effects');
    const runtimeEnv = env.createChild();
    const source = [
      '/guard @block before tool:w = when [',
      '  * => deny "blocked"',
      ']',
      '/var session @planner = {',
      '  count: number?',
      '}',
      '/exe tool:w @track() = [',
      '  @planner.increment("count")',
      '  => "ok"',
      ']',
      '/var @toolList = [@track]',
      `/exe llm @agent(prompt, config) = cmd { node "${callToolFromConfigPath}" "@mx.llm.config" track '{}' }`,
      '/var @result = @agent("hello", { tools: @toolList }) with {',
      '  session: @planner,',
      '  seed: { count: 1 }',
      '}'
    ].join('\n');

    await expect(evaluate(parseSync(source), runtimeEnv)).rejects.toThrow(/blocked/i);

    const sessionEvents = runtimeEnv
      .getRuntimeTraceEvents()
      .filter(event => event.category === 'session');

    expect(sessionEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: 'session.final',
          data: expect.objectContaining({
            finalState: {
              count: 1
            }
          })
        })
      ])
    );
    expect(sessionEvents).toEqual(
      expect.not.arrayContaining([
        expect.objectContaining({
          event: 'session.write'
        })
      ])
    );
  });

  it('policy.build trace includes arg classification summaries', async () => {
    const fileSystem = new MemoryFileSystem();
    const pathService = new PathService();
    const source = `
/exe exfil:send, tool:w @sendEmail(recipient, subject, body) = \`sent\` with { controlArgs: ["recipient"] }
/var tools @writeTools = {
  sendEmail: {
    mlld: @sendEmail,
    expose: ["recipient", "subject", "body"],
    controlArgs: ["recipient"]
  }
}
/var @intent = {
  resolved: {
    sendEmail: {
      recipient: "someone@example.com"
    }
  }
}
/var @built = @policy.build(@intent, @writeTools, {
  basePolicy: {
    defaults: { rules: ["no-send-to-unknown"] },
    operations: { "exfil:send": ["tool:w"] }
  }
})
/show @built.valid
    `.trim();

    const result = await interpret(source, {
      fileSystem,
      pathService,
      basePath: '/',
      mode: 'structured',
      trace: 'effects'
    }) as any;

    const buildEvent = result.traceEvents.find(
      (event: any) => event.event === 'policy.build'
    );
    expect(buildEvent).toBeDefined();
    expect(buildEvent.data).toEqual(
      expect.objectContaining({
        mode: 'build',
        intentMode: 'bucketed',
        callerRole: null,
        tools: expect.arrayContaining([
          expect.objectContaining({
            tool: 'sendEmail',
            rawArgKeys: ['recipient'],
            controlArgKeys: ['recipient'],
            payloadArgKeys: []
          })
        ])
      })
    );
    expect(buildEvent.data.issueCodes).toEqual(
      expect.arrayContaining(['proofless_resolved_value'])
    );
  });

  it('policy.build report includes liftedArgs field', async () => {
    const fileSystem = new MemoryFileSystem();
    const pathService = new PathService();
    const source = `
/exe exfil:send, tool:w @sendEmail(recipient, subject, body) = \`sent\` with { controlArgs: ["recipient"] }
/var tools @writeTools = {
  sendEmail: {
    mlld: @sendEmail,
    expose: ["recipient", "subject", "body"],
    controlArgs: ["recipient"]
  }
}
/var @intent = {
  sendEmail: {
    recipient: {
      eq: "someone@example.com",
      attestations: ["known"]
    }
  }
}
/var @built = @policy.build(@intent, @writeTools, {
  basePolicy: {
    defaults: { rules: ["no-send-to-unknown"] },
    operations: { "exfil:send": ["tool:w"] }
  }
})
/show @built.report.liftedArgs
    `.trim();

    const result = await interpret(source, {
      fileSystem,
      pathService,
      basePath: '/',
      mode: 'structured',
      trace: 'verbose'
    }) as any;

    expect(result.output.trim()).toBe('[]');
  });

  it('emits proof.lifted when resolved bucket value is rescued by fact-backed match', async () => {
    const fileSystem = new MemoryFileSystem();
    const pathService = new PathService();
    const source = `
/record @contact = {
  facts: [email: string]
}
/exe @lookupContact(query) = { email: "ada@example.com" } => contact
/exe exfil:send, tool:w @sendEmail(recipient, subject, body) = \`sent\` with { controlArgs: ["recipient"] }
/var tools @writeTools = {
  sendEmail: {
    mlld: @sendEmail,
    expose: ["recipient", "subject", "body"],
    controlArgs: ["recipient"]
  }
}
/var @found = @lookupContact("ada")
/var @email = @found.email
/var @intent = {
  resolved: {
    sendEmail: {
      recipient: "ada@example.com"
    }
  }
}
/var @built = @policy.build(@intent, @writeTools, {
  basePolicy: {
    defaults: { rules: ["no-send-to-unknown"] },
    operations: { "exfil:send": ["tool:w"] }
  }
})
/show @built.valid
/show @built.report.liftedArgs
    `.trim();

    const result = await interpret(source, {
      fileSystem,
      pathService,
      basePath: '/',
      mode: 'structured',
      trace: 'verbose'
    }) as any;

    const lines = result.output.trim().split('\n');
    expect(lines[0]).toBe('true');
    const liftedArgsOutput = lines.slice(1).join('\n');
    const liftedArgs = JSON.parse(liftedArgsOutput);
    expect(liftedArgs.length).toBeGreaterThan(0);

    const liftedEvent = result.traceEvents.find(
      (event: any) => event.event === 'proof.lifted'
    );
    expect(liftedEvent).toBeDefined();
    expect(liftedEvent.data.liftedArgs[0]).toEqual(
      expect.objectContaining({
        tool: 'sendEmail',
        arg: 'recipient',
        liftedLabels: expect.arrayContaining([
          expect.stringContaining('fact:')
        ])
      })
    );
  });
});
