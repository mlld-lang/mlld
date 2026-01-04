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
 * 1. Strip leading newlines
 * 2. Strip trailing whitespace per line
 * 3. Ensure blank line before headers
 * 4. Ensure blank line after headers
 * 5. Collapse 3+ newlines to max 2 (one blank line)
 * 6. Ensure single trailing newline
 *
 * This replaces Prettier markdown formatting with a simple,
 * predictable normalization that doesn't require workarounds.
 *
 * @param output Raw output string
 * @returns Normalized output
 */
export function normalizeOutput(output: string): string {
  // Protect frontmatter blocks from all formatting rules
  // Match frontmatter after stripping leading newlines
  const withoutLeadingNewlines = output.replace(/^\n+/, '');
  const frontmatterRegex = /^---\n[\s\S]*?\n---\n/;
  const frontmatterMatch = withoutLeadingNewlines.match(frontmatterRegex);
  const frontmatter = frontmatterMatch ? frontmatterMatch[0] : '';
  const content = frontmatterMatch ? withoutLeadingNewlines.slice(frontmatter.length) : withoutLeadingNewlines;

  const normalized = content
    .replace(/^\n+/, '')                    // Strip leading newlines from content
    .replace(/[ \t]+$/gm, '')               // Strip trailing whitespace per line
    .replace(/\n(#{1,6}\s)/g, '\n\n$1')     // Blank line before headers
    .replace(/(#{1,6}\s[^\n]+)\n([^\n#])/g, '$1\n\n$2')  // Blank line after headers (if next line isn't header/blank)
    .replace(/([^{\[\n])\n([^\n#\s\-}\]])/g, '$1\n\n$2')  // Blank line between paragraphs (exclude JSON/arrays/headers/lists)
    .replace(/\n{3,}/g, '\n\n')             // Max one blank line (collapse extras from rules)
    .replace(/\n*$/, '\n');                 // Single trailing newline

  // Add blank line after frontmatter if present and content follows
  const separator = (frontmatter && normalized && !normalized.startsWith('\n')) ? '\n' : '';
  return frontmatter + separator + normalized;
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
