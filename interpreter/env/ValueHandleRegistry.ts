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
  private readonly entries = new Map<string, ValueHandleEntry>();

  issue(value: unknown, options: IssueValueHandleOptions = {}): ValueHandleEntry {
    const handle = this.createHandle();

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
}
