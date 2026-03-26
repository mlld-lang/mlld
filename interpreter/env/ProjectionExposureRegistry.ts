export type ProjectionExposureKind = 'bare' | 'mask' | 'handle';

export interface ProjectionExposureEntry {
  sessionId: string;
  value: unknown;
  kind: ProjectionExposureKind;
  issuedAt: number;
  handle?: string;
  field?: string;
  record?: string;
  emittedPreview?: string;
  emittedLiteral?: string;
}

export type ProjectionExposureMatch =
  | { status: 'none'; matches: readonly ProjectionExposureEntry[] }
  | { status: 'matched'; matches: readonly ProjectionExposureEntry[] }
  | { status: 'ambiguous'; matches: readonly ProjectionExposureEntry[] };

function cloneEntry(entry: ProjectionExposureEntry): ProjectionExposureEntry {
  return {
    ...entry
  };
}

function buildIndexKey(sessionId: string, value: string): string {
  return `${sessionId}\u0000${value}`;
}

export class ProjectionExposureRegistry {
  private readonly entriesBySession = new Map<string, ProjectionExposureEntry[]>();
  private readonly previewIndex = new Map<string, ProjectionExposureEntry[]>();
  private readonly literalIndex = new Map<string, ProjectionExposureEntry[]>();
  private readonly previewGlobalIndex = new Map<string, ProjectionExposureEntry[]>();
  private readonly literalGlobalIndex = new Map<string, ProjectionExposureEntry[]>();

  record(entry: ProjectionExposureEntry): void {
    const normalizedSessionId = entry.sessionId.trim();
    if (!normalizedSessionId) {
      return;
    }

    const stored = cloneEntry({
      ...entry,
      sessionId: normalizedSessionId
    });

    const sessionEntries = this.entriesBySession.get(normalizedSessionId) ?? [];
    sessionEntries.push(stored);
    this.entriesBySession.set(normalizedSessionId, sessionEntries);

    if (typeof stored.emittedPreview === 'string' && stored.emittedPreview.length > 0) {
      const key = buildIndexKey(normalizedSessionId, stored.emittedPreview);
      const entries = this.previewIndex.get(key) ?? [];
      entries.push(stored);
      this.previewIndex.set(key, entries);

      const globalEntries = this.previewGlobalIndex.get(stored.emittedPreview) ?? [];
      globalEntries.push(stored);
      this.previewGlobalIndex.set(stored.emittedPreview, globalEntries);
    }

    if (typeof stored.emittedLiteral === 'string' && stored.emittedLiteral.length > 0) {
      const key = buildIndexKey(normalizedSessionId, stored.emittedLiteral);
      const entries = this.literalIndex.get(key) ?? [];
      entries.push(stored);
      this.literalIndex.set(key, entries);

      const globalEntries = this.literalGlobalIndex.get(stored.emittedLiteral) ?? [];
      globalEntries.push(stored);
      this.literalGlobalIndex.set(stored.emittedLiteral, globalEntries);
    }
  }

  getEntries(sessionId: string): readonly ProjectionExposureEntry[] {
    const normalizedSessionId = sessionId.trim();
    if (!normalizedSessionId) {
      return [];
    }
    return (this.entriesBySession.get(normalizedSessionId) ?? []).map(cloneEntry);
  }

  matchPreview(sessionId: string, preview: string): ProjectionExposureMatch {
    return this.normalizeMatch(this.previewIndex.get(buildIndexKey(sessionId.trim(), preview)) ?? []);
  }

  matchLiteral(sessionId: string, literal: string): ProjectionExposureMatch {
    return this.normalizeMatch(this.literalIndex.get(buildIndexKey(sessionId.trim(), literal)) ?? []);
  }

  matchAnyPreview(preview: string): ProjectionExposureMatch {
    return this.normalizeMatch(this.previewGlobalIndex.get(preview) ?? []);
  }

  matchAnyLiteral(literal: string): ProjectionExposureMatch {
    return this.normalizeMatch(this.literalGlobalIndex.get(literal) ?? []);
  }

  clearSession(sessionId: string): void {
    const normalizedSessionId = sessionId.trim();
    if (!normalizedSessionId) {
      return;
    }

    const entries = this.entriesBySession.get(normalizedSessionId) ?? [];
    for (const entry of entries) {
      if (typeof entry.emittedPreview === 'string' && entry.emittedPreview.length > 0) {
        this.previewIndex.delete(buildIndexKey(normalizedSessionId, entry.emittedPreview));
        const globalEntries = (this.previewGlobalIndex.get(entry.emittedPreview) ?? [])
          .filter(candidate => candidate !== entry);
        if (globalEntries.length === 0) {
          this.previewGlobalIndex.delete(entry.emittedPreview);
        } else {
          this.previewGlobalIndex.set(entry.emittedPreview, globalEntries);
        }
      }
      if (typeof entry.emittedLiteral === 'string' && entry.emittedLiteral.length > 0) {
        this.literalIndex.delete(buildIndexKey(normalizedSessionId, entry.emittedLiteral));
        const globalEntries = (this.literalGlobalIndex.get(entry.emittedLiteral) ?? [])
          .filter(candidate => candidate !== entry);
        if (globalEntries.length === 0) {
          this.literalGlobalIndex.delete(entry.emittedLiteral);
        } else {
          this.literalGlobalIndex.set(entry.emittedLiteral, globalEntries);
        }
      }
    }
    this.entriesBySession.delete(normalizedSessionId);
  }

  private normalizeMatch(entries: readonly ProjectionExposureEntry[]): ProjectionExposureMatch {
    const cloned = entries.map(cloneEntry);
    if (cloned.length === 0) {
      return { status: 'none', matches: cloned };
    }
    if (cloned.length === 1) {
      return { status: 'matched', matches: cloned };
    }
    return { status: 'ambiguous', matches: cloned };
  }
}
