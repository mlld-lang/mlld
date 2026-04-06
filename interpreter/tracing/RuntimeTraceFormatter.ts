import type { RuntimeTraceEvent } from '@core/types/trace';

export function formatRuntimeTraceLine(event: RuntimeTraceEvent): string {
  const scopeTokens = Object.entries(event.scope)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${key}=${formatRuntimeTraceScalar(value)}`);
  const dataTokens = Object.entries(event.data)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${key}=${formatRuntimeTraceScalar(value)}`);
  const tokens = [
    `[trace:${event.category}]`,
    event.event,
    ...scopeTokens,
    ...dataTokens
  ];
  return tokens.join(' ');
}

function formatRuntimeTraceScalar(value: unknown): string {
  if (typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (value === null) {
    return 'null';
  }
  if (value === undefined) {
    return 'undefined';
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
