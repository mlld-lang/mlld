export class ExportManifest implements Iterable<string> {
  private readonly entries = new Set<string>();

  add(names: string[]): void {
    for (const name of names) {
      if (!name) continue;
      const trimmed = name.trim();
      if (trimmed.length === 0) continue;
      this.entries.add(trimmed);
    }
  }

  hasEntries(): boolean {
    return this.entries.size > 0;
  }

  [Symbol.iterator](): IterableIterator<string> {
    return this.entries.values();
  }

  toArray(): string[] {
    return Array.from(this.entries);
  }
}
