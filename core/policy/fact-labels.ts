export interface ParsedFactLabel {
  raw: string;
  tiers: readonly string[];
  ref: string;
  sourceRef: string;
  field: string;
  fieldSegments: readonly string[];
}

interface ParsedFactPattern {
  raw: string;
  tiers: readonly string[];
  matchKind: 'exact' | 'fieldSuffix';
  ref: string;
  sourceRef?: string;
  field: string;
  fieldSegments: readonly string[];
}

function normalizeParts(parts: readonly string[]): string[] {
  const normalized: string[] = [];
  for (const part of parts) {
    const value = part.trim();
    if (!value) {
      return [];
    }
    normalized.push(value.toLowerCase());
  }
  return normalized;
}

function parseExactFactRef(ref: string): ParsedFactLabel | null {
  const trimmed = ref.trim();
  if (!trimmed.startsWith('@')) {
    return null;
  }

  const parts = normalizeParts(trimmed.slice(1).split('.'));
  if (parts.length < 2) {
    return null;
  }

  const field = parts[parts.length - 1]!;
  const sourceParts = parts.slice(0, -1);
  if (sourceParts.length === 0) {
    return null;
  }

  const sourceRef = `@${sourceParts.join('.')}`;
  return {
    raw: '',
    tiers: [],
    ref: `${sourceRef}.${field}`,
    sourceRef,
    field,
    fieldSegments: Object.freeze([field])
  };
}

function parseFieldSuffixPattern(ref: string): ParsedFactPattern | null {
  const trimmed = ref.trim();
  if (!trimmed.startsWith('*.')) {
    return null;
  }

  const fieldParts = normalizeParts(trimmed.slice(2).split('.'));
  if (fieldParts.length === 0) {
    return null;
  }

  return {
    raw: '',
    tiers: [],
    matchKind: 'fieldSuffix',
    ref: `*.${fieldParts.join('.')}`,
    field: fieldParts.join('.'),
    fieldSegments: Object.freeze(fieldParts)
  };
}

export function parseFactLabel(label: string): ParsedFactLabel | null {
  if (typeof label !== 'string') {
    return null;
  }

  const trimmed = label.trim();
  if (!trimmed.startsWith('fact:')) {
    return null;
  }

  const segments = trimmed.split(':');
  if (segments.length < 2) {
    return null;
  }

  const ref = segments[segments.length - 1]!;
  const parsedRef = parseExactFactRef(ref);
  if (!parsedRef) {
    return null;
  }

  const tiers = normalizeParts(segments.slice(1, -1));
  return {
    ...parsedRef,
    raw: trimmed.toLowerCase(),
    tiers: Object.freeze(tiers)
  };
}

function parseFactPattern(pattern: string): ParsedFactPattern | null {
  if (typeof pattern !== 'string') {
    return null;
  }

  const trimmed = pattern.trim();
  if (!trimmed.startsWith('fact:')) {
    return null;
  }

  const segments = trimmed.split(':');
  if (segments.length < 2) {
    return null;
  }

  const ref = segments[segments.length - 1]!;
  const exactRef = parseExactFactRef(ref);
  if (exactRef) {
    return {
      raw: trimmed.toLowerCase(),
      tiers: Object.freeze(normalizeParts(segments.slice(1, -1))),
      matchKind: 'exact',
      ref: exactRef.ref,
      sourceRef: exactRef.sourceRef,
      field: exactRef.field,
      fieldSegments: exactRef.fieldSegments
    };
  }

  const suffixPattern = parseFieldSuffixPattern(ref);
  if (!suffixPattern) {
    return null;
  }

  return {
    ...suffixPattern,
    raw: trimmed.toLowerCase(),
    tiers: Object.freeze(normalizeParts(segments.slice(1, -1)))
  };
}

function hasMatchingFieldSuffix(
  patternSegments: readonly string[],
  labelSegments: readonly string[]
): boolean {
  if (patternSegments.length > labelSegments.length) {
    return false;
  }

  for (let index = 1; index <= patternSegments.length; index += 1) {
    if (patternSegments[patternSegments.length - index] !== labelSegments[labelSegments.length - index]) {
      return false;
    }
  }

  return true;
}

export function matchesFactPattern(pattern: string, label: string): boolean {
  const parsedPattern = parseFactPattern(pattern);
  const parsedLabel = parseFactLabel(label);
  if (!parsedPattern || !parsedLabel) {
    return false;
  }

  if (parsedPattern.tiers.length > 0) {
    if (parsedPattern.tiers.length !== parsedLabel.tiers.length) {
      return false;
    }
    for (let index = 0; index < parsedPattern.tiers.length; index += 1) {
      if (parsedPattern.tiers[index] !== parsedLabel.tiers[index]) {
        return false;
      }
    }
  }

  if (parsedPattern.matchKind === 'exact') {
    return parsedPattern.ref === parsedLabel.ref;
  }

  return hasMatchingFieldSuffix(parsedPattern.fieldSegments, parsedLabel.fieldSegments);
}

export function collectFactLabels(values: readonly string[] | undefined): string[] {
  if (!values || values.length === 0) {
    return [];
  }

  const labels = new Set<string>();
  for (const value of values) {
    const parsed = parseFactLabel(value);
    if (parsed) {
      labels.add(parsed.raw);
    }
  }
  return Array.from(labels);
}

export function hasMatchingFactLabel(
  values: readonly string[] | undefined,
  pattern: string
): boolean {
  if (!values || values.length === 0) {
    return false;
  }

  return values.some(value => matchesFactPattern(pattern, value));
}

export function matchesLabelPattern(pattern: string, label: string): boolean {
  if (pattern === '*') {
    return true;
  }

  if (pattern.startsWith('fact:')) {
    return matchesFactPattern(pattern, label);
  }

  if (label.startsWith('fact:')) {
    return false;
  }

  return label === pattern || label.startsWith(`${pattern}:`);
}

export function getLabelPatternSpecificity(pattern: string): number {
  if (pattern === '*') {
    return 0;
  }

  const parsedPattern = parseFactPattern(pattern);
  if (!parsedPattern) {
    return pattern.split(':').length;
  }

  const fieldWeight = parsedPattern.matchKind === 'exact' ? 100 : 10;
  return parsedPattern.tiers.length * 1000 + fieldWeight + parsedPattern.fieldSegments.length;
}
