/**
 * Output Normalizer
 *
 * Simple line-based normalization that replaces Prettier.
 * Eliminates hanging bug, JSON protection hacks, and adds ~0ms overhead.
 */

/**
 * Normalize output content
 *
 * Rules:
 * 1. Strip trailing whitespace per line
 * 2. Collapse 3+ newlines to max 2 (one blank line)
 * 3. Ensure single trailing newline
 *
 * This replaces Prettier markdown formatting with a simple,
 * predictable normalization that doesn't require workarounds.
 *
 * @param output Raw output string
 * @returns Normalized output
 */
export function normalizeOutput(output: string): string {
  return output
    .replace(/[ \t]+$/gm, '')      // Strip trailing whitespace per line
    .replace(/\n{3,}/g, '\n\n')    // Max one blank line
    .replace(/\n*$/, '\n');        // Single trailing newline
}

/**
 * Normalize output with custom options
 */
export interface NormalizationOptions {
  /** Strip trailing whitespace (default: true) */
  stripTrailingWhitespace?: boolean;

  /** Maximum consecutive newlines (default: 2) */
  maxConsecutiveNewlines?: number;

  /** Ensure trailing newline (default: true) */
  ensureTrailingNewline?: boolean;
}

/**
 * Normalize output with custom options
 */
export function normalizeOutputWithOptions(
  output: string,
  options: NormalizationOptions = {}
): string {
  const {
    stripTrailingWhitespace = true,
    maxConsecutiveNewlines = 2,
    ensureTrailingNewline = true
  } = options;

  let result = output;

  if (stripTrailingWhitespace) {
    result = result.replace(/[ \t]+$/gm, '');
  }

  if (maxConsecutiveNewlines > 0) {
    const pattern = new RegExp(`\\n{${maxConsecutiveNewlines + 1},}`, 'g');
    const replacement = '\n'.repeat(maxConsecutiveNewlines);
    result = result.replace(pattern, replacement);
  }

  if (ensureTrailingNewline) {
    result = result.replace(/\n*$/, '\n');
  }

  return result;
}
