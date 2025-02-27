import type { DirectiveNode } from 'meld-spec';
import { MeldDirectiveError } from '@core/errors/MeldDirectiveError.js';
import { DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import { ErrorSeverity } from '@core/errors/MeldError.js';
import { DirectiveLocation } from '@core/errors/MeldDirectiveError.js';

/**
 * Converts AST SourceLocation to DirectiveLocation
 */
function convertLocation(location: any): DirectiveLocation {
  if (!location) return { line: 0, column: 0 };
  return {
    line: location.line,
    column: location.column
  };
}

/**
 * Validates @text directives according to spec
 */
export function validateTextDirective(node: DirectiveNode): void {
  const directive = node.directive;
  
  // Validate identifier
  if (!directive.identifier || typeof directive.identifier !== 'string') {
    throw new MeldDirectiveError(
      'Text directive requires an "identifier" property (string)',
      'text',
      {
        location: convertLocation(node.location?.start),
        code: DirectiveErrorCode.VALIDATION_FAILED,
        severity: ErrorSeverity.Fatal
      }
    );
  }
  
  // Validate identifier format
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(directive.identifier)) {
    throw new MeldDirectiveError(
      'Text directive identifier must be a valid identifier (letters, numbers, underscore, starting with letter/underscore)',
      'text',
      {
        location: convertLocation(node.location?.start),
        code: DirectiveErrorCode.VALIDATION_FAILED,
        severity: ErrorSeverity.Fatal
      }
    );
  }
  
  // Validate value
  if (directive.value === undefined || directive.value === '') {
    throw new MeldDirectiveError(
      'Text directive requires a non-empty "value" property',
      'text',
      {
        location: convertLocation(node.location?.start),
        code: DirectiveErrorCode.VALIDATION_FAILED,
        severity: ErrorSeverity.Fatal
      }
    );
  }

  // Value must be a string
  if (typeof directive.value !== 'string') {
    throw new MeldDirectiveError(
      'Text directive "value" property must be a string',
      'text',
      {
        location: convertLocation(node.location?.start),
        code: DirectiveErrorCode.VALIDATION_FAILED,
        severity: ErrorSeverity.Fatal
      }
    );
  }

  // Check if the source is specified
  if (directive.source) {
    // If source is specified, validate it
    if (directive.source !== 'literal' && directive.source !== 'embed' && 
        directive.source !== 'run' && directive.source !== 'call') {
      throw new MeldDirectiveError(
        'Text directive source must be one of: literal, embed, run, call',
        'text',
        {
          location: convertLocation(node.location?.start),
          code: DirectiveErrorCode.VALIDATION_FAILED,
          severity: ErrorSeverity.Fatal
        }
      );
    }

    // For call source, validate the value format
    if (directive.source === 'call') {
      // Value should be in format "api.method [path]"
      const callPattern = /^[a-zA-Z_][a-zA-Z0-9_]*\.[a-zA-Z_][a-zA-Z0-9_]*\s+\[[^\]]*\]$/;
      if (!callPattern.test(directive.value)) {
        throw new MeldDirectiveError(
          'Invalid call format in text directive. Must be "api.method [path]"',
          'text',
          {
            location: convertLocation(node.location?.start),
            code: DirectiveErrorCode.VALIDATION_FAILED,
            severity: ErrorSeverity.Fatal
          }
        );
      }
    }
  } else if (directive.value.startsWith('@')) {
    // For backward compatibility, check if value starts with @
    const validPrefixes = ['@embed', '@run', '@call'];
    const prefix = validPrefixes.find(p => directive.value.startsWith(p));
    
    if (!prefix) {
      throw new MeldDirectiveError(
        'Text directive value starting with @ must be an @embed, @run, or @call directive',
        'text',
        {
          location: convertLocation(node.location?.start),
          code: DirectiveErrorCode.VALIDATION_FAILED,
          severity: ErrorSeverity.Fatal
        }
      );
    }

    // For @call, validate format
    if (directive.value.startsWith('@call')) {
      const callPattern = /^@call\s+[a-zA-Z_][a-zA-Z0-9_]*\.[a-zA-Z_][a-zA-Z0-9_]*\s+\[[^\]]*\]$/;
      if (!callPattern.test(directive.value)) {
        throw new MeldDirectiveError(
          'Invalid @call format in text directive. Must be "@call api.method [path]"',
          'text',
          {
            location: convertLocation(node.location?.start),
            code: DirectiveErrorCode.VALIDATION_FAILED,
            severity: ErrorSeverity.Fatal
          }
        );
      }
    }
  } else {
    // It's a literal string value
    // Check for mismatched quotes
    const firstQuote = directive.value[0];
    const lastQuote = directive.value[directive.value.length - 1];
    
    // Allow both single and double quotes, but they must match
    if (firstQuote !== lastQuote || !["'", '"', '`'].includes(firstQuote)) {
      // If the value contains quotes inside, they must be properly escaped
      const unescapedQuotes = directive.value.match(/(?<!\\)['"`]/g);
      if (unescapedQuotes && unescapedQuotes.length > 2) {
        throw new MeldDirectiveError(
          'Text directive string value contains unescaped quotes',
          'text',
          {
            location: convertLocation(node.location?.start),
            code: DirectiveErrorCode.VALIDATION_FAILED,
            severity: ErrorSeverity.Fatal
          }
        );
      }
    }

    // Check for multiline strings in non-template literals
    if (firstQuote !== '`' && directive.value.includes('\n')) {
      throw new MeldDirectiveError(
        'Multiline strings are only allowed in template literals (backtick quotes)',
        'text',
        {
          location: convertLocation(node.location?.start),
          code: DirectiveErrorCode.VALIDATION_FAILED,
          severity: ErrorSeverity.Fatal
        }
      );
    }
  }
} 