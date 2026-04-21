import { describe, it, expect } from 'vitest';
import { createNDJSONAdapter } from '@interpreter/streaming/adapters/ndjson';
import type { AdapterConfig } from '@interpreter/streaming/adapters/base';

/**
 * Verifies that the @opencodeStreamFormat shape defined in
 * modules/opencode/index.mld extracts correctly when fed through
 * mlld's real NDJSONAdapter against real opencode NDJSON events.
 *
 * The config here mirrors the resolved shape of @opencodeStreamFormat
 * (confirmed via `mlld -e 'import ...; show @opencodeStreamFormat'`).
 */
const opencodeStreamFormat: AdapterConfig = {
  name: 'opencode',
  format: 'ndjson',
  schemas: [
    { kind: 'message', matchPath: 'type', matchValue: 'text',
      extract: { chunk: 'part.text' } },
    { kind: 'thinking', matchPath: 'type', matchValue: 'reasoning',
      extract: { text: 'part.text' } },
    { kind: 'tool-use', matchPath: 'type', matchValue: 'tool_use',
      extract: {
        name: 'part.tool',
        id: 'part.callID',
        input: 'part.state.input',
        result: 'part.state.output',
        status: 'part.state.status'
      } },
    { kind: 'metadata', matchPath: 'type', matchValue: 'step_start',
      extract: { sessionId: 'sessionID' } },
    { kind: 'metadata', matchPath: 'type', matchValue: 'step_finish',
      extract: {
        inputTokens: 'part.tokens.input',
        outputTokens: 'part.tokens.output',
        totalTokens: 'part.tokens.total',
        reasoningTokens: 'part.tokens.reasoning',
        cost: 'part.cost',
        reason: 'part.reason'
      } }
  ]
};

// Captured from live `opencode run --format json` output — one event per constant.
const EV = {
  stepStart: '{"type":"step_start","timestamp":1776474305576,"sessionID":"ses_261e16cfcffeV3o85wInFL5Aqm","part":{"id":"prt_d9e1eb423","messageID":"msg_d9e1ea1e4","sessionID":"ses_261e16cfcffeV3o85wInFL5Aqm","snapshot":"9f00ec7c","type":"step-start"}}',
  toolUse: '{"type":"tool_use","timestamp":1776474305611,"sessionID":"ses_261e16cfcffeV3o85wInFL5Aqm","part":{"type":"tool","tool":"bash","callID":"call_6aa308148a","state":{"status":"completed","input":{"command":"echo hello-from-mlld-verify","description":"Echo test"},"output":"hello-from-mlld-verify\\n","title":"Echo test","time":{"start":1776474305608,"end":1776474305610}},"id":"prt_d9e1eb429","sessionID":"ses_261e16cfcffeV3o85wInFL5Aqm","messageID":"msg_d9e1ea1e4"}}',
  stepFinishToolCalls: '{"type":"step_finish","timestamp":1776474305657,"sessionID":"ses_261e16cfcffeV3o85wInFL5Aqm","part":{"id":"prt_d9e1eb44b","reason":"tool-calls","snapshot":"9f00ec7c","messageID":"msg_d9e1ea1e4","sessionID":"ses_261e16cfcffeV3o85wInFL5Aqm","type":"step-finish","tokens":{"total":12288,"input":12257,"output":31,"reasoning":0,"cache":{"write":0,"read":0}},"cost":0.0172962}}',
  text: '{"type":"text","timestamp":1776474307317,"sessionID":"ses_261e16cfcffeV3o85wInFL5Aqm","part":{"id":"prt_d9e1ebaf2","messageID":"msg_d9e1eb49f","sessionID":"ses_261e16cfcffeV3o85wInFL5Aqm","type":"text","text":"Done","time":{"start":1776474307314,"end":1776474307316}}}',
  stepFinishStop: '{"type":"step_finish","timestamp":1776474307374,"sessionID":"ses_261e16cfcffeV3o85wInFL5Aqm","part":{"id":"prt_d9e1ebaf6","reason":"stop","snapshot":"9f00ec7c","messageID":"msg_d9e1eb49f","sessionID":"ses_261e16cfcffeV3o85wInFL5Aqm","type":"step-finish","tokens":{"total":12303,"input":76,"output":3,"reasoning":0,"cache":{"write":0,"read":12224}},"cost":0.00329784}}',
  reasoning: '{"type":"reasoning","timestamp":1776471779952,"sessionID":"ses_26207fb64ffejg5HdlH1jp6u76","part":{"id":"prt_d9df8256b","messageID":"msg_d9df81342","sessionID":"ses_26207fb64ffejg5HdlH1jp6u76","type":"reasoning","text":"17 is prime because it has no divisors other than 1 and itself.","time":{"start":1776471778667,"end":1776471779950}}}'
};

describe('@opencodeStreamFormat extraction', () => {
  it('extracts step_start as metadata with sessionId', () => {
    const adapter = createNDJSONAdapter(opencodeStreamFormat);
    const events = adapter.processChunk(EV.stepStart + '\n');
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe('metadata');
    expect(events[0].data.sessionId).toBe('ses_261e16cfcffeV3o85wInFL5Aqm');
  });

  it('extracts tool_use with fused input and result', () => {
    const adapter = createNDJSONAdapter(opencodeStreamFormat);
    const events = adapter.processChunk(EV.toolUse + '\n');
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe('tool-use');
    expect(events[0].data.name).toBe('bash');
    expect(events[0].data.id).toBe('call_6aa308148a');
    expect(events[0].data.input).toEqual({
      command: 'echo hello-from-mlld-verify',
      description: 'Echo test'
    });
    expect(events[0].data.result).toBe('hello-from-mlld-verify\n');
    expect(events[0].data.status).toBe('completed');
  });

  it('extracts text as message with chunk', () => {
    const adapter = createNDJSONAdapter(opencodeStreamFormat);
    const events = adapter.processChunk(EV.text + '\n');
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe('message');
    expect(events[0].data.chunk).toBe('Done');
  });

  it('extracts reasoning as thinking with text', () => {
    const adapter = createNDJSONAdapter(opencodeStreamFormat);
    const events = adapter.processChunk(EV.reasoning + '\n');
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe('thinking');
    expect(events[0].data.text).toBe(
      '17 is prime because it has no divisors other than 1 and itself.'
    );
  });

  it('extracts step_finish with tokens, cost, and reason', () => {
    const adapter = createNDJSONAdapter(opencodeStreamFormat);
    const events = adapter.processChunk(EV.stepFinishToolCalls + '\n');
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe('metadata');
    expect(events[0].data.inputTokens).toBe(12257);
    expect(events[0].data.outputTokens).toBe(31);
    expect(events[0].data.totalTokens).toBe(12288);
    expect(events[0].data.reasoningTokens).toBe(0);
    expect(events[0].data.cost).toBe(0.0172962);
    expect(events[0].data.reason).toBe('tool-calls');
  });

  it('extracts step_finish reason=stop on terminal turn', () => {
    const adapter = createNDJSONAdapter(opencodeStreamFormat);
    const events = adapter.processChunk(EV.stepFinishStop + '\n');
    expect(events[0].data.reason).toBe('stop');
  });

  it('processes a full tool-calling turn in order', () => {
    const adapter = createNDJSONAdapter(opencodeStreamFormat);
    const raw = [
      EV.stepStart,
      EV.toolUse,
      EV.stepFinishToolCalls,
      EV.stepStart,
      EV.text,
      EV.stepFinishStop
    ].join('\n') + '\n';
    const events = adapter.processChunk(raw);
    const kinds = events.map(e => e.kind);
    expect(kinds).toEqual([
      'metadata',
      'tool-use',
      'metadata',
      'metadata',
      'message',
      'metadata'
    ]);
    expect(events.every(e => e.kind !== 'unknown')).toBe(true);
  });
});
