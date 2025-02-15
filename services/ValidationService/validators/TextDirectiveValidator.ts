import type { DirectiveNode, TextDirective } from 'meld-spec';
import { MeldDirectiveError } from '../../../core/errors/MeldDirectiveError';

/**
 * Validates @text directives according to spec
 */
export function validateTextDirective(node: DirectiveNode): void {
  const directive = node.directive as TextDirective;
  
  // Validate name
  if (!directive.name || typeof directive.name !== 'string') {
    throw new MeldDirectiveError(
      'Text directive requires a "name" property (string)',
      'text',
      node.location?.start
    );
  }
  
  // Validate name format
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(directive.name)) {
    throw new MeldDirectiveError(
      'Text directive name must be a valid identifier (letters, numbers, underscore, starting with letter/underscore)',
      'text',
      node.location?.start
    );
  }
  
  // Validate value
  if (directive.value === undefined) {
    throw new MeldDirectiveError(
      'Text directive requires a "value" property',
      'text',
      node.location?.start
    );
  }

  // Value must be a string
  if (typeof directive.value !== 'string') {
    throw new MeldDirectiveError(
      'Text directive value must be a string',
      'text',
      node.location?.start
    );
  }

  // If it's a quoted string (not from @embed, @run, or @call), validate quotes
  if (!directive.value.startsWith('@')) {
    // Check for mismatched quotes
    const firstQuote = directive.value[0];
    const lastQuote = directive.value[directive.value.length - 1];
    
    if (firstQuote !== lastQuote || !["'", '"', '`'].includes(firstQuote)) {
      throw new MeldDirectiveError(
        'Text directive string value must be properly quoted with matching quotes (single, double, or backtick)',
        'text',
        node.location?.start
      );
    }

    // Check for multiline strings in non-template literals
    if (firstQuote !== '`' && directive.value.includes('\n')) {
      throw new MeldDirectiveError(
        'Multiline strings are only allowed in template literals (backtick quotes)',
        'text',
        node.location?.start
      );
    }
  } else {
    // Value is from @embed, @run, or @call
    const validPrefixes = ['@embed', '@run', '@call'];
    const prefix = validPrefixes.find(p => directive.value.startsWith(p));
    
    if (!prefix) {
      throw new MeldDirectiveError(
        'Text directive value starting with @ must be an @embed, @run, or @call directive',
        'text',
        node.location?.start
      );
    }

    // For @call, validate format
    if (directive.value.startsWith('@call')) {
      const callPattern = /^@call\s+[a-zA-Z_][a-zA-Z0-9_]*\.[a-zA-Z_][a-zA-Z0-9_]*\s+\[[^\]]*\]$/;
      if (!callPattern.test(directive.value)) {
        throw new MeldDirectiveError(
          'Invalid @call format in text directive. Must be "@call api.method [path]"',
          'text',
          node.location?.start
        );
      }
    }
  }
} 