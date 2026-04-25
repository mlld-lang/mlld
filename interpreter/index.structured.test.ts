import { readFile, mkdtemp, rm } from 'fs/promises';
import os from 'os';
import path from 'path';
import { describe, it, expect } from 'vitest';
import { interpret, Environment } from '@interpreter/index';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';

describe('interpret structured mode', () => {
  it('returns structured result with effects and exports', async () => {
    const fileSystem = new MemoryFileSystem();
    const pathService = new PathService();
    const source = `
/var secret @apiKey = "sk-123"
/show "Hello there"
/export { @apiKey }
    `.trim();

    const result = await interpret(source, {
      fileSystem,
      pathService,
      basePath: '/',
      format: 'markdown',
      mode: 'structured',
      streaming: { enabled: false }
    });

    expect(typeof result).toBe('object');
    const effects = (result as any).effects;
    const exports = (result as any).exports;

    expect((result as any).output).toContain('Hello there');
    expect(Array.isArray(effects)).toBe(true);
    expect(effects.length).toBeGreaterThan(0);
    const firstVisibleEffect = effects.find((effect: any) => effect.type === 'doc' || effect.type === 'both');
    expect(firstVisibleEffect).toBeDefined();
    expect(['doc', 'both']).toContain(firstVisibleEffect.type);
    expect(firstVisibleEffect.security).toBeDefined();
    expect(Array.isArray(firstVisibleEffect.security?.labels)).toBe(true);
    expect(Array.isArray(firstVisibleEffect.security?.taint ?? [])).toBe(true);
    expect(Array.isArray(firstVisibleEffect.security?.sources)).toBe(true);

    const exportKey = exports.apiKey ? 'apiKey' : '@apiKey';
    expect(exports[exportKey].value).toBe('sk-123');
    expect(exports[exportKey].metadata?.security).toBeDefined();
    expect((result as any).environment).toBeInstanceOf(Environment);
  });

  it('collects runtime trace events in structured mode and mirrors them to JSONL', async () => {
    const fileSystem = new MemoryFileSystem();
    const pathService = new PathService();
    const traceDir = await mkdtemp(path.join(os.tmpdir(), 'mlld-trace-'));
    const traceFile = path.join(traceDir, 'runtime.jsonl');
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
@shelf.write(@pipeline.selected, @emitContact())
/show @pipeline.selected.name
    `.trim();

    try {
      const result = await interpret(source, {
        fileSystem,
        pathService,
        basePath: '/',
        format: 'markdown',
        mode: 'structured',
        trace: 'verbose',
        traceFile
      }) as any;

      expect(result.output).toContain('Ada');
      expect(result.traceEvents).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            category: 'shelf',
            event: 'shelf.write',
            level: 'effects',
            data: expect.objectContaining({ slot: '@pipeline.selected' })
          }),
          expect.objectContaining({
            category: 'shelf',
            event: 'shelf.read',
            level: 'verbose',
            data: expect.objectContaining({ slot: '@pipeline.selected' })
          })
        ])
      );

      const traceLines = (await readFile(traceFile, 'utf8'))
        .trim()
        .split('\n')
        .map(line => JSON.parse(line));

      expect(traceLines).toHaveLength(result.traceEvents.length);
      expect(traceLines).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ event: 'shelf.write' }),
          expect.objectContaining({ event: 'shelf.read' })
        ])
      );
    } finally {
      await rm(traceDir, { recursive: true, force: true });
    }
  });

  it('mirrors memory trace events to JSONL when traceMemory is enabled', async () => {
    const fileSystem = new MemoryFileSystem();
    const pathService = new PathService();
    const traceDir = await mkdtemp(path.join(os.tmpdir(), 'mlld-memory-trace-'));
    const traceFile = path.join(traceDir, 'runtime.jsonl');

    try {
      const result = await interpret('/show "ok"', {
        fileSystem,
        pathService,
        basePath: '/',
        format: 'markdown',
        mode: 'structured',
        traceMemory: true,
        traceFile
      }) as any;

      const traceLines = (await readFile(traceFile, 'utf8'))
        .trim()
        .split('\n')
        .map(line => JSON.parse(line));

      expect(result.traceEvents).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ category: 'memory' })
        ])
      );
      expect(traceLines).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            category: 'memory',
            data: expect.objectContaining({
              heapUsed: expect.any(Number),
              rss: expect.any(Number)
            })
          })
        ])
      );
    } finally {
      await rm(traceDir, { recursive: true, force: true });
    }
  });

  it('streams document-mode memory traces without retaining them in the environment', async () => {
    const fileSystem = new MemoryFileSystem();
    const pathService = new PathService();
    const traceDir = await mkdtemp(path.join(os.tmpdir(), 'mlld-document-memory-trace-'));
    const traceFile = path.join(traceDir, 'runtime.jsonl');
    let capturedEnv: Environment | undefined;

    try {
      const output = await interpret('/show "ok"', {
        fileSystem,
        pathService,
        basePath: '/',
        format: 'markdown',
        mode: 'document',
        traceMemory: true,
        traceFile,
        captureEnvironment: env => {
          capturedEnv = env;
        }
      });

      expect(output).toContain('ok');
      const traceLines = (await readFile(traceFile, 'utf8'))
        .trim()
        .split('\n')
        .map(line => JSON.parse(line));

      expect(traceLines).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ category: 'memory' })
        ])
      );
      expect(capturedEnv?.getRuntimeTraceEvents()).toEqual([]);
    } finally {
      await rm(traceDir, { recursive: true, force: true });
    }
  });

  it('filters verbose-only runtime events out of effects-level traces', async () => {
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
@shelf.write(@pipeline.selected, @emitContact())
/show @pipeline.selected.name
    `.trim();

    const result = await interpret(source, {
      fileSystem,
      pathService,
      basePath: '/',
      format: 'markdown',
      mode: 'structured',
      trace: 'effects'
    }) as any;

    expect(result.traceEvents.some((event: any) => event.event === 'shelf.write')).toBe(true);
    expect(result.traceEvents.some((event: any) => event.event === 'shelf.read')).toBe(false);
  });
});
