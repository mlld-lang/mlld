import type { DirectiveNode, DataDirective } from 'meld-spec';
import { MeldDirectiveError } from '../../../core/errors/MeldDirectiveError';

export function validateDataDirective(node: DirectiveNode): void {
  const directive = node.directive as DataDirective;
  
  // Check required fields from meld-spec
  if (!directive.name || typeof directive.name !== 'string') {
    throw new MeldDirectiveError(
      'Data directive requires a "name" property (string)',
      'data',
      node.location?.start
    );
  }
  
  if (directive.value === undefined || directive.value === null) {
    throw new MeldDirectiveError(
      'Data directive requires a "value" property',
      'data',
      node.location?.start
    );
  }
  
  // Validate variable name format
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(directive.name)) {
    throw new MeldDirectiveError(
      'Data directive name must be a valid identifier (letters, numbers, underscore, starting with letter/underscore)',
      'data',
      node.location?.start
    );
  }
  
  // Validate value is valid JSON
  try {
    if (typeof directive.value === 'string') {
      JSON.parse(directive.value);
    } else if (typeof directive.value !== 'object') {
      throw new Error('Invalid value type');
    }
  } catch (error) {
    throw new MeldDirectiveError(
      'Data directive value must be valid JSON or a JavaScript object',
      'data',
      node.location?.start
    );
  }
} 