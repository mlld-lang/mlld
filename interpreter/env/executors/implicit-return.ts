/**
 * Utilities for normalizing inline code blocks so single expressions
 * behave like implicit returns across JavaScript and Node executors.
 */
import { parse } from 'acorn';

const WRAPPER_PREFIX = 'async function __mlldImplicitReturn__(){\n';
const WRAPPER_SUFFIX = '\n}';

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

  try {
    const wrapped = `${WRAPPER_PREFIX}${code}${WRAPPER_SUFFIX}`;
    const ast = parse(wrapped, { ecmaVersion: 'latest' as const }) as any;
    const fnBody = ast?.body?.[0]?.body?.body;
    if (!Array.isArray(fnBody) || fnBody.length === 0) {
      return fallbackImplicitReturn(code, trimmed);
    }

    if (containsReturnStatement(fnBody)) {
      return code;
    }

    if (fnBody.length === 1) {
      return fallbackImplicitReturn(code, trimmed);
    }

    const lastStatement = fnBody[fnBody.length - 1];
    if (!lastStatement || lastStatement.type !== 'ExpressionStatement') {
      return fallbackImplicitReturn(code, trimmed);
    }

    const offset = WRAPPER_PREFIX.length;
    const statementStart = Math.max(0, lastStatement.start - offset);
    const statementEnd = Math.max(statementStart, lastStatement.end - offset);
    const expressionStart = Math.max(0, lastStatement.expression.start - offset);
    const expressionEnd = Math.max(expressionStart, lastStatement.expression.end - offset);
    const expressionText = code.slice(expressionStart, expressionEnd).trim();
    if (!expressionText) {
      return fallbackImplicitReturn(code, trimmed);
    }

    return `${code.slice(0, statementStart)}return (${expressionText});${code.slice(statementEnd)}`;
  } catch {
    return fallbackImplicitReturn(code, trimmed);
  }
}

function fallbackImplicitReturn(code: string, trimmed: string): string {
  if (isWrappedExpression(trimmed)) {
    return `return ${code}`;
  }

  const isSingleLine = !code.includes('\n');
  const looksLikeStatement =
    code.includes(';') ||
    trimmed.startsWith('console.log') ||
    trimmed.startsWith('throw');

  if (isSingleLine && !looksLikeStatement) {
    return `return (${code})`;
  }

  return code;
}

function containsReturnStatement(node: unknown): boolean {
  if (!node || typeof node !== 'object') {
    return false;
  }

  if ((node as { type?: string }).type === 'ReturnStatement') {
    return true;
  }

  if (Array.isArray(node)) {
    for (const child of node) {
      if (containsReturnStatement(child)) {
        return true;
      }
    }
    return false;
  }

  for (const value of Object.values(node as Record<string, unknown>)) {
    if (containsReturnStatement(value)) {
      return true;
    }
  }

  return false;
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
