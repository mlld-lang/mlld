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
 * Uses AST-based validation instead of regex
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
  
  // Validate identifier format - check first character and rest separately
  // This is how AST would validate an identifier
  const firstChar = directive.identifier.charAt(0);
  if (!(firstChar === '_' || (firstChar >= 'a' && firstChar <= 'z') || (firstChar >= 'A' && firstChar <= 'Z'))) {
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
  
  // Check the rest of the characters
  for (let i = 1; i < directive.identifier.length; i++) {
    const char = directive.identifier.charAt(i);
    if (!((char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z') || 
          (char >= '0' && char <= '9') || char === '_')) {
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

    // For call source, validate the value format without regex
    if (directive.source === 'call') {
      // Value should be in format "api.method [path]"
      // Parse components directly without regex
      const parts = directive.value.split(' ');
      const hasMethod = parts[0] && parts[0].includes('.');
      const methodParts = parts[0] ? parts[0].split('.') : [];
      const hasTwoParts = methodParts.length === 2;
      
      // Check api and method naming
      const hasValidApi = hasTwoParts && isValidIdentifier(methodParts[0]);
      const hasValidMethod = hasTwoParts && isValidIdentifier(methodParts[1]);
      
      // Check path format
      const path = parts.slice(1).join(' ').trim();
      const hasValidPath = path.startsWith('[') && path.endsWith(']');
      
      if (!(hasMethod && hasValidApi && hasValidMethod && hasValidPath)) {
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

    // For @call, validate format without regex
    if (directive.value.startsWith('@call')) {
      // Extract parts without using regex
      const valueAfterCall = directive.value.substring('@call'.length).trim();
      
      // Find the first space to separate api.method from path
      const firstSpaceIndex = valueAfterCall.indexOf(' ');
      if (firstSpaceIndex === -1) {
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
      
      // Extract api.method part
      const apiMethodPart = valueAfterCall.substring(0, firstSpaceIndex);
      const hasDot = apiMethodPart.includes('.');
      
      // Extract api and method parts
      const apiMethodParts = hasDot ? apiMethodPart.split('.') : [];
      const hasValidApiMethod = apiMethodParts.length === 2 && 
                               isValidIdentifier(apiMethodParts[0]) && 
                               isValidIdentifier(apiMethodParts[1]);
      
      // Extract path part
      const pathPart = valueAfterCall.substring(firstSpaceIndex + 1).trim();
      const hasValidPath = pathPart.startsWith('[') && pathPart.endsWith(']');
      
      if (!(hasDot && hasValidApiMethod && hasValidPath)) {
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
      // Instead of regex, manually check for unescaped quotes
      let unescapedQuoteCount = 0;
      for (let i = 0; i < directive.value.length; i++) {
        const char = directive.value[i];
        if ((char === "'" || char === '"' || char === '`') && 
            (i === 0 || directive.value[i-1] !== '\\')) {
          unescapedQuoteCount++;
        }
      }
      
      if (unescapedQuoteCount > 2) {
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

/**
 * Helper function to validate identifier format without regex
 */
function isValidIdentifier(str: string): boolean {
  if (!str || str.length === 0) return false;
  
  // First character must be letter or underscore
  const firstChar = str.charAt(0);
  if (!(firstChar === '_' || (firstChar >= 'a' && firstChar <= 'z') || (firstChar >= 'A' && firstChar <= 'Z'))) {
    return false;
  }
  
  // Rest of characters must be letters, numbers, or underscore
  for (let i = 1; i < str.length; i++) {
    const char = str.charAt(i);
    if (!((char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z') || 
          (char >= '0' && char <= '9') || char === '_')) {
      return false;
    }
  }
  
  return true;
} 