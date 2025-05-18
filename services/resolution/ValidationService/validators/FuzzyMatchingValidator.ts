import type { DirectiveNode } from '@core/syntax/types';
import { MeldDirectiveError } from '@core/errors/MeldDirectiveError';

/**
 * Validates fuzzy matching threshold values in directives that support them.
 * Valid thresholds must be numbers between 0 and 1 inclusive.
 * Undefined thresholds are allowed (will use default).
 */
export function validateFuzzyThreshold(node: DirectiveNode): void {
  // Check for fuzzy property in new AST structure (meta or raw)
  const fuzzy = (node as any).meta?.fuzzy ?? (node as any).fuzzy;

  // Undefined is valid (will use default)
  if (fuzzy === undefined) {
    return;
  }

  // Must be a number
  if (typeof fuzzy !== 'number' || isNaN(fuzzy) || fuzzy === null || fuzzy === true || fuzzy === false) {
    throw new MeldDirectiveError(
      'Fuzzy matching threshold must be a number',
      node.kind,
      node.location?.start
    );
  }

  // Must be between 0 and 1
  if (fuzzy < 0 || fuzzy > 1) {
    throw new MeldDirectiveError(
      'Fuzzy matching threshold must be between 0 and 1',
      node.kind,
      node.location?.start
    );
  }
} 