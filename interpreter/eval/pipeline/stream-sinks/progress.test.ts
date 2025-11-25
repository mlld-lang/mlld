import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { ProgressOnlySink } from './progress';
import type { StreamEvent } from '../stream-bus';

function makeEvent<T extends StreamEvent>(event: T): T {
  return { timestamp: Date.now(), pipelineId: 'p1', ...event };
}

describe('ProgressOnlySink', () => {
  let writes: string[];

  beforeEach(() => {
    writes = [];
    vi.spyOn(process.stderr, 'write').mockImplementation(((chunk: any) => {
      writes.push(String(chunk));
      return true;
    }) as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders token counts and finalizes on success', () => {
    const sink = new ProgressOnlySink({ writer: process.stderr, useTTY: false });
    sink.handle(makeEvent({ type: 'STAGE_START', stageIndex: 0 }));
    sink.handle(makeEvent({ type: 'CHUNK', stageIndex: 0, chunk: 'hello world', source: 'stdout' }));
    sink.handle(makeEvent({ type: 'STAGE_SUCCESS', stageIndex: 0, durationMs: 5 }));

    const output = writes.join('');
    expect(output).toContain('⟳ stage 1: 2 tokens');
    expect(output.endsWith('\n')).toBe(true);
  });

  it('uses tty carriage returns when enabled and finalizes on failure', () => {
    const sink = new ProgressOnlySink({ writer: process.stderr, useTTY: true });
    sink.handle(makeEvent({ type: 'STAGE_START', stageIndex: 1 }));
    sink.handle(makeEvent({ type: 'CHUNK', stageIndex: 1, chunk: 'partial chunk', source: 'stderr' }));
    sink.handle(makeEvent({ type: 'STAGE_FAILURE', stageIndex: 1, error: new Error('boom') }));

    const output = writes.join('');
    expect(output).toContain('stage 2: 2 tokens');
    expect(output.includes('\r')).toBe(true);
    expect(output.endsWith('\n')).toBe(true);
  });
});
