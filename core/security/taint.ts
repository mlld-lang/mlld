import type { DataLabel, ImportType } from '@core/types/security';
import { labelsForPath } from './paths';

type ImmutableArray<T> = readonly T[];

function dedupe<T>(values: Iterable<T>): T[] {
  const seen = new Set<T>();
  for (const value of values) {
    if (!seen.has(value)) {
      seen.add(value);
    }
  }
  return Array.from(seen);
}

function freezeArray<T>(values: Iterable<T> | undefined): ImmutableArray<T> {
  const array = values ? dedupe(values) : [];
  return Object.freeze(array.slice()) as ImmutableArray<T>;
}

export interface TaintSnapshot {
  readonly sources: ImmutableArray<string>;
  readonly taint: ImmutableArray<DataLabel>;
  readonly labels: ImmutableArray<DataLabel>;
}

export interface TrackTaintOptions {
  sources?: Iterable<string>;
  labels?: Iterable<DataLabel>;
  taint?: Iterable<DataLabel>;
}

export class TaintTracker {
  private readonly entries = new Map<string, TaintSnapshot>();

  track(id: string, options?: TrackTaintOptions): TaintSnapshot {
    const existing = this.entries.get(id);
    const mergedSources = freezeArray<string>([
      ...(existing?.sources ?? []),
      ...(options?.sources ?? [])
    ]);

    const mergedLabels = freezeArray<DataLabel>([
      ...(existing?.labels ?? []),
      ...(options?.labels ?? [])
    ]);

    const mergedTaint = freezeArray<DataLabel>([
      ...(existing?.taint ?? []),
      ...mergedLabels,
      ...(options?.taint ?? [])
    ]);

    const snapshot: TaintSnapshot = Object.freeze({
      sources: mergedSources,
      labels: mergedLabels,
      taint: mergedTaint
    });

    this.entries.set(id, snapshot);
    return snapshot;
  }

  get(id: string): TaintSnapshot | undefined {
    return this.entries.get(id);
  }

  merge(id: string, ...snapshots: Array<TaintSnapshot | undefined>): TaintSnapshot {
    const incoming = snapshots.filter(
      (snapshot): snapshot is TaintSnapshot => Boolean(snapshot)
    );

    const existing = this.entries.get(id);
    if (!existing && incoming.length === 0) {
      const defaultSnapshot = Object.freeze({
        sources: Object.freeze([]) as ImmutableArray<string>,
        labels: Object.freeze([]) as ImmutableArray<DataLabel>,
        taint: Object.freeze([]) as ImmutableArray<DataLabel>
      });
      this.entries.set(id, defaultSnapshot);
      return defaultSnapshot;
    }

    const sources = freezeArray<string>([
      ...(existing?.sources ?? []),
      ...incoming.flatMap(snapshot => snapshot.sources)
    ]);

    const labels = freezeArray<DataLabel>([
      ...(existing?.labels ?? []),
      ...incoming.flatMap(snapshot => snapshot.labels)
    ]);

    const taint = freezeArray<DataLabel>([
      ...(existing?.taint ?? []),
      ...incoming.flatMap(snapshot => snapshot.taint),
      ...labels
    ]);

    const snapshot: TaintSnapshot = Object.freeze({
      sources,
      labels,
      taint
    });

    this.entries.set(id, snapshot);
    return snapshot;
  }

  clear(): void {
    this.entries.clear();
  }
}

export interface ImportTaintOptions {
  importType: ImportType;
  resolverName?: string;
  source?: string;
  labels?: readonly DataLabel[];  // From resolver ctx
  resolvedPath?: string;
  sourceType?: 'file' | 'url' | 'module' | 'resolver' | 'input';
}

function isUrlLike(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function shouldTreatAsFile(options: ImportTaintOptions, resolvedPath?: string): boolean {
  if (!resolvedPath) {
    return false;
  }
  if (options.sourceType === 'url' || options.importType === 'cached') {
    return false;
  }
  if (options.sourceType === 'module' || options.sourceType === 'input') {
    return false;
  }
  if (isUrlLike(resolvedPath)) {
    return false;
  }
  if (resolvedPath.startsWith('@')) {
    return false;
  }
  return true;
}

export function deriveImportTaint(options: ImportTaintOptions): TaintSnapshot {
  const resolverName = options.resolverName?.toLowerCase();
  const resolvedPath = options.resolvedPath ?? options.source;
  const dirLabels =
    resolvedPath && shouldTreatAsFile(options, resolvedPath)
      ? labelsForPath(resolvedPath)
      : [];

  const sources = freezeArray<string>([
    ...(resolverName === 'dynamic' ? ['dynamic-module'] : []),
    ...(options.source ? [options.source] : resolverName ? [`resolver:${resolverName}`] : [])
  ]);

  const explicitLabels = freezeArray(options.labels);
  const taint = freezeArray<DataLabel>([
    ...explicitLabels,
    ...(resolverName === 'dynamic' ? ['src:dynamic'] : []),
    ...(dirLabels.length > 0 ? ['src:file', ...dirLabels] : [])
  ]);

  return Object.freeze({
    sources,
    labels: explicitLabels,
    taint
  });
}

export interface CommandTaintOptions {
  command: string;
  source?: string;
}

export function deriveCommandTaint(options: CommandTaintOptions): TaintSnapshot {
  const baseCommand = options.command.trim().split(/\s+/)[0] ?? '';
  const sources = freezeArray<string>([
    options.source ? options.source : `command:${baseCommand}`
  ]);
  const taint = freezeArray<DataLabel>(['src:exec']);

  return Object.freeze({
    sources,
    labels: Object.freeze([]) as ImmutableArray<DataLabel>,
    taint
  });
}

export function mergeTaintSnapshots(
  ...snapshots: Array<TaintSnapshot | undefined>
): TaintSnapshot | undefined {
  const defined = snapshots.filter(
    (snapshot): snapshot is TaintSnapshot => Boolean(snapshot)
  );
  if (defined.length === 0) {
    return undefined;
  }

  const sources = freezeArray<string>(
    defined.flatMap(snapshot => snapshot.sources)
  );
  const labels = freezeArray<DataLabel>(defined.flatMap(snapshot => snapshot.labels));
  const taint = freezeArray<DataLabel>(
    defined.flatMap(snapshot => snapshot.taint).concat(labels)
  );

  return Object.freeze({
    sources,
    labels,
    taint
  });
}
