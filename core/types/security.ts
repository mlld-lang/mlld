import type { DirectiveKind } from './primitives';

export type ImportType = 'module' | 'static' | 'live' | 'cached' | 'local';

export type DataLabel =
  | 'secret'
  | 'pii'
  | 'untrusted'
  | 'public'
  | 'trusted'
  | 'destructive'
  | 'network';

export type CapabilityKind =
  | DirectiveKind
  | 'pipeline'
  | 'effect'
  | 'command'
  | 'output';

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

export interface SecurityDescriptor {
  readonly labels: readonly DataLabel[];
  readonly taintLevel: TaintLevel;
  readonly sources: readonly string[];
  readonly capability?: CapabilityKind;
  readonly policyContext?: Readonly<Record<string, unknown>>;
}

export interface CapabilityContext {
  readonly kind: CapabilityKind;
  readonly importType?: ImportType;
  readonly taintLevel: TaintLevel;
  readonly labels: readonly DataLabel[];
  readonly sources: readonly string[];
  readonly policy?: Readonly<Record<string, unknown>>;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly operation?: Readonly<Record<string, unknown>>;
  readonly security: SecurityDescriptor;
}

export type SerializedSecurityDescriptor = {
  labels: DataLabel[];
  taintLevel: TaintLevel;
  sources: string[];
  capability?: CapabilityKind;
  policyContext?: Record<string, unknown>;
};

export type SerializedCapabilityContext = {
  kind: CapabilityKind;
  importType?: ImportType;
  taintLevel: TaintLevel;
  labels: DataLabel[];
  sources: string[];
  policy?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  operation?: Record<string, unknown>;
  security: SerializedSecurityDescriptor;
};

export const DATA_LABELS: readonly DataLabel[] = [
  'secret',
  'pii',
  'untrusted',
  'public',
  'trusted',
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

function freezeArray<T>(values: Iterable<T> | undefined): readonly T[] {
  if (!values) {
    return Object.freeze([]) as readonly T[];
  }
  const deduped = Array.from(new Set(values));
  return Object.freeze(deduped);
}

function freezeObject<T extends Record<string, unknown> | undefined>(input: T): T {
  if (!input) {
    return input;
  }
  return Object.freeze({ ...input }) as T;
}

function createDescriptor(
  labels: readonly DataLabel[],
  taintLevel: TaintLevel,
  sources: readonly string[],
  capability?: CapabilityKind,
  policyContext?: Readonly<Record<string, unknown>>
): SecurityDescriptor {
  return Object.freeze({
    labels,
    taintLevel,
    sources,
    capability,
    policyContext
  });
}

export function makeSecurityDescriptor(options?: {
  labels?: Iterable<DataLabel>;
  taintLevel?: TaintLevel;
  sources?: Iterable<string>;
  capability?: CapabilityKind;
  policyContext?: Record<string, unknown>;
}): SecurityDescriptor {
  const labels = freezeArray(options?.labels);
  const taintLevel = options?.taintLevel ?? 'unknown';
  const sources = freezeArray(options?.sources);
  const policyContext = freezeObject(options?.policyContext);
  return createDescriptor(
    labels,
    taintLevel,
    sources,
    options?.capability,
    policyContext
  );
}

type SecurityDescriptorLike =
  | SecurityDescriptor
  | SerializedSecurityDescriptor
  | (SecurityDescriptor & { labels?: unknown; sources?: unknown })
  | undefined
  | null;

export function normalizeSecurityDescriptor(
  input: SecurityDescriptorLike
): SecurityDescriptor | undefined {
  if (!input) {
    return undefined;
  }

  const candidate = input as SecurityDescriptor;
  const labels = (candidate as any).labels;
  const sources = (candidate as any).sources;
  const hasIterableLabels = Array.isArray(labels) && typeof labels.forEach === 'function';
  const hasIterableSources = Array.isArray(sources) && typeof sources.forEach === 'function';

  if (hasIterableLabels && hasIterableSources) {
    return candidate;
  }

  const normalizedLabels =
    Array.isArray(labels) ? (labels as DataLabel[]) :
    labels !== undefined && labels !== null ? [labels as DataLabel] :
    undefined;
  const normalizedSources =
    Array.isArray(sources) ? (sources as string[]) :
    sources !== undefined && sources !== null ? [sources as string] :
    undefined;

  return makeSecurityDescriptor({
    labels: normalizedLabels,
    taintLevel: (candidate as any).taintLevel,
    sources: normalizedSources,
    capability: (candidate as any).capability,
    policyContext: (candidate as any).policyContext
  });
}

export function mergeDescriptors(
  ...descriptors: Array<SecurityDescriptorLike>
): SecurityDescriptor {
  const labelSet = new Set<DataLabel>();
  const sourceSet = new Set<string>();

  let taintLevel: TaintLevel = 'unknown';
  let capability: CapabilityKind | undefined;
  let policyContext: Record<string, unknown> | undefined;

  for (const incoming of descriptors) {
    const descriptor = normalizeSecurityDescriptor(incoming);
    if (!descriptor) continue;

    descriptor.labels.forEach(label => labelSet.add(label));
    descriptor.sources.forEach(source => sourceSet.add(source));
    taintLevel = compareTaintLevels(taintLevel, descriptor.taintLevel);

    if (descriptor.capability) {
      capability = descriptor.capability;
    }

    if (descriptor.policyContext) {
      policyContext = { ...(policyContext ?? {}), ...descriptor.policyContext };
    }
  }

  return createDescriptor(
    freezeArray(labelSet),
    taintLevel,
    freezeArray(sourceSet),
    capability,
    freezeObject(policyContext)
  );
}

export function hasLabel(
  descriptor: SecurityDescriptor | undefined,
  label: DataLabel
): boolean {
  if (!descriptor) return false;
  return descriptor.labels.includes(label);
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
    taintLevel: descriptor.taintLevel,
    sources: Array.from(descriptor.sources),
    capability: descriptor.capability,
    policyContext: descriptor.policyContext ? { ...descriptor.policyContext } : undefined
  };
}

export function deserializeSecurityDescriptor(
  serialized: SerializedSecurityDescriptor | undefined
): SecurityDescriptor | undefined {
  if (!serialized) return undefined;
  return makeSecurityDescriptor({
    labels: serialized.labels,
    taintLevel: serialized.taintLevel,
    sources: serialized.sources,
    capability: serialized.capability,
    policyContext: serialized.policyContext
  });
}

export interface CreateCapabilityContextOptions {
  kind: CapabilityKind;
  importType?: ImportType;
  descriptor: SecurityDescriptor;
  metadata?: Record<string, unknown>;
  policy?: Record<string, unknown>;
  operation?: Record<string, unknown>;
}

export function createCapabilityContext(
  options: CreateCapabilityContextOptions
): CapabilityContext {
  const policy =
    options.policy ??
    options.descriptor.policyContext ??
    undefined;
  return Object.freeze({
    kind: options.kind,
    importType: options.importType,
    taintLevel: options.descriptor.taintLevel,
    labels: options.descriptor.labels,
    sources: options.descriptor.sources,
    policy: policy ? Object.freeze({ ...policy }) : undefined,
    metadata: options.metadata ? Object.freeze({ ...options.metadata }) : undefined,
    operation: options.operation ? Object.freeze({ ...options.operation }) : undefined,
    security: options.descriptor
  });
}

export function serializeCapabilityContext(
  context: CapabilityContext | undefined
): SerializedCapabilityContext | undefined {
  if (!context) return undefined;
  return {
    kind: context.kind,
    importType: context.importType,
    taintLevel: context.taintLevel,
    labels: Array.from(context.labels),
    sources: Array.from(context.sources),
    policy: context.policy ? { ...context.policy } : undefined,
    metadata: context.metadata ? { ...context.metadata } : undefined,
    operation: context.operation ? { ...context.operation } : undefined,
    security: serializeSecurityDescriptor(context.security)!
  };
}

export function deserializeCapabilityContext(
  serialized: SerializedCapabilityContext | undefined
): CapabilityContext | undefined {
  if (!serialized) return undefined;
  const descriptor = deserializeSecurityDescriptor(serialized.security)!;
  return createCapabilityContext({
    kind: serialized.kind,
    importType: serialized.importType,
    descriptor,
    metadata: serialized.metadata,
    policy: serialized.policy,
    operation: serialized.operation
  });
}
