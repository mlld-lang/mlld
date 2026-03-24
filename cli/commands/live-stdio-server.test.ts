import { PassThrough } from 'stream';
import { describe, expect, it } from 'vitest';
import { LiveStdioServer } from './live-stdio-server';
import type { SDKEvent, SDKEventHandler, StreamExecution, StructuredResult } from '@sdk/types';
import { ExecuteError } from '@sdk/types';
import { MlldDirectiveError } from '@core/errors/MlldDirectiveError';

class FakeStreamExecution implements StreamExecution {
  private readonly listeners = new Map<SDKEvent['type'], Set<SDKEventHandler>>();
  private readonly resultPromise: Promise<StructuredResult>;
  private readonly donePromise: Promise<void>;
  private resolveResult!: (value: StructuredResult) => void;
  private rejectResult!: (error: unknown) => void;
  private complete = false;
  readonly stateUpdates: Array<{ path: string; value: unknown; labels?: string[] }> = [];
  readonly updateState?: (path: string, value: unknown, labels?: string[]) => Promise<void>;

  constructor(options: { enableStateUpdates?: boolean } = {}) {
    this.resultPromise = new Promise<StructuredResult>((resolve, reject) => {
      this.resolveResult = resolve;
      this.rejectResult = reject;
    });

    if (options.enableStateUpdates !== false) {
      this.updateState = async (path: string, value: unknown, labels?: string[]): Promise<void> => {
        this.stateUpdates.push(labels ? { path, value, labels } : { path, value });
      };
    }

    // Swallow rejections to keep tests from reporting unhandled done() rejections.
    this.donePromise = this.resultPromise.then(
      () => undefined,
      () => undefined
    );
  }

  on(type: SDKEvent['type'], handler: SDKEventHandler): void {
    const bucket = this.listeners.get(type) ?? new Set<SDKEventHandler>();
    bucket.add(handler);
    this.listeners.set(type, bucket);
  }

  off(type: SDKEvent['type'], handler: SDKEventHandler): void {
    this.listeners.get(type)?.delete(handler);
  }

  once(type: SDKEvent['type'], handler: SDKEventHandler): void {
    const wrapper: SDKEventHandler = (event) => {
      this.off(type, wrapper);
      handler(event);
    };
    this.on(type, wrapper);
  }

  emit(event: SDKEvent): void {
    for (const handler of this.listeners.get(event.type) ?? []) {
      handler(event);
    }
  }

  resolve(result: StructuredResult): void {
    if (this.complete) return;
    this.complete = true;
    this.resolveResult(result);
  }

  reject(error: unknown): void {
    if (this.complete) return;
    this.complete = true;
    this.rejectResult(error);
  }

  done(): Promise<void> {
    return this.donePromise;
  }

  result(): Promise<StructuredResult> {
    return this.resultPromise;
  }

  isComplete(): boolean {
    return this.complete;
  }

  abort = (): void => {
    this.reject(new Error('aborted'));
  };

  async *[Symbol.asyncIterator](): AsyncIterator<SDKEvent> {
    return;
  }
}

type HarnessDeps = {
  interpret?: any;
  executeFile?: any;
  analyze?: any;
  fsStatus?: any;
  signFile?: any;
  verifyFile?: any;
  signContent?: any;
  createExecutionFileWriter?: any;
};

function createServerHarness(
  deps: HarnessDeps = {},
  options: { useDefaultDeps?: boolean } = {}
) {
  const input = new PassThrough();
  const output = new PassThrough();
  output.setEncoding('utf8');

  const lines: string[] = [];
  let buffer = '';
  output.on('data', (chunk: string) => {
    buffer += chunk;
    while (true) {
      const newlineIndex = buffer.indexOf('\n');
      if (newlineIndex < 0) {
        break;
      }
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (line) {
        lines.push(line);
      }
    }
  });

  const server = options.useDefaultDeps
    ? new LiveStdioServer({ input, output })
    : new LiveStdioServer(
        { input, output },
        {
          interpret: deps.interpret ?? (async () => {
            throw new Error('interpret not stubbed');
          }),
          executeFile: deps.executeFile ?? (async () => {
            throw new Error('execute not stubbed');
          }),
          analyze: deps.analyze ?? (async () => {
            throw new Error('analyze not stubbed');
          }),
          fsStatus: deps.fsStatus ?? (async () => {
            throw new Error('fsStatus not stubbed');
          }),
          signFile: deps.signFile ?? (async () => {
            throw new Error('signFile not stubbed');
          }),
          verifyFile: deps.verifyFile ?? (async () => {
            throw new Error('verifyFile not stubbed');
          }),
          signContent: deps.signContent ?? (async () => {
            throw new Error('signContent not stubbed');
          }),
          createExecutionFileWriter: deps.createExecutionFileWriter ?? (async () => undefined),
          makeFileSystem: () => ({}) as any,
          makePathService: () => ({}) as any
        }
      );

  const startPromise = server.start();

  const waitFor = async (predicate: () => boolean, timeoutMs = 1500): Promise<void> => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (predicate()) {
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    throw new Error('Timed out waiting for harness condition');
  };

  const waitForLineCount = async (count: number, timeoutMs = 1500): Promise<void> => {
    await waitFor(() => lines.length >= count, timeoutMs);
  };

  const jsonLines = (): any[] => lines.map(line => JSON.parse(line));

  const close = async (): Promise<void> => {
    input.end();
    await startPromise;
  };

  return {
    input,
    lines,
    waitFor,
    waitForLineCount,
    jsonLines,
    close
  };
}

describe('LiveStdioServer', () => {
  it('handles process requests and streams events before final result', async () => {
    const handle = new FakeStreamExecution();

    const harness = createServerHarness({
      interpret: async () => handle
    });

    harness.input.write(
      `${JSON.stringify({ method: 'process', id: 1, params: { script: '/show "hi"' } })}\n`
    );

    await new Promise(resolve => setTimeout(resolve, 20));

    handle.emit({ type: 'command:start', command: '@demo', timestamp: Date.now() } as any);
    handle.emit({
      type: 'state:write',
      write: { index: 0, path: 'foo', value: 'bar', operation: 'set', timestamp: '2026-01-01T00:00:00.000Z' },
      timestamp: Date.now()
    } as any);
    handle.resolve({ output: 'hi', effects: [], exports: {}, stateWrites: [] } as any);

    await harness.waitForLineCount(3);
    const lines = harness.jsonLines();

    expect(lines[0].event.id).toBe(1);
    expect(lines[0].event.type).toBe('command:start');
    expect(lines[1].event.type).toBe('state:write');
    expect(lines[1].event.write.path).toBe('foo');
    expect(lines[2].result.id).toBe(1);
    expect(lines[2].result.output).toBe('hi');

    await harness.close();
  });

  it('forwards guard_denial events and preserves result denials', async () => {
    const handle = new FakeStreamExecution();

    const harness = createServerHarness({
      executeFile: async () => handle
    });

    harness.input.write(
      `${JSON.stringify({ method: 'execute', id: 12, params: { filepath: '/tmp/agent.mld' } })}\n`
    );

    await new Promise(resolve => setTimeout(resolve, 20));

    const denial = {
      guard: 'blocker',
      operation: 'send_email',
      reason: 'recipient not authorized',
      rule: null,
      labels: ['untrusted'],
      args: { recipients: ['attacker@evil.com'] }
    };

    handle.emit({
      type: 'guard_denial',
      guard_denial: denial,
      timestamp: Date.now()
    } as any);
    handle.resolve({
      output: 'blocked',
      effects: [],
      exports: {},
      stateWrites: [],
      denials: [denial]
    } as any);

    await harness.waitForLineCount(2);
    const lines = harness.jsonLines();

    expect(lines[0].event.type).toBe('guard_denial');
    expect(lines[0].event.guard_denial).toEqual(denial);
    expect(lines[1].result.denials).toEqual([denial]);

    await harness.close();
  });

  it('sanitizes nested error causes in streamed events', async () => {
    const handle = new FakeStreamExecution();
    const harness = createServerHarness({
      interpret: async () => handle
    });

    harness.input.write(
      `${JSON.stringify({ method: 'process', id: 11, params: { script: '/show "hi"' } })}\n`
    );

    await new Promise(resolve => setTimeout(resolve, 20));

    const leakedState = {
      securityManager: { activePolicies: ['strict'], secretToken: 'top-secret' },
      resolverManager: { caches: { registry: '@mlld/claude@2.1.0' } },
      variableManager: { vars: { model: 'haiku' } }
    };
    const directiveError = new MlldDirectiveError(
      'Cannot access field "model" on non-object value',
      'show',
      {
        context: {
          environment: leakedState,
          baseValue: leakedState
        }
      }
    );

    handle.emit({
      type: 'command:complete',
      command: '@demo',
      error: new ExecuteError(directiveError.message, 'RUNTIME_ERROR', '/tmp/test.mld', {
        cause: directiveError
      }),
      timestamp: Date.now()
    } as any);
    handle.resolve({ output: 'ignored', effects: [], exports: {}, stateWrites: [] } as any);

    await harness.waitForLineCount(2);
    const [eventLine] = harness.lines;
    const [event] = harness.jsonLines();

    expect(event.event.type).toBe('command:complete');
    expect(event.event.error.message).toContain('Cannot access field "model"');
    expect(eventLine).not.toContain('securityManager');
    expect(eventLine).not.toContain('resolverManager');
    expect(eventLine).not.toContain('variableManager');
    expect(eventLine).not.toContain('top-secret');

    await harness.close();
  });

  it('handles fs:status requests', async () => {
    const harness = createServerHarness({
      fsStatus: async () => [
        {
          path: '/repo/docs/a.txt',
          relativePath: 'docs/a.txt',
          status: 'verified',
          verified: true,
          signer: 'user:alice',
          labels: ['trusted'],
          taint: []
        }
      ]
    });

    harness.input.write(
      `${JSON.stringify({ method: 'fs:status', id: 21, params: { glob: 'docs/*.txt' } })}\n`
    );

    await harness.waitForLineCount(1);
    const [line] = harness.jsonLines();

    expect(line.result.id).toBe(21);
    expect(line.result.value).toEqual([
      expect.objectContaining({
        relativePath: 'docs/a.txt',
        status: 'verified',
        signer: 'user:alice'
      })
    ]);

    await harness.close();
  });

  it('handles sig:sign requests', async () => {
    const harness = createServerHarness({
      signFile: async () => ({
        path: '/repo/docs/a.txt',
        relativePath: 'docs/a.txt',
        status: 'verified',
        verified: true,
        signer: 'user:alice'
      })
    });

    harness.input.write(
      `${JSON.stringify({ method: 'sig:sign', id: 22, params: { path: 'docs/a.txt' } })}\n`
    );

    await harness.waitForLineCount(1);
    const [line] = harness.jsonLines();

    expect(line.result.id).toBe(22);
    expect(line.result).toEqual(
      expect.objectContaining({
        relativePath: 'docs/a.txt',
        status: 'verified',
        signer: 'user:alice'
      })
    );

    await harness.close();
  });

  it('handles sig:verify and sig:sign-content requests', async () => {
    const harness = createServerHarness({
      verifyFile: async () => ({
        path: '/repo/docs/a.txt',
        relativePath: 'docs/a.txt',
        status: 'verified',
        verified: true,
        signer: 'user:alice'
      }),
      signContent: async () => ({
        id: 'sig-1',
        hash: 'sha256:abc',
        algorithm: 'sha256',
        signedBy: 'user:alice',
        signedAt: '2026-03-12T00:00:00.000Z',
        contentLength: 4
      })
    });

    harness.input.write(
      `${JSON.stringify({ method: 'sig:verify', id: 23, params: { path: 'docs/a.txt' } })}\n`
    );
    harness.input.write(
      `${JSON.stringify({ method: 'sig:sign-content', id: 24, params: { content: 'test', identity: 'user:alice' } })}\n`
    );

    await harness.waitForLineCount(2);
    const [verifyLine, signContentLine] = harness.jsonLines();

    expect(verifyLine.result).toEqual(
      expect.objectContaining({
        relativePath: 'docs/a.txt',
        status: 'verified'
      })
    );
    expect(signContentLine.result.value).toEqual(
      expect.objectContaining({
        id: 'sig-1',
        signedBy: 'user:alice'
      })
    );

    await harness.close();
  });

  it('handles file:write requests for active executions', async () => {
    const handle = new FakeStreamExecution();
    const harness = createServerHarness({
      executeFile: async () => handle,
      createExecutionFileWriter: async () =>
        async (targetPath: string, content: string) => ({
          path: `/repo/${targetPath}`,
          relativePath: targetPath,
          status: 'verified',
          verified: true,
          signer: 'agent:route',
          content
        })
    });

    harness.input.write(
      `${JSON.stringify({ method: 'execute', id: 31, params: { filepath: '/repo/route.mld' } })}\n`
    );
    await new Promise(resolve => setTimeout(resolve, 20));

    harness.input.write(
      `${JSON.stringify({ method: 'file:write', id: 32, params: { requestId: 31, path: 'out.txt', content: 'hello' } })}\n`
    );

    await harness.waitForLineCount(1);
    const [writeLine] = harness.jsonLines();
    expect(writeLine.result.id).toBe(32);
    expect(writeLine.result).toEqual(
      expect.objectContaining({
        relativePath: 'out.txt',
        signer: 'agent:route'
      })
    );

    handle.resolve({ output: 'ok', effects: [], exports: {}, stateWrites: [] } as any);
    await harness.waitForLineCount(2);

    await harness.close();
  });

  it('handles analyze requests', async () => {
    const harness = createServerHarness({
      analyze: async (filepath: string) => ({ filepath, valid: true, errors: [], warnings: [] })
    });

    harness.input.write(
      `${JSON.stringify({ method: 'analyze', id: 'a1', params: { filepath: './module.mld' } })}\n`
    );

    await harness.waitForLineCount(1);
    const [line] = harness.jsonLines();

    expect(line.result.id).toBe('a1');
    expect(line.result.filepath).toBe('./module.mld');
    expect(line.result.valid).toBe(true);

    await harness.close();
  });

  it('returns parse error for invalid json', async () => {
    const harness = createServerHarness({});

    harness.input.write('{not-json}\n');

    await harness.waitForLineCount(1);
    const [line] = harness.jsonLines();

    expect(line.result.id).toBeNull();
    expect(line.result.error.code).toBe('INVALID_JSON');

    await harness.close();
  });

  it('aborts active request on cancel', async () => {
    const handle = new FakeStreamExecution();

    const harness = createServerHarness({
      executeFile: async () => handle
    });

    harness.input.write(
      `${JSON.stringify({ method: 'execute', id: 7, params: { filepath: './run.mld' } })}\n`
    );

    await new Promise(resolve => setTimeout(resolve, 20));

    harness.input.write(
      `${JSON.stringify({ method: 'cancel', id: 7 })}\n`
    );

    await harness.waitForLineCount(1);
    const [line] = harness.jsonLines();

    expect(line.result.id).toBe(7);
    expect(line.result.error.code).toBe('ABORTED');

    await harness.close();
  });

  it('applies state:update to active in-flight request', async () => {
    const handle = new FakeStreamExecution();
    const harness = createServerHarness({
      executeFile: async () => handle
    });

    harness.input.write(
      `${JSON.stringify({ method: 'execute', id: 7, params: { filepath: './run.mld' } })}\n`
    );

    await new Promise(resolve => setTimeout(resolve, 20));

    harness.input.write(
      `${JSON.stringify({
        method: 'state:update',
        id: 'u1',
        params: { requestId: 7, path: 'exit', value: true, labels: ['untrusted', 'pii'] }
      })}\n`
    );

    await harness.waitFor(() => harness.jsonLines().some(line => line.result?.id === 'u1'));
    const updateResult = harness
      .jsonLines()
      .find(line => line.result?.id === 'u1');

    expect(updateResult.result.requestId).toBe(7);
    expect(updateResult.result.path).toBe('exit');
    expect(handle.stateUpdates).toEqual([{ path: 'exit', value: true, labels: ['untrusted', 'pii'] }]);

    handle.resolve({ output: 'ok', effects: [], exports: {}, stateWrites: [] } as any);
    await harness.close();
  });

  it('rejects state:update when request has no dynamic @state', async () => {
    const handle = new FakeStreamExecution({ enableStateUpdates: false });
    const harness = createServerHarness({
      executeFile: async () => handle
    });

    harness.input.write(
      `${JSON.stringify({ method: 'execute', id: 7, params: { filepath: './run.mld' } })}\n`
    );

    await new Promise(resolve => setTimeout(resolve, 20));

    harness.input.write(
      `${JSON.stringify({
        method: 'state:update',
        id: 'u2',
        params: { requestId: 7, path: 'exit', value: true }
      })}\n`
    );

    await harness.waitFor(() => harness.jsonLines().some(line => line.result?.id === 'u2'));
    const updateResult = harness
      .jsonLines()
      .find(line => line.result?.id === 'u2');

    expect(updateResult.result.error.code).toBe('STATE_UNAVAILABLE');

    handle.resolve({ output: 'ok', effects: [], exports: {}, stateWrites: [] } as any);
    await harness.close();
  });

  it('rejects state:update when target request is not active', async () => {
    const harness = createServerHarness({});

    harness.input.write(
      `${JSON.stringify({
        method: 'state:update',
        id: 'u3',
        params: { requestId: 404, path: 'exit', value: true }
      })}\n`
    );

    await harness.waitForLineCount(1);
    const [line] = harness.jsonLines();

    expect(line.result.id).toBe('u3');
    expect(line.result.error.code).toBe('REQUEST_NOT_FOUND');

    await harness.close();
  });

});

describe('LiveStdioServer output mode', () => {
  it('restores MLLD_NO_STREAMING value after shutdown', async () => {
    const original = process.env.MLLD_NO_STREAMING;
    process.env.MLLD_NO_STREAMING = 'custom-value';

    const harness = createServerHarness({
      analyze: async (filepath: string) => ({ filepath, valid: true })
    });

    harness.input.write(
      `${JSON.stringify({ method: 'analyze', id: 9, params: { filepath: './x.mld' } })}\n`
    );
    await harness.waitForLineCount(1);
    await harness.close();

    expect(process.env.MLLD_NO_STREAMING).toBe('custom-value');

    if (original === undefined) {
      delete process.env.MLLD_NO_STREAMING;
    } else {
      process.env.MLLD_NO_STREAMING = original;
    }
  });
});
