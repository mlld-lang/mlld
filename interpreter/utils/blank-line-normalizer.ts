/**
 * Utilities for normalizing blank lines in mlld output
 */

/**
 * Normalize blank lines between output elements.
 * 
 * Rule: No more than one blank line between any output elements
 * (consecutive newlines > 2 are reduced to 2)
 * 
 * @param content The content to normalize
 * @returns Normalized content
 */
export function normalizeOutputBlankLines(content: string): string {
  // Replace 3 or more consecutive newlines with exactly 2
  // This ensures max 1 blank line between elements
  return content.replace(/\n{3,}/g, '\n\n');
}

/**
 * Normalize final output ensuring it ends with exactly one newline
 * 
 * @param content The content to normalize
 * @returns Normalized content
 */
export function normalizeFinalOutput(content: string): string {
  // First normalize blank lines between elements
  let normalized = normalizeOutputBlankLines(content);
  
  // Ensure exactly one trailing newline if there's content
  if (normalized.length > 0) {
    normalized = normalized.replace(/\n*$/, '\n');
  }
  
  return normalized;
}