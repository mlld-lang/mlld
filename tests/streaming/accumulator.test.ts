import { describe, it, expect, vi } from 'vitest';
import {
  StreamingAccumulator,
  createAccumulator,
  createTextAccumulator,
  createProgressAccumulator,
  DEFAULT_ACCUMULATION_CONFIG,
  type AccumulationProgress
} from '@interpreter/streaming/accumulator';
import type { ParsedEvent } from '@interpreter/streaming/adapters/base';

describe('StreamingAccumulator', () => {
  describe('text concatenation', () => {
    it('should concatenate message chunks', () => {
      const acc = createAccumulator();

      acc.accumulate({ kind: 'message', data: { chunk: 'Hello ' }, timestamp: Date.now() });
      acc.accumulate({ kind: 'message', data: { chunk: 'world!' }, timestamp: Date.now() });

      const result = acc.getResult();
      expect(result.text).toBe('Hello world!');
    });

    it('should concatenate thinking text', () => {
      const acc = createAccumulator();

      acc.accumulate({ kind: 'thinking', data: { text: 'Let me think...' }, timestamp: Date.now() });
      acc.accumulate({ kind: 'thinking', data: { text: ' More thinking.' }, timestamp: Date.now() });

      const result = acc.getResult();
      expect(result.thinking).toBe('Let me think... More thinking.');
    });

    it('should handle empty result', () => {
      const acc = createAccumulator();
      const result = acc.getResult();

      expect(result.text).toBeUndefined();
      expect(result.thinking).toBeUndefined();
    });
  });

  describe('tool call collection', () => {
    it('should collect tool uses', () => {
      const acc = createAccumulator();

      acc.accumulate({
        kind: 'tool-use',
        data: { name: 'read_file', input: { path: 'test.txt' }, id: 'tool-1' },
        timestamp: Date.now()
      });

      acc.accumulate({
        kind: 'tool-use',
        data: { name: 'write_file', input: { path: 'out.txt' }, id: 'tool-2' },
        timestamp: Date.now()
      });

      const result = acc.getResult();
      expect(result.toolCalls).toHaveLength(2);
      expect(result.toolCalls![0].name).toBe('read_file');
      expect(result.toolCalls![1].name).toBe('write_file');
    });

    it('should match tool results with tool calls', () => {
      const acc = createAccumulator();

      acc.accumulate({
        kind: 'tool-use',
        data: { name: 'read_file', input: { path: 'test.txt' }, id: 'tool-1' },
        timestamp: Date.now()
      });

      acc.accumulate({
        kind: 'tool-result',
        data: { toolUseId: 'tool-1', result: 'file contents', success: true },
        timestamp: Date.now()
      });

      const result = acc.getResult();
      expect(result.toolCalls![0].result).toBe('file contents');
      expect(result.toolCalls![0].success).toBe(true);
    });
  });

  describe('metadata capture', () => {
    it('should capture usage metadata', () => {
      const acc = createAccumulator();

      acc.accumulate({
        kind: 'metadata',
        data: { inputTokens: 100, outputTokens: 50 },
        timestamp: Date.now()
      });

      const result = acc.getResult();
      expect(result.usage).toEqual({
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150
      });
    });

    it('should capture last metadata value', () => {
      const acc = createAccumulator();

      acc.accumulate({
        kind: 'metadata',
        data: { inputTokens: 50, outputTokens: 25 },
        timestamp: Date.now()
      });

      acc.accumulate({
        kind: 'metadata',
        data: { inputTokens: 100, outputTokens: 50 },
        timestamp: Date.now()
      });

      const result = acc.getResult();
      expect(result.usage?.inputTokens).toBe(100);
    });
  });

  describe('error collection', () => {
    it('should collect errors from SDK events', () => {
      const acc = createAccumulator();

      acc.accumulateSDKEvent({
        type: 'streaming:error',
        message: 'Something went wrong',
        displayed: true,
        timestamp: Date.now()
      });

      const result = acc.getResult();
      expect(result.errors).toHaveLength(1);
      expect(result.errors![0].message).toBe('Something went wrong');
    });
  });

  describe('reset', () => {
    it('should clear all accumulated data', () => {
      const acc = createAccumulator();

      acc.accumulate({ kind: 'message', data: { chunk: 'Hello' }, timestamp: Date.now() });
      acc.reset();

      const result = acc.getResult();
      expect(result.text).toBeUndefined();
    });
  });

  describe('progress tracking', () => {
    it('should emit progress events', () => {
      const progressEvents: AccumulationProgress[] = [];
      const acc = createProgressAccumulator((p) => progressEvents.push(p));

      acc.accumulate({ kind: 'message', data: { chunk: 'Hello' }, timestamp: Date.now() });
      acc.accumulate({ kind: 'message', data: { chunk: ' world' }, timestamp: Date.now() });

      expect(progressEvents).toHaveLength(2);
      expect(progressEvents[0].field).toBe('text');
      expect(progressEvents[0].value).toBe('Hello');
      expect(progressEvents[1].value).toBe('Hello world');
    });
  });

  describe('createTextAccumulator', () => {
    it('should only accumulate text', () => {
      const acc = createTextAccumulator();

      acc.accumulate({ kind: 'message', data: { chunk: 'Hello' }, timestamp: Date.now() });
      acc.accumulate({ kind: 'thinking', data: { text: 'Thinking...' }, timestamp: Date.now() });

      const result = acc.getResult();
      expect(result.text).toBe('Hello');
      expect(result.thinking).toBeUndefined();
    });
  });

  describe('custom configuration', () => {
    it('should use custom accumulation rules', () => {
      const acc = new StreamingAccumulator({
        config: {
          concat: [
            { from: ['message'], field: 'chunk', separator: '\n', to: 'text' }
          ]
        }
      });

      acc.accumulate({ kind: 'message', data: { chunk: 'Line 1' }, timestamp: Date.now() });
      acc.accumulate({ kind: 'message', data: { chunk: 'Line 2' }, timestamp: Date.now() });

      const result = acc.getResult();
      expect(result.text).toBe('Line 1\nLine 2');
    });
  });

  describe('DEFAULT_ACCUMULATION_CONFIG', () => {
    it('should have concat rules for text and thinking', () => {
      expect(DEFAULT_ACCUMULATION_CONFIG.concat).toHaveLength(2);
      expect(DEFAULT_ACCUMULATION_CONFIG.concat![0].to).toBe('text');
      expect(DEFAULT_ACCUMULATION_CONFIG.concat![1].to).toBe('thinking');
    });

    it('should have collect rule for toolCalls', () => {
      expect(DEFAULT_ACCUMULATION_CONFIG.collect).toHaveLength(1);
      expect(DEFAULT_ACCUMULATION_CONFIG.collect![0].to).toBe('toolCalls');
    });

    it('should have capture rule for usage', () => {
      expect(DEFAULT_ACCUMULATION_CONFIG.capture).toHaveLength(1);
      expect(DEFAULT_ACCUMULATION_CONFIG.capture![0].to).toBe('usage');
    });
  });

  describe('getEvents', () => {
    it('should return all accumulated SDK events', () => {
      const acc = createAccumulator();

      acc.accumulateSDKEvent({
        type: 'streaming:message',
        chunk: 'Hello',
        displayed: true,
        timestamp: Date.now()
      });

      acc.accumulateSDKEvent({
        type: 'streaming:thinking',
        text: 'Thinking...',
        displayed: false,
        timestamp: Date.now()
      });

      const events = acc.getEvents();
      expect(events).toHaveLength(2);
      expect(events[0].type).toBe('streaming:message');
      expect(events[1].type).toBe('streaming:thinking');
    });
  });
});
