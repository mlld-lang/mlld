export function getMaterializedStructuredText(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const descriptor = Object.getOwnPropertyDescriptor(value, 'text');
  return descriptor && 'value' in descriptor && typeof descriptor.value === 'string'
    ? descriptor.value
    : undefined;
}
