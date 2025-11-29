import type { StreamExecution as StreamExecutionInterface, StructuredResult, SDKEvent, SDKEventHandler } from './types';
import { ExecutionEmitter } from './execution-emitter';

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

  constructor(private readonly emitter: ExecutionEmitter, options?: { abort?: () => void }) {
    this.donePromise = new Promise<void>((resolve, reject) => {
      this.doneResolve = resolve;
      this.doneReject = reject;
    });
    this.resultPromise = new Promise<StructuredResult>((resolve, reject) => {
      this.resultResolve = resolve;
      this.resultReject = reject;
    });
    this.abortFn = options?.abort;
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
    this.resultReject(error as any);
    this.doneReject(error);
  }

  abort = (): void => {
    if (this.aborted || this.completed) return;
    this.aborted = true;
    if (this.abortFn) {
      try {
        this.abortFn();
      } catch {
        // Swallow abort errors; handle will reject below.
      }
    }
    this.reject(new Error('StreamExecution aborted'));
  };
}
