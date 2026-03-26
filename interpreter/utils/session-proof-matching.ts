import type { Environment } from '@interpreter/env/Environment';
import { VariableMetadataUtils } from '@core/types/variable';
import { deserializeSecurityDescriptor } from '@core/types/security';
import {
  applySecurityDescriptorToStructuredValue,
  isStructuredValue,
  extractSecurityDescriptor,
  asData,
  setRecordProjectionMetadata,
  wrapStructured,
  type StructuredValue
} from './structured-value';
import { isVariable } from './variable-resolution';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function canonicalizeValue(value: unknown): string | undefined {
  const raw = isVariable(value)
    ? value.value
    : isStructuredValue(value)
      ? asData(value)
      : value;

  const encode = (entry: unknown, seen: WeakSet<object>): string | undefined => {
    if (entry === undefined) {
      return 'undefined';
    }
    if (entry === null) {
      return 'null';
    }
    if (typeof entry === 'string') {
      return `string:${JSON.stringify(entry)}`;
    }
    if (typeof entry === 'number') {
      return Number.isNaN(entry) ? 'number:NaN' : `number:${entry}`;
    }
    if (typeof entry === 'boolean') {
      return `boolean:${entry ? '1' : '0'}`;
    }
    if (Array.isArray(entry)) {
      const items: string[] = [];
      for (const item of entry) {
        const encoded = encode(item, seen);
        if (encoded === undefined) {
          return undefined;
        }
        items.push(encoded);
      }
      return `array:[${items.join(',')}]`;
    }
    if (!entry || typeof entry !== 'object') {
      return undefined;
    }
    if (seen.has(entry as object)) {
      return undefined;
    }
    seen.add(entry as object);
    const record = entry as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    const parts: string[] = [];
    for (const key of keys) {
      const encoded = encode(record[key], seen);
      if (encoded === undefined) {
        return undefined;
      }
      parts.push(`${JSON.stringify(key)}:${encoded}`);
    }
    return `object:{${parts.join(',')}}`;
  };

  return encode(raw, new WeakSet<object>());
}

function proofStrength(value: unknown): number {
  const descriptor = extractSecurityDescriptor(value, { recursive: false });
  if (!descriptor) {
    return 0;
  }

  const labels = Array.isArray(descriptor.labels) ? descriptor.labels : [];
  const attestations = Array.isArray(descriptor.attestations) ? descriptor.attestations : [];
  const factsources = Array.isArray(descriptor.sources) ? descriptor.sources : [];

  const hasFact = labels.some(label => typeof label === 'string' && label.startsWith('fact:'));
  if (hasFact) {
    return 3;
  }
  if (attestations.length > 0) {
    return 2;
  }
  if (labels.length > 0 || factsources.length > 0) {
    return 1;
  }
  return 0;
}

function iterateChildren(value: unknown): unknown[] {
  const resolved = isVariable(value) ? value.value : value;

  if (isStructuredValue(resolved)) {
    const namespaceChildren = getNamespaceChildren(resolved);
    if (namespaceChildren.length > 0) {
      return namespaceChildren;
    }
    if (resolved.type === 'array' && Array.isArray(resolved.data)) {
      return resolved.data;
    }
    if (resolved.type === 'object' && resolved.data && typeof resolved.data === 'object' && !Array.isArray(resolved.data)) {
      return Object.values(resolved.data as Record<string, unknown>);
    }
    return [];
  }

  if (Array.isArray(resolved)) {
    return resolved;
  }

  if (resolved && typeof resolved === 'object') {
    return Object.values(resolved as Record<string, unknown>);
  }

  return [];
}

function getNamespaceChildren(value: StructuredValue): unknown[] {
  if (value.type !== 'object' || !value.data || typeof value.data !== 'object' || Array.isArray(value.data)) {
    return [];
  }
  const namespaceMetadata = value.internal &&
    typeof value.internal === 'object' &&
    'namespaceMetadata' in value.internal
      ? (value.internal as Record<string, unknown>).namespaceMetadata
      : undefined;
  if (!namespaceMetadata || typeof namespaceMetadata !== 'object') {
    return [];
  }

  const children: unknown[] = [];
  for (const [fieldName, fieldValue] of Object.entries(value.data as Record<string, unknown>)) {
    const rawMetadata = (namespaceMetadata as Record<string, unknown>)[fieldName];
    if (!rawMetadata || typeof rawMetadata !== 'object') {
      children.push(fieldValue);
      continue;
    }

    const payload = rawMetadata as Record<string, unknown>;
    const legacy = VariableMetadataUtils.deserializeSecurityMetadata(payload as any).security;
    const descriptor = legacy ?? deserializeSecurityDescriptor(payload.security as any);
    const child = isStructuredValue(fieldValue)
      ? fieldValue
      : wrapStructured(fieldValue as any);

    if (descriptor) {
      applySecurityDescriptorToStructuredValue(child, descriptor);
    }

    if (Array.isArray(payload.factsources)) {
      child.metadata = {
        ...(child.metadata ?? {}),
        factsources: [...payload.factsources]
      };
      child.mx.factsources = [...payload.factsources];
    }

    if (payload.projection && typeof payload.projection === 'object') {
      setRecordProjectionMetadata(child, payload.projection as any);
    }

    children.push(child);
  }

  return children;
}

export function findSessionProofMatch(value: unknown, env: Environment): unknown | undefined {
  const targetKey = canonicalizeValue(value);
  if (!targetKey) {
    return undefined;
  }

  let bestMatch: unknown | undefined;
  let bestStrength = 0;
  const seen = new WeakSet<object>();

  const visit = (entry: unknown): void => {
    const candidateKey = canonicalizeValue(entry);
    const candidateStrength = proofStrength(entry);
    if (candidateKey === targetKey && candidateStrength > bestStrength) {
      bestMatch = entry;
      bestStrength = candidateStrength;
    }

    const raw = isVariable(entry)
      ? entry.value
      : isStructuredValue(entry)
        ? entry.data
        : entry;
    if (!raw || typeof raw !== 'object') {
      return;
    }
    if (seen.has(raw as object)) {
      return;
    }
    seen.add(raw as object);

    for (const child of iterateChildren(entry)) {
      visit(child);
    }
  };

  for (const root of env.getFyiAutoFactRoots()) {
    visit(root);
  }

  return bestMatch;
}

export function materializeSessionProofMatches(value: unknown, env: Environment): unknown {
  if (isVariable(value) || isStructuredValue(value)) {
    return value;
  }

  const matched = findSessionProofMatch(value, env);
  if (matched !== undefined) {
    return matched;
  }

  if (Array.isArray(value)) {
    return value.map(item => materializeSessionProofMatches(item, env));
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        materializeSessionProofMatches(entry, env)
      ])
    );
  }

  return value;
}
