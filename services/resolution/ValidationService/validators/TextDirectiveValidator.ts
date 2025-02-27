import type { DirectiveNode } from 'meld-spec';
import { MeldDirectiveError } from '@core/errors/MeldDirectiveError.js';
import { DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import { ErrorSeverity } from '@core/errors/MeldError.js';

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
        location: node.location?.start,
        code: DirectiveErrorCode.VALIDATION_FAILED,
        severity: ErrorSeverity.Recoverable
      }
    );
  }
  
  // NOTE: AST parser already validates the identifier format, so we don't need regex here
  // If the identifier made it to the AST, it's already in the correct format
  
  // Validate value
  if (directive.value === undefined || directive.value === '') {
    throw new MeldDirectiveError(
      'Text directive requires a non-empty "value" property',
      'text',
      {
        location: node.location?.start,
        code: DirectiveErrorCode.VALIDATION_FAILED,
        severity: ErrorSeverity.Recoverable
      }
    );
  }

  // Value must be a string
  if (typeof directive.value !== 'string') {
    throw new MeldDirectiveError(
      'Text directive "value" property must be a string',
      'text',
      {
        location: node.location?.start,
        code: DirectiveErrorCode.VALIDATION_FAILED,
        severity: ErrorSeverity.Recoverable
      }
    );
  }

  // If it's a quoted string (not from @embed, @run, or @call), validate quotes
  if (!directive.value.startsWith('@')) {
    // Since the AST correctly parses quoted strings with appropriate escaping,
    // we no longer need to check for unescaped quotes manually
    
    // Check for multiline strings in non-template literals
    const firstQuote = directive.value[0];
    if (firstQuote !== '`' && directive.value.includes('\n')) {
      throw new MeldDirectiveError(
        'Multiline strings are only allowed in template literals (backtick quotes)',
        'text',
        {
          location: node.location?.start,
          code: DirectiveErrorCode.VALIDATION_FAILED,
          severity: ErrorSeverity.Recoverable
        }
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
        {
          location: node.location?.start,
          code: DirectiveErrorCode.VALIDATION_FAILED,
          severity: ErrorSeverity.Recoverable
        }
      );
    }

    // For @call, we can trust the AST has already validated the syntax
    // No need to apply regex pattern matching as the parser already validates this
  }
} 