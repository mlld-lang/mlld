/**
 * Base types for streaming format adapters.
 *
 * Adapters parse streaming output from executors (NDJSON, SSE, etc.)
 * and extract structured events that can be displayed or accumulated.
 */

import { extractWithFallback } from '../jsonpath';

export type ParsedEventKind =
  | 'thinking'
  | 'message'
  | 'tool-use'
  | 'tool-result'
  | 'error'
  | 'metadata'
  | 'unknown';

export interface ParsedEvent {
  kind: ParsedEventKind;
  data: Record<string, unknown>;
  raw?: unknown;
  timestamp?: number;
  templates?: EventTemplate;
}

export interface ExtractionConfig {
  [field: string]: string | string[];
}

export interface EventTemplate {
  text?: string;
  ansi?: string;
  json?: string;
}

export interface EventSchema {
  kind: ParsedEventKind;
  match?: Record<string, unknown>;
  matchPath?: string;
  matchValue?: unknown;
  extract: ExtractionConfig;
  templates?: EventTemplate;
  visibility?: 'always' | 'hidden' | 'optional';
}

export interface AdapterConfig {
  name: string;
  format: 'ndjson' | 'sse' | 'text';
  schemas: EventSchema[];
  defaultSchema?: EventSchema;
}

export interface StreamAdapter {
  readonly name: string;
  readonly format: 'ndjson' | 'sse' | 'text';

  processChunk(chunk: string): ParsedEvent[];
  flush(): ParsedEvent[];
  reset(): void;
}

export abstract class BaseStreamAdapter implements StreamAdapter {
  abstract readonly name: string;
  abstract readonly format: 'ndjson' | 'sse' | 'text';

  protected buffer: string = '';
  protected config: AdapterConfig;

  constructor(config: AdapterConfig) {
    this.config = config;
  }

  abstract processChunk(chunk: string): ParsedEvent[];

  flush(): ParsedEvent[] {
    if (!this.buffer.trim()) {
      return [];
    }
    const remaining = this.processRemainingBuffer();
    this.buffer = '';
    return remaining;
  }

  reset(): void {
    this.buffer = '';
  }

  protected processRemainingBuffer(): ParsedEvent[] {
    return [];
  }

  protected matchSchema(obj: unknown): EventSchema | undefined {
    if (!obj || typeof obj !== 'object') {
      return this.config.defaultSchema;
    }

    for (const schema of this.config.schemas) {
      if (this.schemaMatches(obj, schema)) {
        return schema;
      }
    }

    return this.config.defaultSchema;
  }

  protected schemaMatches(obj: unknown, schema: EventSchema): boolean {
    if (!obj || typeof obj !== 'object') return false;

    if (schema.match) {
      for (const [key, expectedValue] of Object.entries(schema.match)) {
        const actualValue = this.getNestedValue(obj as Record<string, unknown>, key);
        if (actualValue !== expectedValue) {
          return false;
        }
      }
      return true;
    }

    if (schema.matchPath && schema.matchValue !== undefined) {
      const actualValue = this.getNestedValue(obj as Record<string, unknown>, schema.matchPath);
      return actualValue === schema.matchValue;
    }

    return false;
  }

  protected extractData(obj: unknown, config: ExtractionConfig): Record<string, unknown> {
    if (!obj || typeof obj !== 'object') {
      return {};
    }

    const result: Record<string, unknown> = {};

    for (const [field, pathOrPaths] of Object.entries(config)) {
      const value = extractWithFallback(obj, pathOrPaths, { returnUndefined: true });
      if (value !== undefined) {
        result[field] = value;
      }
    }

    return result;
  }

  protected getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    return extractWithFallback(obj, path, { returnUndefined: true });
  }
}
