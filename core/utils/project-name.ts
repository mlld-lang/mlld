const PROJECT_NAME_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export function isValidProjectName(name: string): boolean {
  return PROJECT_NAME_PATTERN.test(name);
}

export function normalizeProjectName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    return '';
  }
  const sanitized = trimmed
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return sanitized.slice(0, 64);
}
