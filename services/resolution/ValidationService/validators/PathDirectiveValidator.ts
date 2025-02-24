import { DirectiveNode, PathDirective } from 'meld-spec';
import { MeldDirectiveError } from '@core/errors/MeldDirectiveError.js';
import { DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';

/**
 * Validates @path directives
 * Format: @path variable = "$./path" or "$~/path" or "$PROJECTPATH/path" or "$HOMEPATH/path"
 * The AST will have already parsed and normalized the path variables
 */
export function validatePathDirective(node: DirectiveNode): void {
  const directive = node.directive as PathDirective;
  
  // Validate identifier
  if (!directive.identifier || typeof directive.identifier !== 'string') {
    throw new MeldDirectiveError(
      'Path directive requires an "identifier" property (string)',
      'path',
      node.location?.start,
      DirectiveErrorCode.VALIDATION_FAILED
    );
  }
  
  // Validate identifier format
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(directive.identifier)) {
    throw new MeldDirectiveError(
      'Path identifier must be a valid identifier (letters, numbers, underscore, starting with letter/underscore)',
      'path',
      node.location?.start,
      DirectiveErrorCode.VALIDATION_FAILED
    );
  }
  
  // Validate value exists
  if (!directive.value || typeof directive.value !== 'string') {
    throw new MeldDirectiveError(
      'Path directive requires a "value" property (string)',
      'path',
      node.location?.start,
      DirectiveErrorCode.VALIDATION_FAILED
    );
  }

  // The AST will have already validated and normalized the path format
  // We just need to ensure it's not empty
  if (directive.value.trim() === '') {
    throw new MeldDirectiveError(
      'Path value cannot be empty',
      'path',
      node.location?.start,
      DirectiveErrorCode.VALIDATION_FAILED
    );
  }
} 