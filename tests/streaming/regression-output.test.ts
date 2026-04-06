import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { interpret } from '@interpreter/index';
import { NodeFileSystem } from '@services/fs/NodeFileSystem';
import { PathService } from '@services/fs/PathService';
import { StreamingManager } from '@interpreter/streaming/streaming-manager';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

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

  it('treats MLLD_NO_STREAMING as a streaming disable alias', async () => {
    const prevNoStream = process.env.MLLD_NO_STREAM;
    const prevNoStreaming = process.env.MLLD_NO_STREAMING;
    const prevStream = process.env.MLLD_STREAMING;
    delete process.env.MLLD_NO_STREAM;
    process.env.MLLD_NO_STREAMING = 'true';
    process.env.MLLD_STREAMING = 'true';

    const script = `
/run stream sh { printf 'quiet' }
`.trim();

    const stdout = captureWrites(process.stdout);
    const stderr = captureWrites(process.stderr);
    try {
      const result = await interpret(script, {
        fileSystem: new NodeFileSystem(),
        pathService: new PathService(),
        streamingManager: manager,
        mode: 'structured'
      }) as any;

      expect(stdout.writes.join('')).not.toContain('quiet');
      expect(result.streaming).toBeUndefined();
      expect(result.output).toContain('quiet');
    } finally {
      if (prevNoStream === undefined) {
        delete process.env.MLLD_NO_STREAM;
      } else {
        process.env.MLLD_NO_STREAM = prevNoStream;
      }
      if (prevNoStreaming === undefined) {
        delete process.env.MLLD_NO_STREAMING;
      } else {
        process.env.MLLD_NO_STREAMING = prevNoStreaming;
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

  it('activates adapter streaming when stream is declared on the exe definition', async () => {
    const prevNoStream = process.env.MLLD_NO_STREAM;
    const prevNoStreaming = process.env.MLLD_NO_STREAMING;
    const prevStream = process.env.MLLD_STREAMING;
    delete process.env.MLLD_NO_STREAM;
    delete process.env.MLLD_NO_STREAMING;
    process.env.MLLD_STREAMING = 'true';

    const script = `
/exe @fromDefinition() = stream cmd { echo '{\"type\":\"text\",\"text\":\"from-definition\"}' }
/run @fromDefinition() with { streamFormat: "claude-code" }
`.trim();

    const stdout = captureWrites(process.stdout);
    try {
      await interpret(script, {
        fileSystem: new NodeFileSystem(),
        pathService: new PathService(),
        streamingManager: manager,
        streaming: { enabled: true },
        mode: 'structured'
      });

      const output = stdout.writes.join('');
      expect(output).toContain('from-definition');
      expect(output).not.toContain('{"type":"text","text":"from-definition"}');
    } finally {
      if (prevNoStream === undefined) {
        delete process.env.MLLD_NO_STREAM;
      } else {
        process.env.MLLD_NO_STREAM = prevNoStream;
      }
      if (prevNoStreaming === undefined) {
        delete process.env.MLLD_NO_STREAMING;
      } else {
        process.env.MLLD_NO_STREAMING = prevNoStreaming;
      }
      if (prevStream === undefined) {
        delete process.env.MLLD_STREAMING;
      } else {
        process.env.MLLD_STREAMING = prevStream;
      }
      stdout.restore();
    }
  });

  it('uses streamFormat declared on the exe definition', async () => {
    const prevNoStream = process.env.MLLD_NO_STREAM;
    const prevNoStreaming = process.env.MLLD_NO_STREAMING;
    const prevStream = process.env.MLLD_STREAMING;
    delete process.env.MLLD_NO_STREAM;
    delete process.env.MLLD_NO_STREAMING;
    process.env.MLLD_STREAMING = 'true';

    const script = `
/exe @definitionFormat() = stream cmd { echo '{\"type\":\"text\",\"text\":\"from-definition-format\"}' } with { streamFormat: "claude-code" }
/run @definitionFormat()
`.trim();

    const stdout = captureWrites(process.stdout);
    try {
      await interpret(script, {
        fileSystem: new NodeFileSystem(),
        pathService: new PathService(),
        streamingManager: manager,
        streaming: { enabled: true },
        mode: 'structured'
      });

      const output = stdout.writes.join('');
      expect(output).toContain('from-definition-format');
      expect(output).not.toContain('{"type":"text","text":"from-definition-format"}');
    } finally {
      if (prevNoStream === undefined) {
        delete process.env.MLLD_NO_STREAM;
      } else {
        process.env.MLLD_NO_STREAM = prevNoStream;
      }
      if (prevNoStreaming === undefined) {
        delete process.env.MLLD_NO_STREAMING;
      } else {
        process.env.MLLD_NO_STREAMING = prevNoStreaming;
      }
      if (prevStream === undefined) {
        delete process.env.MLLD_STREAMING;
      } else {
        process.env.MLLD_STREAMING = prevStream;
      }
      stdout.restore();
    }
  });

  it('lets invocation streamFormat override the exe definition streamFormat', async () => {
    const prevNoStream = process.env.MLLD_NO_STREAM;
    const prevNoStreaming = process.env.MLLD_NO_STREAMING;
    const prevStream = process.env.MLLD_STREAMING;
    delete process.env.MLLD_NO_STREAM;
    delete process.env.MLLD_NO_STREAMING;
    process.env.MLLD_STREAMING = 'true';

    const script = `
/var @definitionAdapter = {
  name: "definition-adapter",
  format: "ndjson",
  schemas: [{ kind: "message", matchPath: "kind", matchValue: "definition", extract: { chunk: "text" }, visibility: "always" }]
}

/var @invocationAdapter = {
  name: "invocation-adapter",
  format: "ndjson",
  schemas: [{ kind: "message", matchPath: "kind", matchValue: "invocation", extract: { chunk: "text" }, visibility: "always" }]
}

/exe @overrideFormat() = stream sh { printf '%s\\n%s\\n' '{"kind":"definition","text":"DEF_TEXT"}' '{"kind":"invocation","text":"INVOCATION_TEXT"}' } with { streamFormat: @definitionAdapter }
/run @overrideFormat() with { streamFormat: @invocationAdapter }
`.trim();

    const stdout = captureWrites(process.stdout);
    try {
      await interpret(script, {
        fileSystem: new NodeFileSystem(),
        pathService: new PathService(),
        streamingManager: manager,
        streaming: { enabled: true },
        mode: 'structured'
      });

      const output = stdout.writes.join('');
      expect(output).toContain('INVOCATION_TEXT');
      expect(output).not.toContain('DEF_TEXT');
    } finally {
      if (prevNoStream === undefined) {
        delete process.env.MLLD_NO_STREAM;
      } else {
        process.env.MLLD_NO_STREAM = prevNoStream;
      }
      if (prevNoStreaming === undefined) {
        delete process.env.MLLD_NO_STREAMING;
      } else {
        process.env.MLLD_NO_STREAMING = prevNoStreaming;
      }
      if (prevStream === undefined) {
        delete process.env.MLLD_STREAMING;
      } else {
        process.env.MLLD_STREAMING = prevStream;
      }
      stdout.restore();
    }
  });

  it('routes show invocation through the streaming adapter for streaming exe definitions', async () => {
    const prevNoStream = process.env.MLLD_NO_STREAM;
    const prevNoStreaming = process.env.MLLD_NO_STREAMING;
    const prevStream = process.env.MLLD_STREAMING;
    delete process.env.MLLD_NO_STREAM;
    delete process.env.MLLD_NO_STREAMING;
    process.env.MLLD_STREAMING = 'true';

    const script = `
/exe @showStreamed() = stream cmd { echo '{\"type\":\"text\",\"text\":\"show-stream-output\"}' } with { streamFormat: "claude-code" }
/show @showStreamed()
`.trim();

    const stdout = captureWrites(process.stdout);
    try {
      const result = await interpret(script, {
        fileSystem: new NodeFileSystem(),
        pathService: new PathService(),
        streamingManager: manager,
        streaming: { enabled: true },
        mode: 'structured'
      }) as any;

      expect(result.streaming?.text).toBe('show-stream-output');
      const output = stdout.writes.join('');
      const showCount = (output.match(/show-stream-output/g) ?? []).length;
      expect(showCount).toBe(1);
      expect(output).not.toContain('{"type":"text","text":"show-stream-output"}');
    } finally {
      if (prevNoStream === undefined) {
        delete process.env.MLLD_NO_STREAM;
      } else {
        process.env.MLLD_NO_STREAM = prevNoStream;
      }
      if (prevNoStreaming === undefined) {
        delete process.env.MLLD_NO_STREAMING;
      } else {
        process.env.MLLD_NO_STREAMING = prevNoStreaming;
      }
      if (prevStream === undefined) {
        delete process.env.MLLD_STREAMING;
      } else {
        process.env.MLLD_STREAMING = prevStream;
      }
      stdout.restore();
    }
  });

  it('mirrors raw stream JSON to stderr when showJson is enabled', async () => {
    const script = `
/run cmd { echo '{\"type\":\"text\",\"text\":\"debug-json\"}' } with { stream: true, streamFormat: "claude-code" }
`.trim();

    const stderr = captureWrites(process.stderr);
    try {
      await interpret(script, {
        fileSystem: new NodeFileSystem(),
        pathService: new PathService(),
        streamingManager: manager,
        streaming: { enabled: true, showJson: true },
        mode: 'structured'
      });
    } finally {
      stderr.restore();
    }

    expect(stderr.writes.join('')).toContain('{"type":"text","text":"debug-json"}');
  });

  it('appends raw stream JSON to appendJson output file', async () => {
    const script = `
/run cmd { echo '{\"type\":\"text\",\"text\":\"append-json\"}' } with { stream: true, streamFormat: "claude-code" }
`.trim();

    const outputFile = path.join(
      os.tmpdir(),
      `mlld-append-json-${Date.now()}-${Math.floor(Math.random() * 1e6)}.jsonl`
    );

    try {
      await interpret(script, {
        fileSystem: new NodeFileSystem(),
        pathService: new PathService(),
        streamingManager: manager,
        streaming: { enabled: true, appendJson: outputFile },
        mode: 'structured'
      });

      const written = await fs.readFile(outputFile, 'utf8');
      expect(written).toContain('{"type":"text","text":"append-json"}');
    } finally {
      await fs.rm(outputFile, { force: true });
    }
  });
});
