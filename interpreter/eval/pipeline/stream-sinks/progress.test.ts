import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getStreamBus } from '../stream-bus';
import { ProgressOnlySink } from './progress';

describe('ProgressOnlySink', () => {
  let restore: (() => void) | undefined;
  let outputs: string[];
  const bus = getStreamBus();

  beforeEach(() => {
    outputs = [];
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation((chunk: any) => {
      const s = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
      outputs.push(s);
      return true as any;
    });
    restore = () => spy.mockRestore();
  });

  afterEach(() => {
    if (restore) restore();
  });

  it('increments word count across CHUNK events with carryover', async () => {
    const sink = new ProgressOnlySink();
    sink.attach();

    // Start stage 0
    bus.publish({ type: 'STAGE_START', stage: 0, commandId: 'echo test' });
    // Chunk: completes one word
    bus.publish({ type: 'CHUNK', stage: 0, source: 'stdout', text: 'hello ' });
    // Chunk: partial word, no increment yet
    bus.publish({ type: 'CHUNK', stage: 0, source: 'stdout', text: 'world' });
    // Chunk: completes previous and one more
    bus.publish({ type: 'CHUNK', stage: 0, source: 'stdout', text: '\nmore text' });
    // Finalize stage
    bus.publish({ type: 'STAGE_SUCCESS', stage: 0, outputPreview: '' });

    // Find last full-line output (non-CR)
    const lastLine = outputs.filter(o => /\n$/.test(o)).pop() || '';
    expect(lastLine).toMatch(/\b4 words\b/);

    sink.detach();
  });
});

