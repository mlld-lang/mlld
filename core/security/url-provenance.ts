import { makeSecurityDescriptor } from '@core/types/security';
import type { SecurityDescriptor } from '@core/types/security';

const URL_PATTERN = /\b[a-z][a-z0-9+.-]*:\/\/[^\s<>"'`]+/gi;
const TRAILING_TRIM_CHARS = new Set(['.', ',', ';', ':', '!', '?']);
const EXTERNAL_INPUT_MARKERS = ['src:file', 'src:network', 'src:mcp', 'src:user'] as const;
const SKIPPED_OBJECT_KEYS = new Set([
  'mx',
  'metadata',
  'internal',
  'source',
  'definedAt',
  'createdAt',
  'modifiedAt',
  'interpolationPoints',
  'parameters',
  'templateAst'
]);

function trimExtractedCandidate(candidate: string): string {
  let trimmed = candidate.trim();
  while (trimmed.length > 0) {
    const last = trimmed[trimmed.length - 1];
    if (TRAILING_TRIM_CHARS.has(last)) {
      trimmed = trimmed.slice(0, -1);
      continue;
    }
    if (last === ')' || last === ']' || last === '}') {
      const opposite = last === ')' ? '(' : last === ']' ? '[' : '{';
      const opens = trimmed.split(opposite).length - 1;
      const closes = trimmed.split(last).length - 1;
      if (closes > opens) {
        trimmed = trimmed.slice(0, -1);
        continue;
      }
    }
    break;
  }
  return trimmed;
}

export function normalizeExtractedUrl(candidate: string): string | undefined {
  const trimmed = trimExtractedCandidate(candidate);
  if (!trimmed) {
    return undefined;
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return undefined;
  }

  if (!parsed.protocol || !parsed.hostname) {
    return undefined;
  }

  parsed.hash = '';
  if (
    (parsed.protocol === 'http:' && parsed.port === '80') ||
    (parsed.protocol === 'https:' && parsed.port === '443')
  ) {
    parsed.port = '';
  }
  if (!parsed.pathname) {
    parsed.pathname = '/';
  }

  return parsed.toString();
}

export function extractUrlsFromText(text: string): readonly string[] {
  if (typeof text !== 'string' || text.length === 0) {
    return [];
  }

  const results: string[] = [];
  const seen = new Set<string>();
  for (const match of text.matchAll(URL_PATTERN)) {
    const normalized = normalizeExtractedUrl(match[0]);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    results.push(normalized);
  }
  return results;
}

function isVariableLike(value: Record<string, unknown>): value is Record<string, unknown> & { value: unknown } {
  return (
    Object.prototype.hasOwnProperty.call(value, 'value') &&
    Object.prototype.hasOwnProperty.call(value, 'name') &&
    Object.prototype.hasOwnProperty.call(value, 'type')
  );
}

function isStructuredLike(value: Record<string, unknown>): value is Record<string, unknown> & {
  data: unknown;
  text?: unknown;
} {
  return (
    Object.prototype.hasOwnProperty.call(value, 'data') &&
    Object.prototype.hasOwnProperty.call(value, 'text') &&
    Object.prototype.hasOwnProperty.call(value, 'type')
  );
}

function extractUrlsFromValueInternal(
  value: unknown,
  seenObjects: WeakSet<object>,
  urls: string[],
  seenUrls: Set<string>
): void {
  if (value === null || value === undefined) {
    return;
  }

  if (typeof value === 'string') {
    for (const url of extractUrlsFromText(value)) {
      if (seenUrls.has(url)) {
        continue;
      }
      seenUrls.add(url);
      urls.push(url);
    }
    return;
  }

  if (typeof value !== 'object') {
    return;
  }

  if (seenObjects.has(value as object)) {
    return;
  }
  seenObjects.add(value as object);

  if (Array.isArray(value)) {
    for (const entry of value) {
      extractUrlsFromValueInternal(entry, seenObjects, urls, seenUrls);
    }
    return;
  }

  const record = value as Record<string, unknown>;
  if (isVariableLike(record)) {
    extractUrlsFromValueInternal(record.value, seenObjects, urls, seenUrls);
    return;
  }

  if (isStructuredLike(record)) {
    extractUrlsFromValueInternal(record.data, seenObjects, urls, seenUrls);
    if (typeof record.text === 'string') {
      extractUrlsFromValueInternal(record.text, seenObjects, urls, seenUrls);
    }
    return;
  }

  for (const [key, entry] of Object.entries(record)) {
    if (SKIPPED_OBJECT_KEYS.has(key) || typeof entry === 'function') {
      continue;
    }
    extractUrlsFromValueInternal(entry, seenObjects, urls, seenUrls);
  }
}

export function extractUrlsFromValue(value: unknown): readonly string[] {
  const urls: string[] = [];
  extractUrlsFromValueInternal(value, new WeakSet(), urls, new Set());
  return urls;
}

export function replaceDescriptorUrls(
  descriptor: SecurityDescriptor | undefined,
  urls: readonly string[] | undefined
): SecurityDescriptor | undefined {
  if (!descriptor && (!urls || urls.length === 0)) {
    return undefined;
  }

  const normalizedUrls = Array.isArray(urls) ? urls.filter(url => typeof url === 'string' && url.length > 0) : [];
  return makeSecurityDescriptor({
    labels: descriptor?.labels,
    taint: descriptor?.taint,
    attestations: descriptor?.attestations,
    sources: descriptor?.sources,
    urls: normalizedUrls,
    tools: descriptor?.tools,
    capability: descriptor?.capability,
    policyContext: descriptor?.policyContext ? { ...descriptor.policyContext } : undefined
  });
}

export function descriptorHasExternalInputSource(
  descriptor: SecurityDescriptor | undefined
): boolean {
  if (!descriptor) {
    return false;
  }
  const labels = [...descriptor.labels, ...descriptor.taint];
  return EXTERNAL_INPUT_MARKERS.some(marker => labels.includes(marker));
}

function normalizeAllowedConstructionPattern(pattern: string): string | undefined {
  const trimmed = pattern.trim().toLowerCase();
  if (!trimmed) {
    return undefined;
  }
  if (trimmed.startsWith('*.')) {
    return trimmed;
  }
  return trimmed.replace(/^\.+/, '').replace(/\.+$/, '');
}

export function isUrlAllowedByConstruction(
  url: string,
  patterns: readonly string[] | undefined
): boolean {
  if (!patterns || patterns.length === 0) {
    return false;
  }

  let hostname: string;
  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }

  for (const rawPattern of patterns) {
    if (typeof rawPattern !== 'string') {
      continue;
    }
    const pattern = normalizeAllowedConstructionPattern(rawPattern);
    if (!pattern) {
      continue;
    }
    if (pattern.startsWith('*.')) {
      const suffix = pattern.slice(2);
      if (hostname === suffix || hostname.endsWith(`.${suffix}`)) {
        return true;
      }
      continue;
    }
    if (hostname === pattern || hostname.endsWith(`.${pattern}`)) {
      return true;
    }
  }

  return false;
}
