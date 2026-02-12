import type { StreamExecution as StreamExecutionInterface, StructuredResult, SDKEvent, SDKEventHandler } from './types';
import { ExecutionEmitter } from './execution-emitter';
import { AsyncEventQueue } from './async-event-queue';

export class StreamExecution implements StreamExecutionInterface {
  private completed = false;
  private doneResolve!: () => void;
  private doneReject!: (error: unknown) => void;
  private resultResolve!: (result: StructuredResult) => void;
  private resultReject!: (error: unknown) => void;
  private readonly donePromise: Promise<void>;
  private readonly resultPromise: Promise<StructuredResult>;
  private aborted = false;
  private abortFn?: () => void;
  updateState?: (path: string, value: unknown) => Promise<void>;

  constructor(
    private readonly emitter: ExecutionEmitter,
    options?: {
      abort?: () => void;
      updateState?: (path: string, value: unknown) => Promise<void>;
    }
  ) {
    this.donePromise = new Promise<void>((resolve, reject) => {
      this.doneResolve = resolve;
      this.doneReject = reject;
    });
    this.resultPromise = new Promise<StructuredResult>((resolve, reject) => {
      this.resultResolve = resolve;
      this.resultReject = reject;
    });
    this.abortFn = options?.abort;

    if (options?.updateState) {
      this.updateState = async (path: string, value: unknown): Promise<void> => {
        if (this.completed) {
          throw new Error('StreamExecution already completed');
        }
        await options.updateState?.(path, value);
      };
    }
  }

  on(type: SDKEvent['type'], handler: SDKEventHandler): void {
    this.emitter.on(type, handler);
  }

  off(type: SDKEvent['type'], handler: SDKEventHandler): void {
    this.emitter.off(type, handler);
  }

  once(type: SDKEvent['type'], handler: SDKEventHandler): void {
    this.emitter.once(type, handler);
  }

  done(): Promise<void> {
    return this.donePromise;
  }

  result(): Promise<StructuredResult> {
    return this.resultPromise;
  }

  isComplete(): boolean {
    return this.completed;
  }

  resolve(result: StructuredResult): void {
    if (this.completed) return;
    this.completed = true;
    this.resultResolve(result);
    this.doneResolve();
  }

  reject(error: unknown): void {
    if (this.completed) return;
    this.completed = true;
    this.resultReject(error);
    this.doneReject(error);
  }

  abort = (): void => {
    if (this.aborted || this.completed) return;
    this.aborted = true;
    if (this.abortFn) {
      try {
        this.abortFn();
      } catch (err) {
        // Swallow abort errors; handler will reject below.
        if (process.env.MLLD_DEBUG) {
          console.error('[StreamExecution] Abort function error:', err);
        }
      }
    }
    this.reject(new Error('StreamExecution aborted'));
  };

  async *[Symbol.asyncIterator](): AsyncIterator<SDKEvent> {
    const queue = new AsyncEventQueue<SDKEvent>();
    const eventTypes: SDKEvent['type'][] = [
      'effect',
      'command:start',
      'command:complete',
      'stream:chunk',
      'stream:progress',
      'execution:complete',
      'state:write',
      'debug:directive:start',
      'debug:directive:complete',
      'debug:variable:create',
      'debug:variable:access',
      'debug:guard:before',
      'debug:guard:after',
      'debug:export:registered',
      'debug:import:dynamic'
    ];

    const forward = (event: SDKEvent): void => queue.push(event);
    for (const type of eventTypes) {
      this.emitter.on(type, forward);
    }

    void this.done().then(
      () => queue.end(),
      error => queue.end(error)
    );

    try {
      yield* queue;
    } finally {
      for (const type of eventTypes) {
        this.emitter.off(type, forward);
      }
    }
  }
}
