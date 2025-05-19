import { DirectiveNode } from '@core/types/ast-nodes';
import { MeldDirectiveError } from '@core/errors/MeldDirectiveError';
import { DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError';
import { ErrorSeverity } from '@core/errors/MeldError';

/**
 * Validates @data directives using new AST structure
 * Grammar handles all syntax validation - we only do semantic checks
 */
export function validateDataDirective(node: DirectiveNode): void {
  // With new AST structure, directives have flattened properties
  if (!node.kind || node.kind !== 'data') {
    throw new MeldDirectiveError(
      'Expected data directive',
      'data',
      {
        location: node.location?.start,
        code: DirectiveErrorCode.VALIDATION_FAILED,
        severity: ErrorSeverity.Fatal
      }
    );
  }
  
  // Check for identifier in values
  if (!node.values?.identifier || !Array.isArray(node.values.identifier) || 
      node.values.identifier.length === 0) {
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
  
  // Check if identifier is empty
  const identifierNode = node.values.identifier[0];
  const identifier = identifierNode.identifier;
  
  if (!identifier || typeof identifier !== 'string' || identifier.trim() === '') {
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
  
  // Validate identifier format
  const firstChar = identifier.charAt(0);
  if (!/[a-zA-Z_]/.test(firstChar)) {
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
  
  // Check for value - could be in raw.value or values.value
  const value = node.raw?.value ?? node.values?.value;
  
  // Basic validation for JSON strings (the test expects this)
  if (typeof value === 'string' && value.trim() !== '') {
    // Try to parse as JSON if it looks like JSON
    if (value.startsWith('{') || value.startsWith('[')) {
      try {
        JSON.parse(value);
      } catch (error) {
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
  }
}