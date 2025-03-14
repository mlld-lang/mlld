/**
 * Fixed Path Directive Validator
 * 
 * The issue is that the path directive is being produced by the parser with an 'id' property,
 * but the validator is expecting an 'identifier' property.
 */

import { DirectiveNode, PathDirective } from '@core/syntax/types';
import { MeldDirectiveError } from '@core/errors/MeldDirectiveError.js';
import { DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';

/**
 * Validates @path directives
 * Format: @path variable = "$./path" or "$~/path" or "$PROJECTPATH/path" or "$HOMEPATH/path"
 * The AST will have already parsed and normalized the path variables
 */
export function validatePathDirective(node: DirectiveNode): void {
  const directive = node.directive as any; // Use any to allow for different property names
  
  // Get the identifier from either identifier or id property
  const identifier = directive.identifier || directive.id;
  
  // Validate identifier exists
  if (!identifier || typeof identifier !== 'string') {
    throw new MeldDirectiveError(
      'Path directive requires an identifier (either "identifier" or "id" property must be a string)',
      'path',
      node.location?.start,
      DirectiveErrorCode.VALIDATION_FAILED
    );
  }
  
  // Validate identifier format
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(identifier)) {
    throw new MeldDirectiveError(
      'Path identifier must be a valid identifier (letters, numbers, underscore, starting with letter/underscore)',
      'path',
      node.location?.start,
      DirectiveErrorCode.VALIDATION_FAILED
    );
  }
  
  // Get the path value from either value or path.raw property
  const pathValue = directive.value || (directive.path && directive.path.raw);
  
  // Validate path value exists
  if (!pathValue || typeof pathValue !== 'string') {
    throw new MeldDirectiveError(
      'Path directive requires a path value (either "value" or "path.raw" property must be a string)',
      'path',
      node.location?.start,
      DirectiveErrorCode.VALIDATION_FAILED
    );
  }

  // The AST will have already validated and normalized the path format
  // We just need to ensure it's not empty
  if (pathValue.trim() === '') {
    throw new MeldDirectiveError(
      'Path value cannot be empty',
      'path',
      node.location?.start,
      DirectiveErrorCode.VALIDATION_FAILED
    );
  }
}