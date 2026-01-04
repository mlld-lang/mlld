import { describe, it, expect } from 'vitest';
import { createClaudeCodeAdapter } from '@interpreter/streaming/adapters/claude-code';
import { FormatAdapterSink } from '@interpreter/eval/pipeline/stream-sinks/format-adapter';
import { createAccumulator } from '@interpreter/streaming/accumulator';
import { interpolateTemplate, applyTemplates } from '@interpreter/streaming/template-interpolator';
import { expandAnsiCodes } from '@core/utils/ansi-processor';
import type { SDKStreamingEvent } from '@sdk/types';

describe('Streaming Integration Tests', () => {
  describe('End-to-end flow', () => {
    it('should process a complete streaming session', () => {
      const events: SDKStreamingEvent[] = [];
      const adapter = createClaudeCodeAdapter();
      const sink = new FormatAdapterSink({
        adapter,
        accumulate: true,
        visibility: { showAll: true },
        onEvent: (e) => events.push(e)
      });

      // Simulate a streaming session
      const chunks = [
        '{"type":"thinking","thinking":"Analyzing..."}\n',
        '{"type":"text","text":"Here is "}\n',
        '{"type":"text","text":"the answer"}\n',
        '{"type":"tool_use","name":"calculate","input":{"expr":"2+2"},"id":"t1"}\n',
        '{"type":"tool_result","tool_use_id":"t1","content":"4","success":true}\n',
        '{"type":"result","usage":{"input_tokens":50,"output_tokens":25}}\n'
      ];

      for (const chunk of chunks) {
        sink.handle({
          type: 'CHUNK',
          pipelineId: 'test',
          stageIndex: 0,
          chunk,
          source: 'stdout',
          timestamp: Date.now()
        });
      }

      sink.stop();
      const result = sink.getResult();

      // Verify events were emitted
      expect(events.length).toBeGreaterThan(0);
      expect(events.some(e => e.type === 'streaming:thinking')).toBe(true);
      expect(events.some(e => e.type === 'streaming:message')).toBe(true);
      expect(events.some(e => e.type === 'streaming:tool-use')).toBe(true);

      // Verify accumulation
      expect(result.text).toBe('Here is the answer');
      expect(result.thinking).toBe('Analyzing...');
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls![0].name).toBe('calculate');
      expect(result.toolCalls![0].result).toBe('4');
      expect(result.usage?.inputTokens).toBe(50);
      expect(result.usage?.outputTokens).toBe(25);
    });

    it('should handle streamed chunks arriving in fragments', () => {
      const adapter = createClaudeCodeAdapter();
      const sink = new FormatAdapterSink({
        adapter,
        accumulate: true
      });

      // Send JSON split across multiple chunks
      sink.handle({ type: 'CHUNK', pipelineId: 'test', stageIndex: 0, chunk: '{"type":', source: 'stdout', timestamp: Date.now() });
      sink.handle({ type: 'CHUNK', pipelineId: 'test', stageIndex: 0, chunk: '"text","text":', source: 'stdout', timestamp: Date.now() });
      sink.handle({ type: 'CHUNK', pipelineId: 'test', stageIndex: 0, chunk: '"fragmented"}\n', source: 'stdout', timestamp: Date.now() });

      sink.stop();
      const result = sink.getResult();

      expect(result.text).toBe('fragmented');
    });

    it('should handle malformed JSON gracefully', () => {
      const adapter = createClaudeCodeAdapter();
      const sink = new FormatAdapterSink({
        adapter,
        accumulate: true
      });

      sink.handle({
        type: 'CHUNK',
        pipelineId: 'test',
        stageIndex: 0,
        chunk: 'not valid json\n{"type":"text","text":"valid"}\n{broken\n',
        source: 'stdout',
        timestamp: Date.now()
      });

      sink.stop();
      const result = sink.getResult();

      // Valid message should still be captured
      expect(result.text).toBe('valid');
    });
  });

  describe('Template + ANSI integration', () => {
    it('should produce formatted output with colors', () => {
      const data = { text: 'Important message', level: 'error' };
      const template = '%red%[@evt.level]%reset% @evt.text';

      const result = interpolateTemplate(template, data, 'ansi');

      expect(result).toContain('\x1b[31m'); // red
      expect(result).toContain('Important message');
      expect(result).toContain('\x1b[0m'); // reset
    });

    it('should strip ANSI codes in text format', () => {
      const data = { message: 'Hello' };
      const template = '%bold%%red%@evt.message%reset%';

      const textResult = interpolateTemplate(template, data, 'text');
      const ansiResult = interpolateTemplate(template, data, 'ansi');

      expect(textResult).toBe('Hello');
      expect(ansiResult).toContain('\x1b[1m'); // bold
      expect(ansiResult).toContain('\x1b[31m'); // red
    });

    it('should apply templates and produce plain + ansi versions', () => {
      const data = { name: 'test_tool', input: { x: 1 } };
      const templates = {
        text: '[@evt.name] @evt.input',
        ansi: '%cyan%[@evt.name]%reset% @evt.input'
      };

      const output = applyTemplates(data, templates);

      expect(output.plain).toBe('[test_tool] {"x":1}');
      expect(output.ansi).toContain('\x1b[36m'); // cyan
      expect(output.ansi).toContain('[test_tool]');
    });
  });

  describe('Accumulator + Adapter integration', () => {
    it('should accumulate events from adapter parsing', () => {
      const adapter = createClaudeCodeAdapter();
      const accumulator = createAccumulator();

      const stream = [
        '{"type":"thinking","thinking":"Step 1"}\n',
        '{"type":"thinking","thinking":" Step 2"}\n',
        '{"type":"text","text":"Result: "}\n',
        '{"type":"text","text":"42"}\n'
      ].join('');

      const events = adapter.processChunk(stream);
      for (const event of events) {
        accumulator.accumulate(event);
      }

      const result = accumulator.getResult();
      expect(result.thinking).toBe('Step 1 Step 2');
      expect(result.text).toBe('Result: 42');
    });
  });

  describe('Visibility filtering', () => {
    const createTestSink = (visibility: Record<string, boolean>) => {
      const displayed: string[] = [];
      const sink = new FormatAdapterSink({
        adapter: createClaudeCodeAdapter(),
        visibility,
        onEvent: (e) => {
          if (e.displayed) displayed.push(e.type);
        }
      });
      return { sink, displayed };
    };

    const testChunks = [
      '{"type":"thinking","thinking":"..."}\n',
      '{"type":"text","text":"msg"}\n',
      '{"type":"tool_use","name":"t","input":{},"id":"1"}\n',
      '{"type":"result","usage":{"input_tokens":1}}\n'
    ].join('');

    it('should only show messages by default', () => {
      const { sink, displayed } = createTestSink({});
      sink.handle({ type: 'CHUNK', pipelineId: 'test', stageIndex: 0, chunk: testChunks, source: 'stdout', timestamp: Date.now() });
      sink.stop();

      expect(displayed).toContain('streaming:message');
      expect(displayed).not.toContain('streaming:thinking');
      expect(displayed).not.toContain('streaming:tool-use');
    });

    it('should show thinking when enabled', () => {
      const { sink, displayed } = createTestSink({ showThinking: true });
      sink.handle({ type: 'CHUNK', pipelineId: 'test', stageIndex: 0, chunk: testChunks, source: 'stdout', timestamp: Date.now() });
      sink.stop();

      expect(displayed).toContain('streaming:thinking');
      expect(displayed).toContain('streaming:message');
    });

    it('should show tools when enabled', () => {
      const { sink, displayed } = createTestSink({ showTools: true });
      sink.handle({ type: 'CHUNK', pipelineId: 'test', stageIndex: 0, chunk: testChunks, source: 'stdout', timestamp: Date.now() });
      sink.stop();

      expect(displayed).toContain('streaming:tool-use');
      expect(displayed).toContain('streaming:message');
    });

    it('should show everything with showAll', () => {
      const { sink, displayed } = createTestSink({ showAll: true });
      sink.handle({ type: 'CHUNK', pipelineId: 'test', stageIndex: 0, chunk: testChunks, source: 'stdout', timestamp: Date.now() });
      sink.stop();

      expect(displayed).toContain('streaming:thinking');
      expect(displayed).toContain('streaming:message');
      expect(displayed).toContain('streaming:tool-use');
    });
  });

  describe('ANSI color codes', () => {
    it('should expand all color variants', () => {
      const colors = ['red', 'green', 'blue', 'yellow', 'cyan', 'magenta', 'white', 'black'];
      for (const color of colors) {
        const result = expandAnsiCodes(`%${color}%test%reset%`);
        expect(result).toContain('\x1b[');
        expect(result).toContain('test');
      }
    });

    it('should expand bright colors', () => {
      const result = expandAnsiCodes('%brightred%test%reset%');
      expect(result).toContain('\x1b[91m'); // bright red
    });

    it('should expand background colors', () => {
      const result = expandAnsiCodes('%bgblue%test%reset%');
      expect(result).toContain('\x1b[44m'); // blue background
    });

    it('should expand modifiers', () => {
      const bold = expandAnsiCodes('%bold%test%reset%');
      const dim = expandAnsiCodes('%dim%test%reset%');
      const italic = expandAnsiCodes('%italic%test%reset%');

      expect(bold).toContain('\x1b[1m');
      expect(dim).toContain('\x1b[2m');
      expect(italic).toContain('\x1b[3m');
    });

    it('should handle combined styles', () => {
      const result = expandAnsiCodes('%bold%%red%%bgwhite%test%reset%');
      expect(result).toContain('\x1b[1m'); // bold
      expect(result).toContain('\x1b[31m'); // red
      expect(result).toContain('\x1b[47m'); // white bg
    });
  });
});
