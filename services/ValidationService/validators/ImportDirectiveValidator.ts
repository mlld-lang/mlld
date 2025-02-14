import { DirectiveNode, ImportDirective } from 'meld-spec';
import { MeldDirectiveError } from '../../../core/errors/MeldDirectiveError';

/**
 * Validates @import directives
 */
export function validateImportDirective(node: DirectiveNode): void {
  const directive = node.directive as ImportDirective;
  
  // Validate path
  if (!directive.path || typeof directive.path !== 'string') {
    throw new MeldDirectiveError(
      'Import directive requires a path parameter',
      'import',
      node.location?.start
    );
  }
  
  // Validate path format
  if (directive.path.includes('..')) {
    throw new MeldDirectiveError(
      'Import path cannot contain parent directory references (..)',
      'import',
      node.location?.start
    );
  }
  
  // Validate path is not empty
  if (directive.path.trim() === '') {
    throw new MeldDirectiveError(
      'Import path cannot be empty',
      'import',
      node.location?.start
    );
  }
  
  // Check required fields from meld-spec
  if (directive.section !== undefined && typeof directive.section !== 'string') {
    throw new MeldDirectiveError(
      'Import directive "section" property must be a string if provided',
      'import',
      node.location?.start
    );
  }
  
  if (directive.fuzzy !== undefined) {
    if (typeof directive.fuzzy !== 'number' || directive.fuzzy < 0 || directive.fuzzy > 1) {
      throw new MeldDirectiveError(
        'Import directive "fuzzy" property must be a number between 0 and 1 if provided',
        'import',
        node.location?.start
      );
    }
  }
} 