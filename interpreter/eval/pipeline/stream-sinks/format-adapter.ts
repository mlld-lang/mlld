/**
 * FormatAdapterSink
 *
 * StreamBus sink that uses a StreamAdapter to parse incoming chunks
 * and emit structured SDK events.
 */

import type { StreamEvent } from '../stream-bus';
import type { StreamSink } from './interfaces';
import type { StreamAdapter, ParsedEvent, ParsedEventKind, EventTemplate } from '@interpreter/streaming/adapters/base';
import type { StreamingVisibility } from '../streaming-options';
import type {
  SDKStreamingEvent,
  SDKStreamingThinkingEvent,
  SDKStreamingMessageEvent,
  SDKStreamingToolUseEvent,
  SDKStreamingToolResultEvent,
  SDKStreamingErrorEvent,
  SDKStreamingMetadataEvent,
  StreamingResult,
  StreamingToolCall
} from '@sdk/types';
import { getFormattedText } from '@core/utils/ansi-processor';
import { applyTemplates, DEFAULT_TEMPLATES, type FormattedOutput } from '@interpreter/streaming/template-interpolator';
import type { Environment } from '@interpreter/env/Environment';

export interface FormatAdapterSinkOptions {
  adapter: StreamAdapter;
  visibility?: StreamingVisibility;
  onEvent?: (event: SDKStreamingEvent) => void;
  accumulate?: boolean;
  keepRawEvents?: boolean;
  env?: Environment;  // For emitting output effects
  emitToOutput?: boolean;  // Whether to emit formatted text to output
}

export class FormatAdapterSink implements StreamSink {
  private adapter: StreamAdapter;
  private visibility: StreamingVisibility;
  private onEvent?: (event: SDKStreamingEvent) => void;
  private accumulate: boolean;
  private keepRawEvents: boolean;
  private env?: Environment;
  private emitToOutput: boolean;

  // Accumulation state
  private accumulatedText: string[] = [];
  private accumulatedThinking: string[] = [];
  private toolCalls: StreamingToolCall[] = [];
  private toolCallsById: Map<string, StreamingToolCall> = new Map();
  private errors: SDKStreamingErrorEvent[] = [];
  private lastUsage?: { inputTokens?: number; outputTokens?: number };
  private allEvents: SDKStreamingEvent[] = [];

  constructor(options: FormatAdapterSinkOptions) {
    this.adapter = options.adapter;
    this.visibility = options.visibility || {};
    this.onEvent = options.onEvent;
    this.accumulate = options.accumulate !== false;
    this.keepRawEvents = options.keepRawEvents === true;
    this.env = options.env;
    this.emitToOutput = options.emitToOutput !== false;
  }

  handle(event: StreamEvent): void {
    if (event.type !== 'CHUNK') return;

    const parsed = this.adapter.processChunk(event.chunk);
    for (const parsedEvent of parsed) {
      this.processParsedEvent(parsedEvent);
    }
  }

  stop(): void {
    // Flush remaining buffer
    const remaining = this.adapter.flush();
    for (const parsedEvent of remaining) {
      this.processParsedEvent(parsedEvent);
    }
    this.adapter.reset();
  }

  getResult(): StreamingResult {
    const result: StreamingResult = {};

    if (this.accumulatedText.length > 0) {
      result.text = this.accumulatedText.join('');
    }

    if (this.accumulatedThinking.length > 0) {
      result.thinking = this.accumulatedThinking.join('');
    }

    if (this.toolCalls.length > 0) {
      result.toolCalls = [...this.toolCalls];
    }

    if (this.lastUsage) {
      result.usage = {
        ...this.lastUsage,
        totalTokens: (this.lastUsage.inputTokens || 0) + (this.lastUsage.outputTokens || 0)
      };
    }

    if (this.errors.length > 0) {
      result.errors = [...this.errors];
    }

    if (this.keepRawEvents && this.allEvents.length > 0) {
      result.events = [...this.allEvents];
    }

    return result;
  }

  private processParsedEvent(parsed: ParsedEvent): void {
    const sdkEvent = this.toSDKEvent(parsed);
    if (!sdkEvent) return;

    // Emit to output if configured
    if (this.emitToOutput && this.env && sdkEvent.displayed) {
      this.emitEventToOutput(sdkEvent);
    }

    // Accumulate
    if (this.accumulate) {
      this.accumulateEvent(sdkEvent);
    }

    // Keep raw events if requested
    if (this.keepRawEvents) {
      this.allEvents.push(sdkEvent);
    }

    // Emit event to SDK listeners
    this.onEvent?.(sdkEvent);
  }

  private emitEventToOutput(event: SDKStreamingEvent): void {
    if (!this.env) return;

    // Use 'both' for streaming output so it goes to stdout during streaming
    // AND to the document buffer for normalized output
    switch (event.type) {
      case 'streaming:thinking':
        if (event.formatted?.plain) {
          this.env.emitEffect('both', event.formatted.plain + '\n\n');
        }
        break;

      case 'streaming:message':
        // Emit chunks directly for streaming feel
        this.env.emitEffect('both', event.chunk);
        break;

      case 'streaming:tool-use':
        if (event.formatted?.plain) {
          this.env.emitEffect('both', '\n' + event.formatted.plain + '\n');
        }
        break;

      case 'streaming:tool-result':
        if (event.formatted?.plain) {
          this.env.emitEffect('both', event.formatted.plain + '\n');
        }
        break;

      case 'streaming:error':
        if (event.formatted?.plain) {
          this.env.emitEffect('stderr', event.formatted.plain + '\n');
        } else {
          this.env.emitEffect('stderr', `Error: ${event.message}\n`);
        }
        break;

      case 'streaming:metadata':
        // Metadata usually not emitted to output
        break;
    }
  }

  private toSDKEvent(parsed: ParsedEvent): SDKStreamingEvent | null {
    const { kind, data, timestamp, templates } = parsed;
    const ts = timestamp || Date.now();

    switch (kind) {
      case 'thinking': {
        const text = String(data.text || '');
        const formatted = this.getFormatted(data, templates, 'thinking', text);
        return {
          type: 'streaming:thinking',
          text,
          depth: typeof data.depth === 'number' ? data.depth : undefined,
          formatted,
          displayed: this.shouldDisplay('thinking'),
          timestamp: ts
        } as SDKStreamingThinkingEvent;
      }

      case 'message': {
        const chunk = String(data.chunk || '');
        const formatted = this.getFormatted(data, templates, 'message', chunk);
        return {
          type: 'streaming:message',
          chunk,
          role: typeof data.role === 'string' ? data.role : undefined,
          formatted,
          displayed: this.shouldDisplay('message'),
          timestamp: ts
        } as SDKStreamingMessageEvent;
      }

      case 'tool-use': {
        const formatted = this.getFormatted(data, templates, 'toolUse', `Tool: ${data.name}`);
        return {
          type: 'streaming:tool-use',
          name: String(data.name || 'unknown'),
          input: data.input,
          id: typeof data.id === 'string' ? data.id : undefined,
          formatted,
          displayed: this.shouldDisplay('tool'),
          timestamp: ts
        } as SDKStreamingToolUseEvent;
      }

      case 'tool-result': {
        const formatted = this.getFormatted(data, templates, 'toolResult');
        // Handle both 'success' and 'is_error' (Claude Code uses is_error, inverted)
        let success: boolean | undefined;
        if (typeof data.success === 'boolean') {
          success = data.success;
        } else if (typeof data.isError === 'boolean') {
          success = !data.isError;
        }
        return {
          type: 'streaming:tool-result',
          toolUseId: typeof data.toolUseId === 'string' ? data.toolUseId : undefined,
          result: data.result,
          success,
          formatted,
          displayed: this.shouldDisplay('tool'),
          timestamp: ts
        } as SDKStreamingToolResultEvent;
      }

      case 'error': {
        const formatted = this.getFormatted(data, templates, 'error', String(data.message || 'Unknown error'));
        return {
          type: 'streaming:error',
          message: String(data.message || 'Unknown error'),
          code: typeof data.code === 'string' ? data.code : undefined,
          formatted,
          displayed: true,
          timestamp: ts
        } as SDKStreamingErrorEvent;
      }

      case 'metadata': {
        const formatted = this.getFormatted(data, templates, 'metadata');
        return {
          type: 'streaming:metadata',
          usage: {
            inputTokens: typeof data.inputTokens === 'number' ? data.inputTokens : undefined,
            outputTokens: typeof data.outputTokens === 'number' ? data.outputTokens : undefined
          },
          model: typeof data.model === 'string' ? data.model : undefined,
          formatted,
          timestamp: ts
        } as SDKStreamingMetadataEvent;
      }

      case 'unknown':
        // Unknown events are malformed JSON lines that couldn't be parsed
        // For JSON streaming formats (ndjson), these are expected errors when
        // the executor outputs non-JSON text. Skip them silently.
        // Note: Plain text streaming (sh/bash) should NOT use streamFormat.
        // Without streamFormat, the terminal sink handles output directly.
        return null;

      default:
        return null;
    }
  }

  private getFormatted(
    data: Record<string, unknown>,
    templates: EventTemplate | undefined,
    defaultTemplateKey: keyof typeof DEFAULT_TEMPLATES,
    fallbackText?: string
  ): FormattedOutput | undefined {
    // Use custom templates if provided
    if (templates && (templates.text || templates.ansi)) {
      return applyTemplates(data, templates);
    }

    // Use default templates if available
    const defaultTemplate = DEFAULT_TEMPLATES[defaultTemplateKey];
    if (defaultTemplate) {
      return applyTemplates(data, defaultTemplate);
    }

    // Fallback to simple text formatting
    if (fallbackText) {
      return getFormattedText(fallbackText);
    }

    return undefined;
  }

  private shouldDisplay(eventType: 'thinking' | 'message' | 'tool' | 'metadata'): boolean {
    if (this.visibility.showAll) return true;

    switch (eventType) {
      case 'thinking':
        return this.visibility.showThinking === true;
      case 'message':
        return true;
      case 'tool':
        return this.visibility.showTools === true;
      case 'metadata':
        return this.visibility.showMetadata === true;
      default:
        return false;
    }
  }

  private accumulateEvent(event: SDKStreamingEvent): void {
    switch (event.type) {
      case 'streaming:thinking':
        this.accumulatedThinking.push(event.text);
        break;

      case 'streaming:message':
        this.accumulatedText.push(event.chunk);
        break;

      case 'streaming:tool-use': {
        const toolCall: StreamingToolCall = {
          name: event.name,
          input: event.input,
          id: event.id
        };
        this.toolCalls.push(toolCall);
        if (event.id) {
          this.toolCallsById.set(event.id, toolCall);
        }
        break;
      }

      case 'streaming:tool-result': {
        // Match with tool call by ID
        if (event.toolUseId && this.toolCallsById.has(event.toolUseId)) {
          const toolCall = this.toolCallsById.get(event.toolUseId)!;
          toolCall.result = event.result;
          toolCall.success = event.success;
        }
        break;
      }

      case 'streaming:error':
        this.errors.push(event);
        break;

      case 'streaming:metadata':
        if (event.usage) {
          this.lastUsage = {
            inputTokens: event.usage.inputTokens,
            outputTokens: event.usage.outputTokens
          };
        }
        break;
    }
  }
}
