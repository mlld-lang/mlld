/**
 * Utilities for normalizing inline code blocks so single expressions
 * behave like implicit returns across JavaScript and Node executors.
 */

/**
 * Add an implicit return to expression-style code snippets when no explicit
 * return statement exists. This aligns both single-line helpers like
 * `js {(value)}` and multi-line parenthesized object literals.
 */
export function addImplicitReturn(code: string): string {
  const trimmed = code.trim();
  if (!trimmed) {
    return code;
  }

  // Preserve existing explicit returns – behaviour matches legacy logic that
  // short-circuited on any "return" token.
  if (code.includes('return')) {
    return code;
  }

  // Handle parenthesized expressions (e.g., object/array literals) even when
  // formatted across multiple lines.
  if (isWrappedExpression(trimmed)) {
    return `return ${code}`;
  }

  // Preserve legacy single-line implicit return behaviour for simple helpers.
  const isSingleLine = !code.includes('\n');
  const looksLikeStatement =
    code.includes(';') || trimmed.startsWith('console.log');

  if (isSingleLine && !looksLikeStatement) {
    return `return (${code})`;
  }

  return code;
}

/**
 * Detect if the code is wrapped in a single pair of parentheses that enclose
 * the entire expression. Tracks basic string escaping to avoid mismatched
 * parentheses inside string literals.
 */
function isWrappedExpression(trimmed: string): boolean {
  if (!trimmed.startsWith('(') || !trimmed.endsWith(')')) {
    return false;
  }

  let depth = 0;
  let inString: '"' | "'" | '`' | null = null;
  let isEscaped = false;

  for (let i = 0; i < trimmed.length; i++) {
    const char = trimmed[i];

    if (inString) {
      if (isEscaped) {
        isEscaped = false;
        continue;
      }
      if (char === '\\') {
        isEscaped = true;
        continue;
      }
      if (char === inString) {
        inString = null;
      }
      continue;
    }

    if (char === '"' || char === "'" || char === '`') {
      inString = char;
      continue;
    }

    if (char === '(') {
      depth += 1;
      // If we close the outermost pair before the end, it is not fully wrapped.
      if (depth === 1 && i !== 0) {
        // Additional opening parenthesis inside; continue scanning.
      }
    } else if (char === ')') {
      depth -= 1;
      if (depth === 0 && i !== trimmed.length - 1) {
        return false;
      }
      if (depth < 0) {
        return false;
      }
    }
  }

  return depth === 0;
}
