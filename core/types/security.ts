import type { DirectiveKind } from './primitives';

export type ImportType = 'module' | 'static' | 'live' | 'cached' | 'local';

// Placeholder label set; concrete definitions arrive in later phases.
export type SecurityLabel =
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
  readonly labels: ReadonlySet<SecurityLabel>;
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

export function makeSecurityDescriptor(options?: {
  labels?: Iterable<SecurityLabel>;
  taint?: TaintLevel;
  source?: CapabilitySource;
  inference?: SecurityDescriptor['inference'];
}): SecurityDescriptor {
  const labels = new Set(options?.labels ?? []);
  return {
    labels,
    taint: options?.taint ?? 'unknown',
    source: options?.source,
    inference: options?.inference ?? 'explicit'
  };
}

export function mergeDescriptors(
  ...descriptors: Array<SecurityDescriptor | undefined>
): SecurityDescriptor {
  const labels = new Set<SecurityLabel>();
  let taint: TaintLevel = 'unknown';

  for (const descriptor of descriptors) {
    if (!descriptor) continue;
    descriptor.labels.forEach(label => labels.add(label));
    taint = compareTaintLevels(taint, descriptor.taint);
  }

  return {
    labels,
    taint,
    inference: descriptors.every(d => d?.inference === 'explicit') ? 'explicit' : 'inferred'
  };
}

export function hasLabel(
  descriptor: SecurityDescriptor | undefined,
  label: SecurityLabel
): boolean {
  if (!descriptor) return false;
  return descriptor.labels.has(label);
}

export function compareTaintLevels(a: TaintLevel, b: TaintLevel): TaintLevel {
  const order: TaintLevel[] = [
    'llmOutput',
    'networkLive',
    'networkCached',
    'resolver',
    'userInput',
    'commandOutput',
    'localFile',
    'staticEmbed',
    'module',
    'literal',
    'unknown'
  ];

  if (a === b) return a;
  const indexA = order.indexOf(a);
  const indexB = order.indexOf(b);
  if (indexA === -1) return b;
  if (indexB === -1) return a;
  return indexA <= indexB ? a : b;
}
