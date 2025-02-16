import { DirectiveNode, ImportDirective } from 'meld-spec';
import { MeldDirectiveError } from '@core/errors/MeldDirectiveError.js';
import { DirectiveErrorCode } from '@services/DirectiveService/errors/DirectiveError.js';

/**
 * Validates @import directives
 */
export function validateImportDirective(node: DirectiveNode): void {
  const directive = node.directive as ImportDirective;
  
  // Parse path from value in new format
  const pathMatch = directive.value?.match(/^path\s*=\s*"([^"]+)"$/);
  if (!pathMatch) {
    throw new MeldDirectiveError(
      'Import directive requires a path parameter in the format: path = "filepath"',
      'import',
      node.location,
      DirectiveErrorCode.VALIDATION_FAILED
    );
  }
  
  const path = pathMatch[1];
  
  // Validate path format
  if (path.includes('..')) {
    throw new MeldDirectiveError(
      'Import path cannot contain parent directory references (..)',
      'import',
      node.location,
      DirectiveErrorCode.VALIDATION_FAILED
    );
  }
  
  // Validate path is not empty
  if (path.trim() === '') {
    throw new MeldDirectiveError(
      'Import path cannot be empty',
      'import',
      node.location,
      DirectiveErrorCode.VALIDATION_FAILED
    );
  }
  
  // Check section and fuzzy parameters if present in the value
  const sectionMatch = directive.value?.match(/section\s*=\s*"([^"]+)"/);
  const fuzzyMatch = directive.value?.match(/fuzzy\s*=\s*([\d.]+)/);
  
  if (sectionMatch) {
    const section = sectionMatch[1];
    if (typeof section !== 'string' || section.trim() === '') {
      throw new MeldDirectiveError(
        'Import directive "section" parameter must be a non-empty string',
        'import',
        node.location,
        DirectiveErrorCode.VALIDATION_FAILED
      );
    }
  }
  
  if (fuzzyMatch) {
    const fuzzy = parseFloat(fuzzyMatch[1]);
    if (isNaN(fuzzy) || fuzzy < 0 || fuzzy > 1) {
      throw new MeldDirectiveError(
        'Import directive "fuzzy" parameter must be a number between 0 and 1',
        'import',
        node.location,
        DirectiveErrorCode.VALIDATION_FAILED
      );
    }
  }
} 