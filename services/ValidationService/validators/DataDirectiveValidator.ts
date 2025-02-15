import { DirectiveNode, DataDirective } from 'meld-spec';
import { MeldDirectiveError } from '../../../core/errors/MeldDirectiveError';

/**
 * Validates @data directives
 */
export function validateDataDirective(node: DirectiveNode): void {
  const directive = node.directive as DataDirective;
  
  // Validate name
  if (!directive.name || typeof directive.name !== 'string') {
    throw new MeldDirectiveError(
      'Data directive requires a name parameter',
      'data',
      node.location?.start
    );
  }
  
  // Validate name format
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(directive.name)) {
    throw new MeldDirectiveError(
      'Data name must be a valid identifier (letters, numbers, underscore, starting with letter/underscore)',
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