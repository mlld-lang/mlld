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
  KNOWN: 'known',
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

export interface ToolProvenance {
  readonly name: string;
  readonly args?: readonly string[];
  readonly auditRef?: string;
}

export interface SecurityDescriptor {
  readonly labels: readonly DataLabel[];
  readonly taint: readonly DataLabel[];
  readonly attestations: readonly DataLabel[];
  readonly sources: readonly string[];
  readonly urls?: readonly string[];
  readonly tools?: readonly ToolProvenance[];
  readonly capability?: CapabilityKind;
  readonly policyContext?: Readonly<Record<string, unknown>>;
}

export interface CapabilityContext {
  readonly kind: CapabilityKind;
  readonly importType?: ImportType;
  readonly labels: readonly DataLabel[];
  readonly taint: readonly DataLabel[];
  readonly attestations: readonly DataLabel[];
  readonly sources: readonly string[];
  readonly urls?: readonly string[];
  readonly policy?: Readonly<Record<string, unknown>>;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly operation?: Readonly<Record<string, unknown>>;
  readonly security: SecurityDescriptor;
}

export type SerializedSecurityDescriptor = {
  labels: DataLabel[];
  taint: DataLabel[];
  attestations: DataLabel[];
  sources: string[];
  urls?: string[];
  tools?: ToolProvenance[];
  capability?: CapabilityKind;
  policyContext?: Record<string, unknown>;
};

export type SerializedCapabilityContext = {
  kind: CapabilityKind;
  importType?: ImportType;
  labels: DataLabel[];
  taint: DataLabel[];
  attestations: DataLabel[];
  sources: string[];
  urls?: string[];
  policy?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  operation?: Record<string, unknown>;
  security: SerializedSecurityDescriptor;
};

export const DATA_LABELS: readonly DataLabel[] = [
  'secret',
  'pii',
  'known',
  'untrusted',
  'public',
  'trusted',
  'destructive',
  'network'
] as const;

export const PROTECTED_LABELS: readonly DataLabel[] = [
  'secret',
  'untrusted',
  'src:mcp',
  'src:exec',
  'src:env',
  'src:file',
  'src:network',
  'src:node',
  'src:user',
  'src:jail',
  'src:dynamic'
] as const;

export function isProtectedLabel(label: string): boolean {
  return PROTECTED_LABELS.includes(label) || label.startsWith('src:');
}

export function isAttestationLabel(label: string): boolean {
  return label === BUILTIN_LABELS.KNOWN || label.startsWith(`${BUILTIN_LABELS.KNOWN}:`);
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

function freezeToolProvenanceEntry(entry: ToolProvenance): ToolProvenance | undefined {
  if (!entry || typeof entry.name !== 'string') {
    return undefined;
  }

  const name = entry.name.trim();
  if (!name) {
    return undefined;
  }

  const args = Array.isArray(entry.args)
    ? Object.freeze(
        entry.args
          .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
          .map(value => value.trim())
      ) as readonly string[]
    : undefined;
  const auditRef =
    typeof entry.auditRef === 'string' && entry.auditRef.trim().length > 0
      ? entry.auditRef.trim()
      : undefined;

  return Object.freeze({
    name,
    ...(args && args.length > 0 ? { args } : {}),
    ...(auditRef ? { auditRef } : {})
  });
}

function freezeToolArray(
  values: Iterable<ToolProvenance> | undefined
): readonly ToolProvenance[] | undefined {
  if (!values) {
    return undefined;
  }

  const deduped: ToolProvenance[] = [];
  const seenAuditRefs = new Set<string>();

  for (const value of values) {
    const normalized = freezeToolProvenanceEntry(value);
    if (!normalized) {
      continue;
    }
    if (normalized.auditRef) {
      if (seenAuditRefs.has(normalized.auditRef)) {
        continue;
      }
      seenAuditRefs.add(normalized.auditRef);
    }
    deduped.push(normalized);
  }

  if (deduped.length === 0) {
    return undefined;
  }

  return Object.freeze(deduped);
}

function createDescriptor(
  labels: readonly DataLabel[],
  taint: readonly DataLabel[],
  attestations: readonly DataLabel[],
  sources: readonly string[],
  urls?: readonly string[],
  tools?: readonly ToolProvenance[],
  capability?: CapabilityKind,
  policyContext?: Readonly<Record<string, unknown>>
): SecurityDescriptor {
  return Object.freeze({
    labels,
    taint,
    attestations,
    sources,
    ...(urls && urls.length > 0 ? { urls } : {}),
    ...(tools && tools.length > 0 ? { tools } : {}),
    capability,
    policyContext
  });
}

export function makeSecurityDescriptor(options?: {
  labels?: Iterable<DataLabel>;
  taint?: Iterable<DataLabel>;
  attestations?: Iterable<DataLabel>;
  sources?: Iterable<string>;
  urls?: Iterable<string>;
  tools?: Iterable<ToolProvenance>;
  capability?: CapabilityKind;
  policyContext?: Record<string, unknown>;
}): SecurityDescriptor {
  const labels = freezeArray(options?.labels);
  const attestations = freezeArray([
    ...(options?.attestations ?? []),
    ...labels.filter(isAttestationLabel)
  ]);
  const taint = freezeArray([
    ...(options?.taint ?? []),
    ...labels.filter(label => !isAttestationLabel(label))
  ]);
  const sources = freezeArray(options?.sources);
  const urls = freezeArray(options?.urls);
  const tools = freezeToolArray(options?.tools);
  const policyContext = freezeObject(options?.policyContext);
  return createDescriptor(
    labels,
    taint,
    attestations,
    sources,
    urls,
    tools,
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
  const urls = (candidate as any).urls;
  const taint = (candidate as any).taint;
  const attestations = (candidate as any).attestations;
  const tools = (candidate as any).tools;
  const hasIterableLabels = Array.isArray(labels) && typeof labels.forEach === 'function';
  const hasIterableSources = Array.isArray(sources) && typeof sources.forEach === 'function';
  const hasIterableUrls = urls === undefined || (Array.isArray(urls) && typeof urls.forEach === 'function');
  const hasIterableTaint = Array.isArray(taint) && typeof taint.forEach === 'function';
  const hasIterableAttestations =
    Array.isArray(attestations) && typeof attestations.forEach === 'function';
  const hasIterableTools =
    tools === undefined || (Array.isArray(tools) && typeof tools.forEach === 'function');

  if (
    hasIterableLabels &&
    hasIterableSources &&
    hasIterableUrls &&
    hasIterableTaint &&
    hasIterableAttestations &&
    hasIterableTools
  ) {
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
  const normalizedUrls =
    Array.isArray(urls) ? (urls as string[]) :
    urls !== undefined && urls !== null ? [urls as string] :
    undefined;
  const normalizedAttestations =
    Array.isArray(attestations) ? (attestations as DataLabel[]) :
    attestations !== undefined && attestations !== null ? [attestations as DataLabel] :
    undefined;

  return makeSecurityDescriptor({
    labels: normalizedLabels,
    taint: normalizedTaint,
    attestations: normalizedAttestations,
    sources: normalizedSources,
    urls: normalizedUrls,
    tools: Array.isArray(tools) ? (tools as ToolProvenance[]) : undefined,
    capability: (candidate as any).capability,
    policyContext: (candidate as any).policyContext
  });
}

export function mergeDescriptors(
  ...descriptors: Array<SecurityDescriptorLike>
): SecurityDescriptor {
  const labelSet = new Set<DataLabel>();
  const sourceSet = new Set<string>();
  const urlSet = new Set<string>();
  const taintSet = new Set<DataLabel>();
  const attestationSet = new Set<DataLabel>();
  const toolList: ToolProvenance[] = [];
  const seenToolAuditRefs = new Set<string>();
  let capability: CapabilityKind | undefined;
  let policyContext: Record<string, unknown> | undefined;

  for (const incoming of descriptors) {
    const descriptor = normalizeSecurityDescriptor(incoming);
    if (!descriptor) continue;

    descriptor.labels.forEach(label => {
      labelSet.add(label);
      if (!isAttestationLabel(label)) {
        taintSet.add(label);
      }
    });
    descriptor.taint.forEach(label => taintSet.add(label));
    descriptor.attestations.forEach(label => {
      attestationSet.add(label);
      labelSet.add(label);
    });
    descriptor.sources.forEach(source => sourceSet.add(source));
    descriptor.urls?.forEach(url => urlSet.add(url));
    for (const tool of descriptor.tools ?? []) {
      if (tool.auditRef) {
        if (seenToolAuditRefs.has(tool.auditRef)) {
          continue;
        }
        seenToolAuditRefs.add(tool.auditRef);
      }
      toolList.push(tool);
    }

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
    freezeArray(attestationSet),
    freezeArray(sourceSet),
    freezeArray(urlSet),
    freezeToolArray(toolList),
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
    attestations: Array.from(descriptor.attestations),
    sources: Array.from(descriptor.sources),
    ...(descriptor.urls ? { urls: Array.from(descriptor.urls) } : {}),
    tools: descriptor.tools
      ? descriptor.tools.map(tool => ({
          name: tool.name,
          ...(tool.args ? { args: Array.from(tool.args) } : {}),
          ...(tool.auditRef ? { auditRef: tool.auditRef } : {})
        }))
      : undefined,
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
    attestations: serialized.attestations,
    sources: serialized.sources,
    urls: serialized.urls,
    tools: serialized.tools,
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
    attestations: options.descriptor.attestations,
    sources: options.descriptor.sources,
    ...(options.descriptor.urls ? { urls: options.descriptor.urls } : {}),
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
    attestations: Array.from(context.attestations),
    sources: Array.from(context.sources),
    ...(context.urls ? { urls: Array.from(context.urls) } : {}),
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
