import { describe, expect, it } from 'vitest';
import { summarizeRuntimeTraceValue } from './RuntimeTraceValue';

describe('summarizeRuntimeTraceValue', () => {
  it('attaches approximate size metadata to array and object summaries', () => {
    expect(summarizeRuntimeTraceValue(['a', 'b', 'c'])).toEqual(
      expect.objectContaining({
        kind: 'array',
        length: 3,
        bytes: expect.any(Number),
        human: expect.stringMatching(/B$/)
      })
    );

    expect(summarizeRuntimeTraceValue({
      id: 'c_1',
      email: 'ada@example.com',
      name: 'Ada'
    })).toEqual(
      expect.objectContaining({
        kind: 'object',
        keys: ['id', 'email', 'name'],
        size: 3,
        bytes: expect.any(Number),
        human: expect.stringMatching(/B$/)
      })
    );
  });

  it('keeps handle summaries compact while still reporting approximate size', () => {
    expect(summarizeRuntimeTraceValue({
      handle: 'h_abc123',
      value: 'ada@example.com',
      preview: 'ada@example.com'
    })).toEqual(
      expect.objectContaining({
        handle: 'h_abc123',
        bytes: expect.any(Number),
        human: expect.stringMatching(/B$/)
      })
    );
  });

  it('keeps scalar summaries stable', () => {
    expect(summarizeRuntimeTraceValue('hello')).toBe('hello');
    expect(summarizeRuntimeTraceValue('x'.repeat(200))).toBe(`${'x'.repeat(157)}...`);
    expect(summarizeRuntimeTraceValue(42)).toBe(42);
    expect(summarizeRuntimeTraceValue(true)).toBe(true);
  });
});
