export interface ValueHandleEntry {
  handle: string;
  value: unknown;
  issuedAt: number;
  preview?: string;
  metadata?: Record<string, unknown>;
}

export interface IssueValueHandleOptions {
  preview?: string;
  metadata?: Record<string, unknown>;
}

export class ValueHandleRegistry {
  private nextId = 1;
  private readonly entries = new Map<string, ValueHandleEntry>();

  issue(value: unknown, options: IssueValueHandleOptions = {}): ValueHandleEntry {
    const handle = `h_${this.nextId.toString(36)}`;
    this.nextId += 1;

    const entry: ValueHandleEntry = {
      handle,
      value,
      issuedAt: Date.now(),
      ...(options.preview ? { preview: options.preview } : {}),
      ...(options.metadata ? { metadata: { ...options.metadata } } : {})
    };

    this.entries.set(handle, entry);
    return entry;
  }

  resolve(handle: string): ValueHandleEntry | undefined {
    return this.entries.get(handle.trim());
  }

  size(): number {
    return this.entries.size;
  }
}
