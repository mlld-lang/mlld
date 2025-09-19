import type { SourceLocation } from '@core/types';

/**
 * Collects `/export` declarations encountered while a module evaluates so later
 * import processing can validate and filter the exported variables.
 */
export interface ExportManifestEntry {
  name: string;
  location?: SourceLocation;
}

export class ExportManifest implements Iterable<string> {
  private readonly entries = new Map<string, ExportManifestEntry>();

  add(entries: ExportManifestEntry[]): void {
    for (const entry of entries) {
      const name = entry?.name;
      if (!name) continue;
      const trimmed = name.trim();
      if (!trimmed) continue;

      if (!this.entries.has(trimmed)) {
        this.entries.set(trimmed, { name: trimmed, location: entry.location });
      } else if (entry.location && !this.entries.get(trimmed)?.location) {
        const existing = this.entries.get(trimmed)!;
        this.entries.set(trimmed, { ...existing, location: entry.location });
      }
    }
  }

  hasEntries(): boolean {
    return this.entries.size > 0;
  }

  getNames(): string[] {
    return Array.from(this.entries.keys());
  }

  getLocation(name: string): SourceLocation | undefined {
    return this.entries.get(name)?.location;
  }

  [Symbol.iterator](): IterableIterator<string> {
    return this.entries.keys();
  }

  toArray(): string[] {
    return this.getNames();
  }
}
