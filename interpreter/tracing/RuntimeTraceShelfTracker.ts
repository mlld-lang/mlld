import type { RuntimeTraceScope } from '@core/types/trace';
import { buildRuntimeTraceScopeSignature } from './RuntimeTraceScope';
import { fingerprintRuntimeTraceValue, summarizeRuntimeTraceValue } from './RuntimeTraceValue';
import type { RuntimeTraceEnvelope } from './events';
import { traceShelfStaleRead } from './events';

type RuntimeTraceShelfWriteState = {
  ts: string;
  scopeSignature: string;
  fingerprint: string;
  summary: unknown;
};

export class RuntimeTraceShelfTracker {
  private readonly writes = new Map<string, RuntimeTraceShelfWriteState>();

  clear(): void {
    this.writes.clear();
  }

  recordWrite(slot: string, value: unknown, scope: RuntimeTraceScope): void {
    this.writes.set(slot, {
      ts: new Date().toISOString(),
      scopeSignature: buildRuntimeTraceScopeSignature(scope),
      fingerprint: fingerprintRuntimeTraceValue(value),
      summary: summarizeRuntimeTraceValue(value)
    });
  }

  buildStaleReadEvent(
    slot: string,
    value: unknown,
    readTs: string,
    scope: RuntimeTraceScope
  ): RuntimeTraceEnvelope | undefined {
    const lastWrite = this.writes.get(slot);
    if (!lastWrite) {
      return undefined;
    }

    if (lastWrite.scopeSignature !== buildRuntimeTraceScopeSignature(scope)) {
      return undefined;
    }

    const currentFingerprint = fingerprintRuntimeTraceValue(value);
    if (currentFingerprint === lastWrite.fingerprint) {
      return undefined;
    }

    return traceShelfStaleRead({
      slot,
      writeTs: lastWrite.ts,
      readTs,
      expected: lastWrite.summary,
      actual: summarizeRuntimeTraceValue(value),
      message: 'shelf.read returned stale data after shelf.write in the same context'
    });
  }
}
