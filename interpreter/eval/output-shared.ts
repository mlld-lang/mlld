/**
 * Shared helpers for output-style directives.
 */
export function formatJSONL(value: unknown): string {
  return JSON.stringify(value);
}
