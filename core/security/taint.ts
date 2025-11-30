import type { DataLabel, ImportType, TaintLevel } from '@core/types/security';
import { compareTaintLevels, DATA_LABELS } from '@core/types/security';

type ImmutableArray<T> = readonly T[];

const TAINT_DESCRIPTIONS: Record<TaintLevel, string> = {
  llmOutput: 'LLM generated content',
  networkLive: 'Live network content',
  networkCached: 'Cached network content',
  resolver: 'Resolver provided content',
  userInput: 'User supplied input',
  commandOutput: 'Command output',
  localFile: 'Local file content',
  staticEmbed: 'Static embedded content',
  module: 'Registry module content',
  literal: 'Literal source value',
  unknown: 'Unknown provenance'
};

const LLM_COMMAND_PATTERNS: RegExp[] = [
  /^(?:claude|anthropic|ai)/i,
  /^(?:gpt|openai|chatgpt)/i,
  /^(?:bard|gemini|palm)/i,
  /^(?:mistral|llama|alpaca)/i,
  /^(?:llm|ai-|ml-)/i
];

const DEFAULT_LABELS_BY_TAINT: Partial<Record<TaintLevel, DataLabel[]>> = {
  llmOutput: ['untrusted'],
  networkLive: ['network', 'untrusted'],
  networkCached: ['network'],
  resolver: ['untrusted'],
  userInput: ['untrusted'],
  commandOutput: ['untrusted'],
  localFile: ['trusted'],
  staticEmbed: ['trusted'],
  module: ['trusted'],
  literal: ['public'],
  unknown: []
};

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
  readonly level: TaintLevel;
  readonly sources: ImmutableArray<string>;
  readonly labels: ImmutableArray<DataLabel>;
}

export interface TrackTaintOptions {
  sources?: Iterable<string>;
  labels?: Iterable<DataLabel>;
}

export class TaintTracker {
  private readonly entries = new Map<string, TaintSnapshot>();

  track(id: string, level: TaintLevel, options?: TrackTaintOptions): TaintSnapshot {
    const existing = this.entries.get(id);
    const mergedLevel = existing ? compareTaintLevels(existing.level, level) : level;
    const mergedSources = freezeArray<string>([
      ...(existing?.sources ?? []),
      ...(options?.sources ?? [])
    ]);

    const mergedLabels = freezeArray<DataLabel>([
      ...(existing?.labels ?? []),
      ...(options?.labels ?? defaultLabelsForLevel(level))
    ]);

    const snapshot: TaintSnapshot = Object.freeze({
      level: mergedLevel,
      sources: mergedSources,
      labels: mergedLabels
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
        level: 'unknown' as TaintLevel,
        sources: Object.freeze([]) as ImmutableArray<string>,
        labels: Object.freeze([]) as ImmutableArray<DataLabel>
      });
      this.entries.set(id, defaultSnapshot);
      return defaultSnapshot;
    }

    const level = incoming
      .map(snapshot => snapshot.level)
      .reduce<TaintLevel>(
        (current, next) => compareTaintLevels(current, next),
        existing?.level ?? 'unknown'
      );

    const sources = freezeArray<string>([
      ...(existing?.sources ?? []),
      ...incoming.flatMap(snapshot => snapshot.sources)
    ]);

    const labels = freezeArray<DataLabel>([
      ...(existing?.labels ?? []),
      ...incoming.flatMap(snapshot => snapshot.labels)
    ]);

    const snapshot: TaintSnapshot = Object.freeze({
      level,
      sources,
      labels
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
  advisoryLevel?: 'none' | 'warning';
  taintLevel?: TaintLevel;
  labels?: readonly DataLabel[];  // From resolver ctx
}

export function deriveImportTaint(options: ImportTaintOptions): TaintSnapshot {
  const resolverName = options.resolverName?.toLowerCase();

  let level: TaintLevel;
  if (resolverName === 'dynamic') {
    level = options.taintLevel ?? 'resolver';
  } else if (resolverName === 'input' || resolverName === 'stdin') {
    level = 'userInput';
  } else if (resolverName === 'resolver') {
    level = 'resolver';
  } else {
    level = options.taintLevel ?? deriveTaintFromImportType(options.importType);
  }

  if (options.advisoryLevel === 'warning' && level === 'module') {
    level = 'resolver';
  }

  const sources = freezeArray<string>([
    ...(resolverName === 'dynamic' ? ['dynamic-module'] : []),
    ...(options.source ? [options.source] : resolverName ? [`resolver:${resolverName}`] : [])
  ]);

  // Merge labels from resolver ctx with default labels for taint level
  const defaultLabels = level === 'module' && options.advisoryLevel === 'none'
    ? ['trusted']
    : defaultLabelsForLevel(level);

  const mergedLabels = [
    ...(options.labels ?? []),  // From resolver ctx (e.g., ['dynamic'])
    ...defaultLabels
  ];

  const labels = freezeArray<DataLabel>([...new Set(mergedLabels)]);  // Dedupe

  return Object.freeze({
    level,
    sources,
    labels
  });
}

function deriveTaintFromImportType(importType: ImportType): TaintLevel {
  switch (importType) {
    case 'module':
      return 'module';
    case 'static':
      return 'staticEmbed';
    case 'local':
      return 'localFile';
    case 'cached':
      return 'networkCached';
    case 'live':
      return 'networkLive';
    default:
      return 'unknown';
  }
}

export interface CommandTaintOptions {
  command: string;
  source?: string;
}

export function deriveCommandTaint(options: CommandTaintOptions): TaintSnapshot {
  const baseCommand = options.command.trim().split(/\s+/)[0] ?? '';
  const level = isLLMCommand(baseCommand) ? 'llmOutput' : 'commandOutput';
  const sources = freezeArray<string>([
    options.source ? options.source : `command:${baseCommand}`
  ]);
  const labels = freezeArray<DataLabel>(defaultLabelsForLevel(level));

  return Object.freeze({
    level,
    sources,
    labels
  });
}

export function describeTaint(level: TaintLevel): string {
  return TAINT_DESCRIPTIONS[level];
}

export function defaultLabelsForLevel(level: TaintLevel): DataLabel[] {
  const labels = DEFAULT_LABELS_BY_TAINT[level];
  if (!labels) {
    return [];
  }
  return labels.filter(label => (DATA_LABELS as readonly DataLabel[]).includes(label));
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

  const level = defined
    .map(snapshot => snapshot.level)
    .reduce<TaintLevel>((current, next) => compareTaintLevels(current, next));

  const sources = freezeArray<string>(
    defined.flatMap(snapshot => snapshot.sources)
  );
  const labels = freezeArray<DataLabel>(
    defined.flatMap(snapshot => snapshot.labels)
  );

  return Object.freeze({
    level,
    sources,
    labels
  });
}

function isLLMCommand(command: string): boolean {
  return LLM_COMMAND_PATTERNS.some(pattern => pattern.test(command));
}
