import { DirectiveNode, DataDirective } from 'meld-spec';
import { MeldDirectiveError } from '../../../core/errors/MeldDirectiveError';

/**
 * Validates @data directives
 */
export function validateDataDirective(node: DirectiveNode): void {
  const directive = node.directive as DataDirective;
  
  // Validate identifier
  if (!directive.identifier || typeof directive.identifier !== 'string') {
    throw new MeldDirectiveError(
      'Data directive requires an "identifier" property (string)',
      'data',
      node.location?.start
    );
  }
  
  // Validate identifier format
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(directive.identifier)) {
    throw new MeldDirectiveError(
      'Data identifier must be a valid identifier (letters, numbers, underscore, starting with letter/underscore)',
      'data',
      node.location?.start
    );
  }
  
  // Validate value
  if (directive.value === undefined) {
    throw new MeldDirectiveError(
      'Data directive requires a value',
      'data',
      node.location?.start
    );
  }
  
  // If value is a string, try to parse it as JSON
  if (typeof directive.value === 'string') {
    try {
      JSON.parse(directive.value);
    } catch (error) {
      throw new MeldDirectiveError(
        'Invalid JSON string in data directive',
        'data',
        node.location?.start
      );
    }
  }
  
  // Validate value is JSON-serializable
  try {
    JSON.stringify(directive.value);
  } catch (error) {
    throw new MeldDirectiveError(
      'Data value must be JSON-serializable',
      'data',
      node.location?.start
    );
  }
} 