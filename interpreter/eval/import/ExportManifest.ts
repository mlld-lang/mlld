import type { SourceLocation } from '@core/types';

/**
 * Collects `/export` declarations encountered while a module evaluates so later
 * import processing can validate and filter the exported variables.
 */
export interface ExportManifestEntry {
  name: string;
  kind?: 'variable' | 'guard';
  location?: SourceLocation;
}

export class ExportManifest implements Iterable<ExportManifestEntry> {
  private readonly entries = new Map<string, ExportManifestEntry>();

  add(entries: ExportManifestEntry[]): void {
    for (const entry of entries) {
      const name = entry?.name;
      if (!name) continue;
      const trimmed = name.trim();
      if (!trimmed) continue;

      if (!this.entries.has(trimmed)) {
        this.entries.set(trimmed, { name: trimmed, kind: entry.kind, location: entry.location });
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

  getEntries(): ExportManifestEntry[] {
    return Array.from(this.entries.values());
  }

  getLocation(name: string): SourceLocation | undefined {
    return this.entries.get(name)?.location;
  }

  [Symbol.iterator](): IterableIterator<ExportManifestEntry> {
    return this.entries.values();
  }

  toArray(): ExportManifestEntry[] {
    return this.getEntries();
  }
}
