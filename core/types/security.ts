import type { DirectiveKind } from './primitives';

export type ImportType = 'module' | 'static' | 'live' | 'cached' | 'local';

export type DataLabel =
  | 'secret'
  | 'pii'
  | 'untrusted'
  | 'public'
  | 'trusted'
  | 'audited'
  | 'destructive'
  | 'network';

export type CapabilityKind = DirectiveKind | 'pipeline' | 'effect';

export type TaintLevel =
  | 'unknown'
  | 'literal'
  | 'module'
  | 'staticEmbed'
  | 'localFile'
  | 'commandOutput'
  | 'userInput'
  | 'resolver'
  | 'networkCached'
  | 'networkLive'
  | 'llmOutput';

export interface CapabilitySource {
  path?: string;
  locator?: string;
  description?: string;
}

export interface SecurityDescriptor {
  readonly labels: ReadonlySet<DataLabel>;
  readonly taint: TaintLevel;
  readonly source?: CapabilitySource;
  readonly inference?: 'explicit' | 'inferred' | 'default';
}

export interface CapabilityContext {
  readonly kind: CapabilityKind;
  readonly importType?: ImportType;
  readonly security: SecurityDescriptor;
  readonly metadata?: Record<string, unknown>;
}

export type SerializedSecurityDescriptor = {
  labels: DataLabel[];
  taint: TaintLevel;
  source?: CapabilitySource;
  inference?: SecurityDescriptor['inference'];
};

export type SerializedCapabilityContext = {
  kind: CapabilityKind;
  importType?: ImportType;
  security: SerializedSecurityDescriptor;
  metadata?: Record<string, unknown>;
};

export const DATA_LABELS: readonly DataLabel[] = [
  'secret',
  'pii',
  'untrusted',
  'public',
  'trusted',
  'audited',
  'destructive',
  'network'
] as const;

const TAINT_ORDER: Record<TaintLevel, number> = {
  llmOutput: 9,
  networkLive: 8,
  networkCached: 7,
  resolver: 6,
  userInput: 5,
  commandOutput: 4,
  localFile: 3,
  staticEmbed: 2,
  module: 1,
  literal: 0,
  unknown: -1
};

const INFERENCE_RANK: Record<NonNullable<SecurityDescriptor['inference']>, number> = {
  explicit: 2,
  inferred: 1,
  default: 0
};

function normalizeLabels(labels?: Iterable<DataLabel>): DataLabel[] {
  if (!labels) {
    return [];
  }

  const seen = new Set<DataLabel>();
  const normalized: DataLabel[] = [];
  for (const label of labels) {
    if (!seen.has(label)) {
      seen.add(label);
      normalized.push(label);
    }
  }
  return normalized;
}

function freezeSet<T>(input: Set<T>): ReadonlySet<T> {
  return Object.freeze(input) as ReadonlySet<T>;
}

function cloneSource(source?: CapabilitySource): CapabilitySource | undefined {
  if (!source) return undefined;
  return Object.freeze({ ...source });
}

function buildDescriptor(
  labels: Iterable<DataLabel>,
  taint: TaintLevel,
  source?: CapabilitySource,
  inference?: SecurityDescriptor['inference']
): SecurityDescriptor {
  const set = freezeSet(new Set(labels));
  const descriptor: SecurityDescriptor = {
    labels: set,
    taint,
    source: cloneSource(source),
    inference
  };
  return Object.freeze(descriptor);
}

export function makeSecurityDescriptor(options?: {
  labels?: Iterable<DataLabel>;
  taint?: TaintLevel;
  source?: CapabilitySource;
  inference?: SecurityDescriptor['inference'];
}): SecurityDescriptor {
  const normalizedLabels = normalizeLabels(options?.labels);
  const inferred =
    options?.inference ??
    (normalizedLabels.length > 0 ? 'explicit' : 'default');

  return buildDescriptor(
    normalizedLabels,
    options?.taint ?? 'unknown',
    options?.source,
    inferred
  );
}

export function mergeDescriptors(
  ...descriptors: Array<SecurityDescriptor | undefined>
): SecurityDescriptor {
  const labels = new Set<DataLabel>();
  let taint: TaintLevel | undefined;
  let highestInference: SecurityDescriptor['inference'] = 'default';

  for (const descriptor of descriptors) {
    if (!descriptor) continue;

    for (const label of descriptor.labels) {
      labels.add(label);
    }

    if (taint === undefined) {
      taint = descriptor.taint;
    } else {
      taint = compareTaintLevels(taint, descriptor.taint);
    }

    const inference = descriptor.inference ?? 'default';
    if (
      highestInference === undefined ||
      INFERENCE_RANK[inference] > INFERENCE_RANK[highestInference]
    ) {
      highestInference = inference;
    }
  }

  if (taint === undefined) {
    taint = 'unknown';
  }

  return buildDescriptor(
    labels,
    taint,
    undefined,
    highestInference ?? 'default'
  );
}

export function hasLabel(
  descriptor: SecurityDescriptor | undefined,
  label: DataLabel
): boolean {
  if (!descriptor) return false;
  return descriptor.labels.has(label);
}

export function compareTaintLevels(a: TaintLevel, b: TaintLevel): TaintLevel {
  if (a === b) return a;
  const rankA = TAINT_ORDER[a];
  const rankB = TAINT_ORDER[b];
  return rankA >= rankB ? a : b;
}

export function serializeSecurityDescriptor(
  descriptor: SecurityDescriptor | undefined
): SerializedSecurityDescriptor | undefined {
  if (!descriptor) return undefined;
  return {
    labels: Array.from(descriptor.labels),
    taint: descriptor.taint,
    source: descriptor.source ? { ...descriptor.source } : undefined,
    inference: descriptor.inference
  };
}

export function deserializeSecurityDescriptor(
  serialized: SerializedSecurityDescriptor | undefined
): SecurityDescriptor | undefined {
  if (!serialized) return undefined;
  return makeSecurityDescriptor({
    labels: serialized.labels,
    taint: serialized.taint,
    source: serialized.source,
    inference: serialized.inference
  });
}

export function serializeCapabilityContext(
  context: CapabilityContext | undefined
): SerializedCapabilityContext | undefined {
  if (!context) return undefined;
  return {
    kind: context.kind,
    importType: context.importType,
    security: serializeSecurityDescriptor(context.security)!,
    metadata: context.metadata ? { ...context.metadata } : undefined
  };
}

export function deserializeCapabilityContext(
  serialized: SerializedCapabilityContext | undefined
): CapabilityContext | undefined {
  if (!serialized) return undefined;
  return Object.freeze({
    kind: serialized.kind,
    importType: serialized.importType,
    security: deserializeSecurityDescriptor(serialized.security)!,
    metadata: serialized.metadata ? { ...serialized.metadata } : undefined
  });
}
