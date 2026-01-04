import type { Environment } from '@interpreter/env/Environment';
import type { StreamingOptions } from '@interpreter/eval/pipeline/streaming-options';
import { StreamBus, type StreamEvent } from '@interpreter/eval/pipeline/stream-bus';
import { TerminalSink } from '@interpreter/eval/pipeline/stream-sinks/terminal';
import { ProgressOnlySink } from '@interpreter/eval/pipeline/stream-sinks/progress';
import type { StreamAdapter } from './adapters/base';
import { FormatAdapterSink, type FormatAdapterSinkOptions } from '@interpreter/eval/pipeline/stream-sinks/format-adapter';
import type { StreamingResult } from '@sdk/types';

type Unsubscribe = () => void;

export interface StreamingManagerConfig {
  env: Environment;
  streamingEnabled: boolean;
  streamingOptions: StreamingOptions;
  adapter?: StreamAdapter;
  formatOptions?: Partial<FormatAdapterSinkOptions>;
}

export class StreamingManager {
  private bus: StreamBus;
  private unsubscribes: Unsubscribe[] = [];
  private formatSink: FormatAdapterSink | null = null;

  constructor(bus?: StreamBus) {
    this.bus = bus ?? new StreamBus();
  }

  getBus(): StreamBus {
    return this.bus;
  }

  getFormatSink(): FormatAdapterSink | null {
    return this.formatSink;
  }

  /**
   * Configure sinks for the current execution.
   * - If adapter provided, attaches FormatAdapterSink (no terminal sink)
   * - Otherwise attaches default TerminalSink + ProgressOnlySink when streaming is enabled
   */
  configure(config: StreamingManagerConfig): void {
    this.teardown();

    const { env, streamingEnabled, streamingOptions, adapter, formatOptions } = config;
    if (!streamingEnabled) {
      return;
    }

    if (adapter) {
      this.formatSink = new FormatAdapterSink({
        adapter,
        visibility: streamingOptions.visibility,
        accumulate: streamingOptions.accumulate,
        keepRawEvents: streamingOptions.keepRawEvents,
        env,
        emitToOutput: true,
        onEvent: event => {
          try {
            env.emitSDKEvent(event);
          } catch {
            // Swallow SDK emission errors to avoid breaking streaming
          }
        },
        ...(formatOptions ?? {})
      });
      const unsub = this.bus.subscribe(event => this.formatSink?.handle(event));
      this.unsubscribes.push(unsub);
      this.unsubscribes.push(() => this.formatSink?.stop());
      return;
    }

    // Default sinks: progress + terminal
    const progressSink = new ProgressOnlySink({
      useTTY: process.stderr.isTTY,
      writer: process.stderr
    });
    const progressUnsub = this.bus.subscribe(event => progressSink.handle(event));
    this.unsubscribes.push(() => {
      progressUnsub();
      progressSink.stop?.();
    });

    const terminalSink = new TerminalSink();
    const terminalUnsub = this.bus.subscribe(event => terminalSink.handle(event));
    this.unsubscribes.push(terminalUnsub);
  }

  /**
   * Stop sinks and return accumulated streaming result when using a format adapter.
   */
  finalizeResults(): { streaming?: StreamingResult; events?: StreamEvent[] } {
    const formatSink = this.formatSink;
    this.teardown();
    if (formatSink) {
      return { streaming: formatSink.getResult() };
    }
    return {};
  }

  teardown(): void {
    for (const unsub of this.unsubscribes) {
      try {
        unsub();
      } catch {
        // best-effort teardown
      }
    }
    this.unsubscribes = [];
    this.formatSink = null;
  }
}
