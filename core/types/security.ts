import type { DirectiveKind } from './primitives';

export type ImportType = 'module' | 'static' | 'live' | 'cached' | 'local' | 'templates';

/**
 * Data labels are user-defined strings describing data properties and operation behaviors.
 *
 * Built-in labels (conventions, not restrictions):
 *
 * Data labels:
 * - secret: Sensitive data (passwords, keys, tokens)
 * - pii: Personally identifiable information
 * - public: Safe to expose anywhere
 * - untrusted: From external sources, potential injection risk
 * - trusted: From verified/safe sources
 *
 * Operation labels (for /exe functions):
 * - Network: net:r, net:w, net:rw, network
 * - Filesystem: fs:r, fs:w, fs:rw, filesystem
 * - Risk: safe, moderate, dangerous, destructive, paid
 *
 * Source labels:
 * - dynamic: Injected at runtime via dynamic modules
 *
 * Users can define custom labels (e.g., 'confidential', 'audit-required', 'acme-internal').
 * Guards work with any label - built-ins are just documented conventions.
 */
export type DataLabel = string;

/**
 * Built-in label constants for reference.
 * Not exhaustive - users can use any string as a label.
 */
export const BUILTIN_LABELS = {
  // Data
  SECRET: 'secret',
  PII: 'pii',
  PUBLIC: 'public',
  UNTRUSTED: 'untrusted',
  TRUSTED: 'trusted',

  // Network
  NET_R: 'net:r',
  NET_W: 'net:w',
  NET_RW: 'net:rw',
  NETWORK: 'network',

  // Filesystem
  FS_R: 'fs:r',
  FS_W: 'fs:w',
  FS_RW: 'fs:rw',
  FILESYSTEM: 'filesystem',

  // Risk
  SAFE: 'safe',
  MODERATE: 'moderate',
  DANGEROUS: 'dangerous',
  DESTRUCTIVE: 'destructive',
  PAID: 'paid',

  // Source
  DYNAMIC: 'dynamic'
} as const;

export type CapabilityKind =
  | DirectiveKind
  | 'pipeline'
  | 'effect'
  | 'command'
  | 'output';

export interface SecurityDescriptor {
  readonly labels: readonly DataLabel[];
  readonly taint: readonly DataLabel[];
  readonly sources: readonly string[];
  readonly capability?: CapabilityKind;
  readonly policyContext?: Readonly<Record<string, unknown>>;
}

export interface CapabilityContext {
  readonly kind: CapabilityKind;
  readonly importType?: ImportType;
  readonly labels: readonly DataLabel[];
  readonly taint: readonly DataLabel[];
  readonly sources: readonly string[];
  readonly policy?: Readonly<Record<string, unknown>>;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly operation?: Readonly<Record<string, unknown>>;
  readonly security: SecurityDescriptor;
}

export type SerializedSecurityDescriptor = {
  labels: DataLabel[];
  taint: DataLabel[];
  sources: string[];
  capability?: CapabilityKind;
  policyContext?: Record<string, unknown>;
};

export type SerializedCapabilityContext = {
  kind: CapabilityKind;
  importType?: ImportType;
  labels: DataLabel[];
  taint: DataLabel[];
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

export const PROTECTED_LABELS: readonly DataLabel[] = [
  'secret',
  'src:mcp',
  'src:exec',
  'src:env',
  'src:file',
  'src:network',
  'src:user',
  'src:jail',
  'src:dynamic'
] as const;

export function isProtectedLabel(label: string): boolean {
  return PROTECTED_LABELS.includes(label) || label.startsWith('src:');
}

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
  taint: readonly DataLabel[],
  sources: readonly string[],
  capability?: CapabilityKind,
  policyContext?: Readonly<Record<string, unknown>>
): SecurityDescriptor {
  return Object.freeze({
    labels,
    taint,
    sources,
    capability,
    policyContext
  });
}

export function makeSecurityDescriptor(options?: {
  labels?: Iterable<DataLabel>;
  taint?: Iterable<DataLabel>;
  sources?: Iterable<string>;
  capability?: CapabilityKind;
  policyContext?: Record<string, unknown>;
}): SecurityDescriptor {
  const labels = freezeArray(options?.labels);
  const taint = freezeArray([...(options?.taint ?? []), ...labels]);
  const sources = freezeArray(options?.sources);
  const policyContext = freezeObject(options?.policyContext);
  return createDescriptor(
    labels,
    taint,
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
  const taint = (candidate as any).taint;
  const hasIterableLabels = Array.isArray(labels) && typeof labels.forEach === 'function';
  const hasIterableSources = Array.isArray(sources) && typeof sources.forEach === 'function';
  const hasIterableTaint = Array.isArray(taint) && typeof taint.forEach === 'function';

  if (hasIterableLabels && hasIterableSources && hasIterableTaint) {
    return candidate;
  }

  const normalizedLabels =
    Array.isArray(labels) ? (labels as DataLabel[]) :
    labels !== undefined && labels !== null ? [labels as DataLabel] :
    undefined;
  const normalizedTaint =
    Array.isArray(taint) ? (taint as DataLabel[]) :
    taint !== undefined && taint !== null ? [taint as DataLabel] :
    undefined;
  const normalizedSources =
    Array.isArray(sources) ? (sources as string[]) :
    sources !== undefined && sources !== null ? [sources as string] :
    undefined;

  return makeSecurityDescriptor({
    labels: normalizedLabels,
    taint: normalizedTaint,
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
  const taintSet = new Set<DataLabel>();
  let capability: CapabilityKind | undefined;
  let policyContext: Record<string, unknown> | undefined;

  for (const incoming of descriptors) {
    const descriptor = normalizeSecurityDescriptor(incoming);
    if (!descriptor) continue;

    descriptor.labels.forEach(label => {
      labelSet.add(label);
      taintSet.add(label);
    });
    descriptor.taint.forEach(label => taintSet.add(label));
    descriptor.sources.forEach(source => sourceSet.add(source));

    if (descriptor.capability) {
      capability = descriptor.capability;
    }

    if (descriptor.policyContext) {
      policyContext = { ...(policyContext ?? {}), ...descriptor.policyContext };
    }
  }

  return createDescriptor(
    freezeArray(labelSet),
    freezeArray(taintSet),
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

export function serializeSecurityDescriptor(
  descriptor: SecurityDescriptor | undefined
): SerializedSecurityDescriptor | undefined {
  if (!descriptor) return undefined;
  return {
    labels: Array.from(descriptor.labels),
    taint: Array.from(descriptor.taint),
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
    taint: serialized.taint,
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
    labels: options.descriptor.labels,
    taint: options.descriptor.taint,
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
    labels: Array.from(context.labels),
    taint: Array.from(context.taint),
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
