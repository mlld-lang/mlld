import { describe, it, expect, beforeEach } from 'vitest';
import { NDJSONAdapter, createNDJSONAdapter, COMMON_SCHEMAS } from '@interpreter/streaming/adapters/ndjson';
import { FormatAdapterSink } from '@interpreter/eval/pipeline/stream-sinks/format-adapter';
import type { AdapterConfig, EventSchema } from '@interpreter/streaming/adapters/base';
import type { SDKStreamingEvent } from '@sdk/types';

describe('NDJSONAdapter', () => {
  describe('basic parsing', () => {
    it('should parse single JSON line', () => {
      const config: AdapterConfig = {
        name: 'test',
        format: 'ndjson',
        schemas: [{
          kind: 'message',
          matchPath: 'type',
          matchValue: 'text',
          extract: { chunk: 'text' }
        }]
      };

      const adapter = new NDJSONAdapter(config);
      const events = adapter.processChunk('{"type":"text","text":"hello"}\n');

      expect(events).toHaveLength(1);
      expect(events[0].kind).toBe('message');
      expect(events[0].data.chunk).toBe('hello');
    });

    it('should parse multiple lines', () => {
      const config: AdapterConfig = {
        name: 'test',
        format: 'ndjson',
        schemas: [{
          kind: 'message',
          matchPath: 'type',
          matchValue: 'text',
          extract: { chunk: 'text' }
        }]
      };

      const adapter = new NDJSONAdapter(config);
      const events = adapter.processChunk('{"type":"text","text":"one"}\n{"type":"text","text":"two"}\n');

      expect(events).toHaveLength(2);
      expect(events[0].data.chunk).toBe('one');
      expect(events[1].data.chunk).toBe('two');
    });

    it('should buffer incomplete lines', () => {
      const config: AdapterConfig = {
        name: 'test',
        format: 'ndjson',
        schemas: [{
          kind: 'message',
          matchPath: 'type',
          matchValue: 'text',
          extract: { chunk: 'text' }
        }]
      };

      const adapter = new NDJSONAdapter(config);

      // Partial line
      let events = adapter.processChunk('{"type":"text",');
      expect(events).toHaveLength(0);

      // Complete the line
      events = adapter.processChunk('"text":"buffered"}\n');
      expect(events).toHaveLength(1);
      expect(events[0].data.chunk).toBe('buffered');
    });

    it('should flush remaining buffer', () => {
      const config: AdapterConfig = {
        name: 'test',
        format: 'ndjson',
        schemas: [{
          kind: 'message',
          matchPath: 'type',
          matchValue: 'text',
          extract: { chunk: 'text' }
        }]
      };

      const adapter = new NDJSONAdapter(config);

      // Line without trailing newline
      adapter.processChunk('{"type":"text","text":"no-newline"}');
      const events = adapter.flush();

      expect(events).toHaveLength(1);
      expect(events[0].data.chunk).toBe('no-newline');
    });
  });

  describe('schema matching', () => {
    it('should match schema by type field', () => {
      const config: AdapterConfig = {
        name: 'test',
        format: 'ndjson',
        schemas: [
          { kind: 'thinking', matchPath: 'type', matchValue: 'thinking', extract: { text: 'content' } },
          { kind: 'message', matchPath: 'type', matchValue: 'text', extract: { chunk: 'content' } }
        ]
      };

      const adapter = new NDJSONAdapter(config);

      const events1 = adapter.processChunk('{"type":"thinking","content":"reasoning"}\n');
      expect(events1[0].kind).toBe('thinking');
      expect(events1[0].data.text).toBe('reasoning');

      const events2 = adapter.processChunk('{"type":"text","content":"message"}\n');
      expect(events2[0].kind).toBe('message');
      expect(events2[0].data.chunk).toBe('message');
    });

    it('should use default schema for unmatched events', () => {
      const config: AdapterConfig = {
        name: 'test',
        format: 'ndjson',
        schemas: [
          { kind: 'message', matchPath: 'type', matchValue: 'text', extract: { chunk: 'content' } }
        ],
        defaultSchema: { kind: 'unknown', extract: { raw: 'data' } }
      };

      const adapter = new NDJSONAdapter(config);
      const events = adapter.processChunk('{"type":"unknown","data":"something"}\n');

      expect(events[0].kind).toBe('unknown');
      expect(events[0].data.raw).toBe('something');
    });
  });

  describe('nested extraction', () => {
    it('should extract nested fields', () => {
      const config: AdapterConfig = {
        name: 'test',
        format: 'ndjson',
        schemas: [{
          kind: 'message',
          matchPath: 'type',
          matchValue: 'delta',
          extract: { chunk: 'delta.text' }
        }]
      };

      const adapter = new NDJSONAdapter(config);
      const events = adapter.processChunk('{"type":"delta","delta":{"text":"nested"}}\n');

      expect(events[0].data.chunk).toBe('nested');
    });

    it('should handle array indexing', () => {
      const config: AdapterConfig = {
        name: 'test',
        format: 'ndjson',
        schemas: [{
          kind: 'message',
          matchPath: 'type',
          matchValue: 'content',
          extract: { chunk: 'content[0].text' }
        }]
      };

      const adapter = new NDJSONAdapter(config);
      const events = adapter.processChunk('{"type":"content","content":[{"text":"first"},{"text":"second"}]}\n');

      expect(events[0].data.chunk).toBe('first');
    });

    it('should use fallback paths', () => {
      const config: AdapterConfig = {
        name: 'test',
        format: 'ndjson',
        schemas: [{
          kind: 'message',
          matchPath: 'type',
          matchValue: 'text',
          extract: { chunk: ['primary', 'fallback', 'text'] }
        }]
      };

      const adapter = new NDJSONAdapter(config);
      const events = adapter.processChunk('{"type":"text","text":"from-fallback"}\n');

      expect(events[0].data.chunk).toBe('from-fallback');
    });
  });

  describe('common schemas', () => {
    it('should have Claude Code thinking schema', () => {
      expect(COMMON_SCHEMAS.claudeCodeThinking.kind).toBe('thinking');
      expect(COMMON_SCHEMAS.claudeCodeThinking.matchValue).toBe('thinking');
    });

    it('should have Claude Code message schema', () => {
      expect(COMMON_SCHEMAS.claudeCodeMessage.kind).toBe('message');
      expect(COMMON_SCHEMAS.claudeCodeMessage.matchValue).toBe('text');
    });

    it('should have Claude Code tool-use schema', () => {
      expect(COMMON_SCHEMAS.claudeCodeToolUse.kind).toBe('tool-use');
      expect(COMMON_SCHEMAS.claudeCodeToolUse.matchValue).toBe('tool_use');
    });
  });
});

describe('FormatAdapterSink', () => {
  const createTestAdapter = () => {
    return createNDJSONAdapter({
      name: 'test',
      schemas: [
        { kind: 'thinking', matchPath: 'type', matchValue: 'thinking', extract: { text: 'content' } },
        { kind: 'message', matchPath: 'type', matchValue: 'text', extract: { chunk: 'content' } },
        { kind: 'tool-use', matchPath: 'type', matchValue: 'tool', extract: { name: 'name', input: 'input', id: 'id' } },
        { kind: 'error', matchPath: 'type', matchValue: 'error', extract: { message: 'message' } },
        { kind: 'metadata', matchPath: 'type', matchValue: 'usage', extract: { inputTokens: 'input_tokens', outputTokens: 'output_tokens' } }
      ]
    });
  };

  it('should emit SDK events from parsed chunks', () => {
    const events: SDKStreamingEvent[] = [];
    const sink = new FormatAdapterSink({
      adapter: createTestAdapter(),
      onEvent: (e) => events.push(e)
    });

    sink.handle({
      type: 'CHUNK',
      pipelineId: 'test',
      stageIndex: 0,
      chunk: '{"type":"text","content":"hello"}\n',
      source: 'stdout',
      timestamp: Date.now()
    });

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('streaming:message');
    expect((events[0] as any).chunk).toBe('hello');
  });

  it('should accumulate text messages', () => {
    const sink = new FormatAdapterSink({
      adapter: createTestAdapter(),
      accumulate: true
    });

    sink.handle({
      type: 'CHUNK',
      pipelineId: 'test',
      stageIndex: 0,
      chunk: '{"type":"text","content":"hello "}\n{"type":"text","content":"world"}\n',
      source: 'stdout',
      timestamp: Date.now()
    });

    sink.stop();
    const result = sink.getResult();

    expect(result.text).toBe('hello world');
  });

  it('should accumulate thinking separately', () => {
    const sink = new FormatAdapterSink({
      adapter: createTestAdapter(),
      accumulate: true
    });

    sink.handle({
      type: 'CHUNK',
      pipelineId: 'test',
      stageIndex: 0,
      chunk: '{"type":"thinking","content":"Let me think..."}\n{"type":"text","content":"Answer"}\n',
      source: 'stdout',
      timestamp: Date.now()
    });

    sink.stop();
    const result = sink.getResult();

    expect(result.thinking).toBe('Let me think...');
    expect(result.text).toBe('Answer');
  });

  it('should collect tool calls', () => {
    const sink = new FormatAdapterSink({
      adapter: createTestAdapter(),
      accumulate: true
    });

    sink.handle({
      type: 'CHUNK',
      pipelineId: 'test',
      stageIndex: 0,
      chunk: '{"type":"tool","name":"read_file","input":{"path":"test.txt"},"id":"tool-1"}\n',
      source: 'stdout',
      timestamp: Date.now()
    });

    sink.stop();
    const result = sink.getResult();

    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls![0].name).toBe('read_file');
    expect(result.toolCalls![0].input).toEqual({ path: 'test.txt' });
  });

  it('should track usage metadata', () => {
    const sink = new FormatAdapterSink({
      adapter: createTestAdapter(),
      accumulate: true
    });

    sink.handle({
      type: 'CHUNK',
      pipelineId: 'test',
      stageIndex: 0,
      chunk: '{"type":"usage","input_tokens":100,"output_tokens":50}\n',
      source: 'stdout',
      timestamp: Date.now()
    });

    sink.stop();
    const result = sink.getResult();

    expect(result.usage?.inputTokens).toBe(100);
    expect(result.usage?.outputTokens).toBe(50);
    expect(result.usage?.totalTokens).toBe(150);
  });

  it('should collect errors', () => {
    const sink = new FormatAdapterSink({
      adapter: createTestAdapter(),
      accumulate: true
    });

    sink.handle({
      type: 'CHUNK',
      pipelineId: 'test',
      stageIndex: 0,
      chunk: '{"type":"error","message":"Something went wrong"}\n',
      source: 'stdout',
      timestamp: Date.now()
    });

    sink.stop();
    const result = sink.getResult();

    expect(result.errors).toHaveLength(1);
    expect(result.errors![0].message).toBe('Something went wrong');
  });

  it('should respect visibility settings', () => {
    const events: SDKStreamingEvent[] = [];
    const sink = new FormatAdapterSink({
      adapter: createTestAdapter(),
      visibility: { showThinking: false, showTools: false },
      onEvent: (e) => events.push(e)
    });

    sink.handle({
      type: 'CHUNK',
      pipelineId: 'test',
      stageIndex: 0,
      chunk: '{"type":"thinking","content":"hidden"}\n{"type":"text","content":"visible"}\n',
      source: 'stdout',
      timestamp: Date.now()
    });

    expect(events).toHaveLength(2);
    expect((events[0] as any).displayed).toBe(false);
    expect((events[1] as any).displayed).toBe(true);
  });

  it('should keep raw events when requested', () => {
    const sink = new FormatAdapterSink({
      adapter: createTestAdapter(),
      keepRawEvents: true
    });

    sink.handle({
      type: 'CHUNK',
      pipelineId: 'test',
      stageIndex: 0,
      chunk: '{"type":"text","content":"test"}\n',
      source: 'stdout',
      timestamp: Date.now()
    });

    sink.stop();
    const result = sink.getResult();

    expect(result.events).toHaveLength(1);
    expect(result.events![0].type).toBe('streaming:message');
  });
});
