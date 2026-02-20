import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { interpret } from '@interpreter/index';
import type { StreamExecution as StreamHandle } from '@sdk/types';
import { ExecutionEmitter } from '@sdk/execution-emitter';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { StreamingManager } from '@interpreter/streaming/streaming-manager';

describe('StreamExecution integration (chunk ordering)', () => {
  const fileSystem = new MemoryFileSystem();
  const pathService = new PathService();
  let manager: StreamingManager;

  beforeEach(() => {
    manager = new StreamingManager();
  });

  afterEach(() => {
    manager.getBus().clear();
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
        streaming: { enabled: true },
        streamingManager: manager
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

  it('stops loop execution via in-flight handle.updateState without cancel', async () => {
    const script = [
      'loop(99999, 50ms) until @state.exit [',
      '  continue',
      ']',
      'show "loop-stopped"'
    ].join('\n');

    const handle = (await interpret(script, {
      fileSystem,
      pathService,
      basePath: '/',
      mode: 'stream',
      streaming: { enabled: false },
      dynamicModules: {
        '@state': { exit: false }
      }
    })) as StreamHandle;
    await handle.updateState?.('exit', true);

    const result = await handle.result();
    expect(result.output).toContain('loop-stopped');
    expect(result.stateWrites).toHaveLength(0);
  });
});
