import { DirectiveNode } from '@core/syntax/types';
import { MeldDirectiveError } from '@core/errors/MeldDirectiveError';
import { DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError';
import { ErrorSeverity } from '@core/errors/MeldError';

// Define interface matching the meld-ast structure for data directives
interface DataDirectiveData {
  kind: 'data';
  identifier: string;
  source: 'literal' | 'reference';
  value: any;
}

/**
 * Validates @data directives using AST-based approaches
 */
export function validateDataDirective(node: DirectiveNode): void {
  const directive = node.directive as DataDirectiveData;
  
  // Validate identifier
  if (!directive.identifier || typeof directive.identifier !== 'string') {
    throw new MeldDirectiveError(
      'Data directive requires an "identifier" property (string)',
      'data',
      {
        location: node.location?.start,
        code: DirectiveErrorCode.VALIDATION_FAILED,
        severity: ErrorSeverity.Fatal
      }
    );
  }
  
  // Validate identifier format using character-by-character validation
  // instead of regex
  const isValid = isValidIdentifier(directive.identifier);
  if (!isValid) {
    throw new MeldDirectiveError(
      'Data identifier must be a valid identifier (letters, numbers, underscore, starting with letter/underscore)',
      'data',
      {
        location: node.location?.start,
        code: DirectiveErrorCode.VALIDATION_FAILED,
        severity: ErrorSeverity.Fatal
      }
    );
  }
  
  // Validate value
  if (directive.value === undefined) {
    throw new MeldDirectiveError(
      'Data directive requires a value',
      'data',
      {
        location: node.location?.start,
        code: DirectiveErrorCode.VALIDATION_FAILED,
        severity: ErrorSeverity.Fatal
      }
    );
  }
  
  // Validate source type if present
  if (directive.source && !['literal', 'reference'].includes(directive.source)) {
    throw new MeldDirectiveError(
      `Invalid source type "${directive.source}" for data directive, must be "literal" or "reference"`,
      'data',
      {
        location: node.location?.start,
        code: DirectiveErrorCode.VALIDATION_FAILED,
        severity: ErrorSeverity.Fatal
      }
    );
  }
  
  // REMOVED: This check is problematic if the value is meant to be a plain string.
  // The handler will attempt JSON.parse after interpolation if needed.
  /*
  if (typeof directive.value === 'string' && directive.source === 'literal') {
    try {
      JSON.parse(directive.value);
    } catch (error) {
      // AST parser should have handled this, but double-check
      throw new MeldDirectiveError(
        'Invalid JSON string in data directive',
        'data',
        {
          location: node.location?.start,
          code: DirectiveErrorCode.VALIDATION_FAILED,
          severity: ErrorSeverity.Fatal
        }
      );
    }
  }
  */
  
  // Validate value is JSON-serializable
  try {
    JSON.stringify(directive.value);
  } catch (error) {
    throw new MeldDirectiveError(
      'Data value must be JSON-serializable',
      'data',
      {
        location: node.location?.start,
        code: DirectiveErrorCode.VALIDATION_FAILED,
        severity: ErrorSeverity.Fatal
      }
    );
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