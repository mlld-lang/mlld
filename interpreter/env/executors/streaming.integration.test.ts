import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ShellCommandExecutor } from './ShellCommandExecutor';
import { ErrorUtils } from '../ErrorUtils';
import { getStreamBus, type StreamEvent } from '@interpreter/eval/pipeline/stream-bus';

describe('Executor streaming integration', () => {
  let events: StreamEvent[];
  let unsubscribe: (() => void) | null;

  beforeEach(() => {
    events = [];
    const bus = getStreamBus();
    bus.clear();
    unsubscribe = bus.subscribe((evt) => events.push(evt));
  });

  afterEach(() => {
    if (unsubscribe) unsubscribe();
    getStreamBus().clear();
  });

  it('emits incremental chunks for streaming shell commands', async () => {
    const exec = new ShellCommandExecutor(new ErrorUtils(), process.cwd());

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

  it('preserves parallel metadata on emitted chunks', async () => {
    const exec = new ShellCommandExecutor(new ErrorUtils(), process.cwd());

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
});
