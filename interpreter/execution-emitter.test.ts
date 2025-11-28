import { describe, it, expect } from 'vitest';
import { ExecutionEmitter } from '@sdk/execution-emitter';
import { getStreamBus } from '@interpreter/eval/pipeline/stream-bus';
import { interpret, Environment } from '@interpreter/index';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';

describe('ExecutionEmitter', () => {
  it('supports on/off/emit', () => {
    const emitter = new ExecutionEmitter();
    let count = 0;
    const handler = () => {
      count++;
    };
    emitter.on('stream:progress', handler);
    emitter.emit({ type: 'stream:progress', event: { type: 'PIPELINE_START', pipelineId: 'p', timestamp: Date.now() } });
    emitter.off('stream:progress', handler);
    emitter.emit({ type: 'stream:progress', event: { type: 'PIPELINE_COMPLETE', pipelineId: 'p', timestamp: Date.now() } });
    expect(count).toBe(1);
  });

  it('bridges StreamBus events into SDK events when enabled on Environment', async () => {
    const emitter = new ExecutionEmitter();
    const received: any[] = [];
    emitter.on('stream:progress', event => received.push(event));
    emitter.on('stream:chunk', event => received.push(event));

    const fileSystem = new MemoryFileSystem();
    const pathService = new PathService();
    await interpret('/show "hi"', {
      fileSystem,
      pathService,
      basePath: '/',
      mode: 'structured',
      emitter,
      streaming: { enabled: true }
    });

    const bus = getStreamBus();
    bus.emit({ type: 'PIPELINE_START', pipelineId: 'p', timestamp: Date.now(), source: 'pipeline' });
    bus.emit({ type: 'CHUNK', pipelineId: 'p', stageIndex: 0, chunk: 'hello', source: 'stdout', timestamp: Date.now() });

    expect(received.some(e => e.type === 'stream:progress')).toBe(true);
    expect(received.some(e => e.type === 'stream:chunk')).toBe(true);
  });

  it('detaches stream bridge on cleanup', async () => {
    const emitter = new ExecutionEmitter();
    let fired = 0;
    emitter.on('stream:progress', () => fired++);

    const fileSystem = new MemoryFileSystem();
    const pathService = new PathService();
    const interpretResult = await interpret('/show "hi"', {
      fileSystem,
      pathService,
      basePath: '/',
      mode: 'structured',
      emitter,
      streaming: { enabled: true }
    });

    const env = (interpretResult as any).environment as Environment;
    env.cleanup();

    const bus = getStreamBus();
    bus.emit({ type: 'PIPELINE_START', pipelineId: 'p', timestamp: Date.now(), source: 'pipeline' });

    expect(fired).toBe(0);
  });
});
