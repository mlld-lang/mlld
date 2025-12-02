/**
 * NDJSON (Newline-Delimited JSON) Stream Adapter
 *
 * Parses NDJSON streams into structured events.
 * Each line is a complete JSON object.
 */

import {
  BaseStreamAdapter,
  type AdapterConfig,
  type ParsedEvent,
  type EventSchema
} from './base';

export class NDJSONAdapter extends BaseStreamAdapter {
  readonly name: string;
  readonly format = 'ndjson' as const;

  constructor(config: AdapterConfig) {
    super(config);
    this.name = config.name;
  }

  processChunk(chunk: string): ParsedEvent[] {
    this.buffer += chunk;
    const events: ParsedEvent[] = [];

    // Process complete lines
    const lines = this.buffer.split('\n');

    // Keep incomplete last line in buffer
    this.buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const event = this.parseLine(trimmed);
      if (event) {
        events.push(event);
      }
    }

    return events;
  }

  protected override processRemainingBuffer(): ParsedEvent[] {
    const trimmed = this.buffer.trim();
    if (!trimmed) {
      return [];
    }

    const event = this.parseLine(trimmed);
    return event ? [event] : [];
  }

  private parseLine(line: string): ParsedEvent | null {
    let parsed: unknown;

    try {
      parsed = JSON.parse(line);
    } catch {
      // Not valid JSON, emit as unknown
      return {
        kind: 'unknown',
        data: { raw: line },
        raw: line,
        timestamp: Date.now()
      };
    }

    // Match against schemas
    const schema = this.matchSchema(parsed);

    if (!schema) {
      return {
        kind: 'unknown',
        data: parsed as Record<string, unknown>,
        raw: parsed,
        timestamp: Date.now()
      };
    }

    // Extract data according to schema
    const data = this.extractData(parsed, schema.extract);

    return {
      kind: schema.kind,
      data,
      raw: parsed,
      timestamp: Date.now(),
      templates: schema.templates
    };
  }
}

export function createNDJSONAdapter(config: Omit<AdapterConfig, 'format'>): NDJSONAdapter {
  return new NDJSONAdapter({ ...config, format: 'ndjson' });
}

// Pre-built schema patterns for common NDJSON formats
export const COMMON_SCHEMAS = {
  // Claude Code SDK format
  claudeCodeThinking: {
    kind: 'thinking' as const,
    matchPath: 'type',
    matchValue: 'thinking',
    extract: {
      text: ['thinking', 'content', 'message'],
      depth: 'depth'
    },
    visibility: 'optional' as const
  },

  claudeCodeMessage: {
    kind: 'message' as const,
    matchPath: 'type',
    matchValue: 'text',
    extract: {
      chunk: ['text', 'content', 'delta.text'],
      role: 'role'
    },
    visibility: 'always' as const
  },

  claudeCodeToolUse: {
    kind: 'tool-use' as const,
    matchPath: 'type',
    matchValue: 'tool_use',
    extract: {
      name: ['name', 'tool_name'],
      input: ['input', 'parameters'],
      id: ['id', 'tool_use_id']
    },
    visibility: 'optional' as const
  },

  claudeCodeToolResult: {
    kind: 'tool-result' as const,
    matchPath: 'type',
    matchValue: 'tool_result',
    extract: {
      result: ['content', 'result', 'output'],
      toolUseId: ['tool_use_id', 'id'],
      success: 'success',
      isError: 'is_error'  // Claude Code uses is_error (inverted)
    },
    visibility: 'optional' as const
  },

  claudeCodeError: {
    kind: 'error' as const,
    matchPath: 'type',
    matchValue: 'error',
    extract: {
      message: ['message', 'error.message', 'error'],
      code: ['code', 'error.code']
    },
    visibility: 'always' as const
  },

  claudeCodeUsage: {
    kind: 'metadata' as const,
    matchPath: 'type',
    matchValue: 'result',
    extract: {
      inputTokens: ['usage.input_tokens', 'input_tokens'],
      outputTokens: ['usage.output_tokens', 'output_tokens'],
      model: 'model'
    },
    visibility: 'optional' as const
  },

  // Generic content_block_delta (Anthropic API format)
  contentBlockDelta: {
    kind: 'message' as const,
    matchPath: 'type',
    matchValue: 'content_block_delta',
    extract: {
      chunk: ['delta.text', 'delta.partial_json'],
      index: 'index'
    },
    visibility: 'always' as const
  },

  // Generic message_delta (Anthropic API format)
  messageDelta: {
    kind: 'metadata' as const,
    matchPath: 'type',
    matchValue: 'message_delta',
    extract: {
      stopReason: 'delta.stop_reason',
      inputTokens: 'usage.input_tokens',
      outputTokens: 'usage.output_tokens'
    },
    visibility: 'optional' as const
  }
} satisfies Record<string, EventSchema>;
