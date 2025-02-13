import type { DirectiveNode, TextDirective } from 'meld-spec';
import { MeldDirectiveError } from '../../../core/errors/MeldDirectiveError';

export function validateTextDirective(node: DirectiveNode): void {
  const directive = node.directive as TextDirective;
  
  // Check required fields from meld-spec
  if (!directive.name || typeof directive.name !== 'string') {
    throw new MeldDirectiveError(
      'Text directive requires a "name" property (string)',
      'text',
      node.location?.start
    );
  }
  
  if (!directive.value || typeof directive.value !== 'string') {
    throw new MeldDirectiveError(
      'Text directive requires a "value" property (string)',
      'text',
      node.location?.start
    );
  }
  
  // Validate variable name format
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(directive.name)) {
    throw new MeldDirectiveError(
      'Text directive name must be a valid identifier (letters, numbers, underscore, starting with letter/underscore)',
      'text',
      node.location?.start
    );
  }
} 