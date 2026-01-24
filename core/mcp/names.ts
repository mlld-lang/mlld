const UPPERCASE_PATTERN = /([A-Z])/g;
const NON_ALPHANUMERIC_PATTERN = /[^a-zA-Z0-9_]/g;

export function mlldNameToMCPName(name: string): string {
  return name
    .replace(UPPERCASE_PATTERN, '_$1')
    .toLowerCase()
    .replace(NON_ALPHANUMERIC_PATTERN, '_')
    .replace(/^_+/, '')
    .replace(/_+/g, '_');
}

export function mcpNameToMlldName(name: string): string {
  const normalized = name.replace(NON_ALPHANUMERIC_PATTERN, '_');
  const camel = normalized.replace(/_([a-zA-Z0-9])/g, (_, letter: string) => letter.toUpperCase());
  if (!camel) {
    return '_';
  }
  if (!/^[a-zA-Z_]/.test(camel)) {
    return `_${camel}`;
  }
  return camel;
}
