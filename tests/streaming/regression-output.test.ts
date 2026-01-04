import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { interpret } from '@interpreter/index';
import { NodeFileSystem } from '@services/fs/NodeFileSystem';
import { PathService } from '@services/fs/PathService';
import { StreamingManager } from '@interpreter/streaming/streaming-manager';

function captureWrites(stream: NodeJS.WriteStream) {
  const writes: string[] = [];
  const original = stream.write;
  // @ts-expect-error - override for test capture
  stream.write = ((chunk: any, ...args: any[]) => {
    const text = typeof chunk === 'string' ? chunk : chunk?.toString?.() ?? '';
    writes.push(text);
    return true;
  }) as any;
  return {
    writes,
    restore: () => {
      // @ts-expect-error - restore original
      stream.write = original;
    }
  };
}

describe('streaming output regression', () => {
  let manager: StreamingManager;

  beforeEach(() => {
    manager = new StreamingManager();
  });

  it('emits adapter-formatted output only once (no raw chunk or duplicate)', async () => {
    const prevNoStream = process.env.MLLD_NO_STREAMING;
    const prevStream = process.env.MLLD_STREAMING;
    delete process.env.MLLD_NO_STREAMING;
    process.env.MLLD_STREAMING = 'true';

    const script = `
/exe @test() = stream cmd { echo '{\"type\":\"text\",\"text\":\"Hello\"}' }
/run stream @test() with { streamFormat: "claude-code" }
`.trim();

    const stdout = captureWrites(process.stdout);
    const stderr = captureWrites(process.stderr);
    try {
      const result = await interpret(script, {
        fileSystem: new NodeFileSystem(),
        pathService: new PathService(),
        streamingManager: manager,
        streaming: { enabled: true },
        mode: 'structured'
      }) as any;

      // Check streaming result
      expect(result.streaming?.text).toBe('Hello');

      // Check stdout got single emission (from streaming)
      const output = stdout.writes.join('');
      const helloCount = (output.match(/Hello/g) ?? []).length;
      expect(helloCount).toBe(1);
      expect(output).not.toContain('HelloHello');
    } finally {
      if (prevNoStream === undefined) {
        delete process.env.MLLD_NO_STREAMING;
      } else {
        process.env.MLLD_NO_STREAMING = prevNoStream;
      }
      if (prevStream === undefined) {
        delete process.env.MLLD_STREAMING;
      } else {
        process.env.MLLD_STREAMING = prevStream;
      }
      stdout.restore();
      stderr.restore();
    }
  });

  it('emits streamed command output once without streamFormat', async () => {
    const prevNoStream = process.env.MLLD_NO_STREAMING;
    const prevStream = process.env.MLLD_STREAMING;
    delete process.env.MLLD_NO_STREAMING;
    process.env.MLLD_STREAMING = 'true';

    const script = `
/run stream sh { printf 'hi' }
`.trim();

    const stdout = captureWrites(process.stdout);
    const stderr = captureWrites(process.stderr);
    try {
      await interpret(script, {
        fileSystem: new NodeFileSystem(),
        pathService: new PathService(),
        streamingManager: manager,
        streaming: { enabled: true }
      });
    } finally {
      if (prevNoStream === undefined) {
        delete process.env.MLLD_NO_STREAMING;
      } else {
        process.env.MLLD_NO_STREAMING = prevNoStream;
      }
      if (prevStream === undefined) {
        delete process.env.MLLD_STREAMING;
      } else {
        process.env.MLLD_STREAMING = prevStream;
      }
      stdout.restore();
      stderr.restore();
    }

    const output = stdout.writes.join('');
    const hiCount = (output.match(/hi/g) ?? []).length;
    expect(hiCount).toBe(1);
    expect(output).not.toContain('hihi');
  });

  it('creates adapters from streamFormat config objects', async () => {
    const prevNoStream = process.env.MLLD_NO_STREAMING;
    const prevStream = process.env.MLLD_STREAMING;
    delete process.env.MLLD_NO_STREAMING;
    process.env.MLLD_STREAMING = 'true';

    const script = `
/var @inlineAdapter = {
  name: "inline-adapter",
  format: "ndjson",
  schemas: [
    {
      kind: "message",
      matchPath: "type",
      matchValue: "text",
      extract: { chunk: "text" },
      visibility: "always"
    }
  ]
}

/exe @test() = stream cmd { echo '{\"type\":\"text\",\"text\":\"Hello\"}' }
/run stream @test() with { streamFormat: @inlineAdapter }
`.trim();

    const stdout = captureWrites(process.stdout);
    const stderr = captureWrites(process.stderr);
    try {
      const result = await interpret(script, {
        fileSystem: new NodeFileSystem(),
        pathService: new PathService(),
        streamingManager: manager,
        streaming: { enabled: true },
        mode: 'structured'
      }) as any;

      // Check streaming result accumulated text
      expect(result.streaming?.text).toBe('Hello');

      // Check stdout got single emission (from streaming)
      const output = stdout.writes.join('');
      const helloCount = (output.match(/Hello/g) ?? []).length;
      expect(helloCount).toBe(1);
    } finally {
      if (prevNoStream === undefined) {
        delete process.env.MLLD_NO_STREAMING;
      } else {
        process.env.MLLD_NO_STREAMING = prevNoStream;
      }
      if (prevStream === undefined) {
        delete process.env.MLLD_STREAMING;
      } else {
        process.env.MLLD_STREAMING = prevStream;
      }
      stdout.restore();
      stderr.restore();
    }
  });
});
