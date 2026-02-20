import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ShellCommandExecutor } from './ShellCommandExecutor';
import { BashExecutor } from './BashExecutor';
import { NodeExecutor, type NodeShadowEnvironmentProvider } from './NodeExecutor';
import { ErrorUtils } from '../ErrorUtils';
import type { StreamEvent } from '@interpreter/eval/pipeline/stream-bus';
import { startStreamRecorder } from '../../../tests/helpers/stream-recorder';
import { interpret } from '@interpreter/index';
import { NodeFileSystem } from '@services/fs/NodeFileSystem';
import { PathService } from '@services/fs/PathService';
import { StreamingManager } from '@interpreter/streaming/streaming-manager';

describe('Executor streaming integration', () => {
  let events: StreamEvent[];
  let unsubscribe: (() => void) | null;
  const cwd = process.cwd();
  let manager: StreamingManager;

  beforeEach(() => {
    events = [];
    manager = new StreamingManager();
    const bus = manager.getBus();
    unsubscribe = bus.subscribe((evt) => events.push(evt));
  });

  afterEach(() => {
    if (unsubscribe) unsubscribe();
    manager.getBus().clear();
  });

  it('emits incremental chunks for streaming shell commands', async () => {
    const exec = new ShellCommandExecutor(new ErrorUtils(), cwd, () => manager.getBus());

    await exec.execute('bash -lc "echo a; sleep 0.05; echo b"', undefined, {
      streamingEnabled: true,
      pipelineId: 'p1',
      stageIndex: 0
    });

    const chunks = events.filter((e) => e.type === 'CHUNK');
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    expect(chunks[0].chunk).toContain('a');
    expect(chunks[chunks.length - 1].chunk).toContain('b');
  });

  it('emits chunks during execution with a real time gap', async () => {
    const exec = new ShellCommandExecutor(new ErrorUtils(), cwd, () => manager.getBus());
    const recorder = startStreamRecorder(manager.getBus());

    await exec.execute(
      'bash -lc "echo immediate; sleep 0.3; echo delayed"',
      undefined,
      {
        streamingEnabled: true,
        pipelineId: 'p1',
        stageIndex: 0
      }
    );

    recorder.stop();
    const chunkTimes = recorder.getChunkTimes();
    expect(chunkTimes.length).toBeGreaterThanOrEqual(2);
    const firstChunkTime = chunkTimes[0];
    const lastChunkTime = chunkTimes[chunkTimes.length - 1];
    expect(lastChunkTime).toBeGreaterThan(firstChunkTime);
    expect(lastChunkTime - firstChunkTime).toBeGreaterThan(200);
  });

  it('does not emit chunks when streaming is disabled', async () => {
    const exec = new ShellCommandExecutor(new ErrorUtils(), cwd, () => manager.getBus());
    const recorder = startStreamRecorder(manager.getBus());

    await exec.execute('echo disabled', undefined, {
      streamingEnabled: false,
      pipelineId: 'p1',
      stageIndex: 0
    });

    recorder.stop();
    expect(recorder.getChunks().length).toBe(0);
  });

  it('streams from BashExecutor', async () => {
    const exec = new BashExecutor(new ErrorUtils(), cwd, {
      getVariables: () => new Map()
    }, () => manager.getBus());
    const recorder = startStreamRecorder(manager.getBus());

    await exec.execute('echo left; sleep 0.1; echo right', undefined, {
      streamingEnabled: true,
      pipelineId: 'p1',
      stageIndex: 0
    });

    recorder.stop();
    const chunks = recorder.getChunks();
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    expect(chunks.some(c => c.chunk.includes('left'))).toBe(true);
    expect(chunks.some(c => c.chunk.includes('right'))).toBe(true);
  });

  it('streams from NodeExecutor', async () => {
    const shadowProvider: NodeShadowEnvironmentProvider = {
      getNodeShadowEnv: () => undefined,
      getOrCreateNodeShadowEnv: () => {
        return {
          execute: async () => ''
        } as any;
      },
      getCurrentFilePath: () => undefined
    };
    const exec = new NodeExecutor(new ErrorUtils(), cwd, shadowProvider, () => manager.getBus());
    const recorder = startStreamRecorder(manager.getBus());

    await exec.execute(
      'console.log("node-a"); await new Promise(r => setTimeout(r, 150)); console.log("node-b");',
      undefined,
      {
        streamingEnabled: true,
        pipelineId: 'p1',
        stageIndex: 0
      }
    );

    recorder.stop();
    const chunks = recorder.getChunks();
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    expect(chunks.some(c => c.chunk.includes('node-a'))).toBe(true);
    expect(chunks.some(c => c.chunk.includes('node-b'))).toBe(true);
  });

  it('emits chunks for parallel streams with overlapping timelines', async () => {
    const exec = new ShellCommandExecutor(new ErrorUtils(), cwd, () => manager.getBus());
    const recorder = startStreamRecorder(manager.getBus());

    await Promise.all([
      exec.execute('bash -lc "echo L1; sleep 0.6; echo L2"', undefined, {
        streamingEnabled: true,
        pipelineId: 'p-par',
        stageIndex: 1,
        parallelIndex: 0
      }),
      exec.execute('bash -lc "echo R1; sleep 0.6; echo R2"', undefined, {
        streamingEnabled: true,
        pipelineId: 'p-par',
        stageIndex: 1,
        parallelIndex: 1
      })
    ]);

    recorder.stop();
    const chunks = recorder.getChunks();
    const left = chunks.filter(c => c.parallelIndex === 0);
    const right = chunks.filter(c => c.parallelIndex === 1);
    expect(left.length).toBeGreaterThan(0);
    expect(right.length).toBeGreaterThan(0);
    expect(left.some(c => c.chunk.includes('L'))).toBe(true);
    expect(right.some(c => c.chunk.includes('R'))).toBe(true);

    const leftMin = Math.min(...left.map(c => c.receivedAt));
    const leftMax = Math.max(...left.map(c => c.receivedAt));
    const rightMin = Math.min(...right.map(c => c.receivedAt));
    const rightMax = Math.max(...right.map(c => c.receivedAt));
    expect(leftMin <= rightMax && rightMin <= leftMax).toBe(true);
  });

  it('preserves parallel metadata on emitted chunks', async () => {
    const exec = new ShellCommandExecutor(new ErrorUtils(), cwd, () => manager.getBus());

    await exec.execute('echo parallel', undefined, {
      streamingEnabled: true,
      pipelineId: 'p1',
      stageIndex: 2,
      parallelIndex: 1
    });

    const chunks = events.filter((e) => e.type === 'CHUNK');
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.every((c) => c.parallelIndex === 1)).toBe(true);
  });

  it('suppresses streaming when disabled via interpret options', async () => {
    const recorder = startStreamRecorder(manager.getBus());
    const result = await interpret(
      '/run stream sh { echo "first"; sleep 0.1; echo "second" }',
      {
        fileSystem: new NodeFileSystem(),
        pathService: new PathService(),
        streaming: { enabled: false }
      }
    );

    recorder.stop();
    expect(recorder.getChunks().length).toBe(0);
    const output = typeof result === 'string' ? result : result.output;
    expect(output).toContain('second');
  });
});
