import { encodeCanonicalValue } from '@interpreter/security/canonical-value';

export interface ValueHandleEntry {
  handle: string;
  value: unknown;
  issuedAt: number;
  sessionId?: string;
  preview?: string;
  metadata?: Record<string, unknown>;
}

export interface IssueValueHandleOptions {
  sessionId?: string;
  preview?: string;
  metadata?: Record<string, unknown>;
  stableKey?: string;
}

export class ValueHandleRegistry {
  private readonly entries = new Map<string, ValueHandleEntry>();
  private readonly stableIndex = new Map<string, string>();

  issue(value: unknown, options: IssueValueHandleOptions = {}): ValueHandleEntry {
    const stableLookupKey = this.buildStableLookupKey(value, options);
    if (stableLookupKey) {
      const existingHandle = this.stableIndex.get(stableLookupKey);
      if (existingHandle) {
        const existing = this.entries.get(existingHandle);
        if (existing) {
          return existing;
        }
        this.stableIndex.delete(stableLookupKey);
      }
    }

    const handle = this.createHandle();

    const entry: ValueHandleEntry = {
      handle,
      value,
      issuedAt: Date.now(),
      ...(typeof options.sessionId === 'string' && options.sessionId.trim().length > 0
        ? { sessionId: options.sessionId.trim() }
        : {}),
      ...(options.preview ? { preview: options.preview } : {}),
      ...(options.metadata ? { metadata: { ...options.metadata } } : {})
    };

    this.entries.set(handle, entry);
    if (stableLookupKey) {
      this.stableIndex.set(stableLookupKey, handle);
    }
    return entry;
  }

  resolve(handle: string): ValueHandleEntry | undefined {
    return this.entries.get(handle.trim());
  }

  getEntries(): readonly ValueHandleEntry[] {
    return Array.from(this.entries.values());
  }

  getEntriesForSession(sessionId: string): readonly ValueHandleEntry[] {
    const normalized = sessionId.trim();
    if (!normalized) {
      return [];
    }
    return Array.from(this.entries.values()).filter(entry => entry.sessionId === normalized);
  }

  countEntriesForSession(sessionId: string): number {
    return this.getEntriesForSession(sessionId).length;
  }

  findByCanonicalValue(value: unknown): readonly ValueHandleEntry[] {
    const targetKey = encodeCanonicalValue(value);
    if (!targetKey) {
      return [];
    }

    const matches: ValueHandleEntry[] = [];
    for (const entry of this.entries.values()) {
      if (encodeCanonicalValue(entry.value) === targetKey) {
        matches.push(entry);
      }
    }
    return matches;
  }

  size(): number {
    return this.entries.size;
  }

  private createHandle(): string {
    const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';

    while (true) {
      let suffix = '';
      for (let index = 0; index < 6; index += 1) {
        suffix += alphabet[Math.floor(Math.random() * alphabet.length)];
      }
      const handle = `h_${suffix}`;
      if (!this.entries.has(handle)) {
        return handle;
      }
    }
  }

  private buildStableLookupKey(
    value: unknown,
    options: IssueValueHandleOptions
  ): string | undefined {
    const scopedStableKey =
      typeof options.stableKey === 'string' && options.stableKey.trim().length > 0
        ? options.stableKey.trim()
        : encodeCanonicalValue(value);
    if (!scopedStableKey) {
      return undefined;
    }

    const sessionScope =
      typeof options.sessionId === 'string' && options.sessionId.trim().length > 0
        ? options.sessionId.trim()
        : '__global__';
    return `${sessionScope}::${scopedStableKey}`;
  }
}
