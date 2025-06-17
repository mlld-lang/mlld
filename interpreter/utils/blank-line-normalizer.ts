/**
 * Utilities for normalizing blank lines in mlld output
 */

/**
 * Normalize blank lines in template content.
 * 
 * Rules:
 * 1. Remove the first newline immediately after [[ opening
 * 2. Remove a single trailing newline before ]] closing
 *    (but preserve intentional blank lines)
 * 
 * @param content The template content to normalize
 * @param isTemplate Whether this is inside double brackets [[...]]
 * @returns Normalized content
 */
export function normalizeTemplateContent(content: string, isTemplate: boolean = false): string {
  if (!isTemplate) {
    return content;
  }
  
  // Rule 1: Remove leading newline after [[
  // This prevents extra blank lines at the start of template output
  let normalized = content;
  if (normalized.startsWith('\n')) {
    normalized = normalized.slice(1);
  }
  
  // Rule 2: Remove a single trailing newline before ]]
  // This is because the newline before ]] is usually just formatting,
  // not intended as part of the output
  if (normalized.endsWith('\n')) {
    normalized = normalized.slice(0, -1);
  }
  
  return normalized;
}

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