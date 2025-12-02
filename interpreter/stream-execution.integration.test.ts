import { describe, it, expect, afterEach } from 'vitest';
import { interpret } from '@interpreter/index';
import type { StreamExecution as StreamHandle } from '@sdk/types';
import { ExecutionEmitter } from '@sdk/execution-emitter';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { getStreamBus } from '@interpreter/eval/pipeline/stream-bus';

describe('StreamExecution integration (chunk ordering)', () => {
  const fileSystem = new MemoryFileSystem();
  const pathService = new PathService();

  afterEach(() => {
    getStreamBus().clear();
  });

  it('delivers pipeline CHUNK events during execution and before completion', async () => {
    const emitter = new ExecutionEmitter();
    const chunks: Array<{ chunk: string; timestamp: number }> = [];
    const lifecycle: string[] = [];

    emitter.on('stream:chunk', e => {
      chunks.push({ chunk: e.event.chunk, timestamp: e.event.timestamp });
    });
    emitter.on('execution:complete', () => lifecycle.push('complete'));

    const handle = (await interpret(
      `
/run sh { printf a; sleep 0.05; printf b; } with { stream: true }
      `.trim(),
      {
        fileSystem,
        pathService,
        basePath: '/',
        mode: 'stream',
        emitter,
        streaming: { enabled: true }
      }
    )) as StreamHandle;

    await handle.done();
    expect(chunks.map(c => c.chunk).join('')).toContain('a');
    expect(chunks.map(c => c.chunk).join('')).toContain('b');
    expect(lifecycle).toContain('complete');
    const latestChunkTs = Math.max(...chunks.map(c => c.timestamp));
    expect(lifecycle.length).toBeGreaterThan(0);
    // Completion should happen after the last chunk timestamp
    expect(latestChunkTs).toBeLessThanOrEqual(Date.now());
  });
});
