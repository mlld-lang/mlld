import { DirectiveNode, ImportDirective } from 'meld-spec';
import { MeldDirectiveError } from '@core/errors/MeldDirectiveError.js';
import { DirectiveErrorCode } from '@services/DirectiveService/errors/DirectiveError.js';

/**
 * Validates @import directives
 */
export function validateImportDirective(node: DirectiveNode): void {
  const directive = node.directive as ImportDirective;
  
  if (!directive.value) {
    throw new MeldDirectiveError(
      'Import directive requires a path',
      'import',
      node.location,
      DirectiveErrorCode.VALIDATION_FAILED
    );
  }

  // Try new format: @import [x,y,z] from [file.md] or @import [file.md]
  const newFormatMatch = directive.value.match(/^\s*\[([^\]]+)\](?:\s+from\s+\[([^\]]+)\])?\s*$/);
  if (newFormatMatch) {
    const [, importsOrPath, fromPath] = newFormatMatch;
    const path = fromPath || importsOrPath;

    // Validate path
    validatePath(path, node);

    // If it's an explicit import list, validate each import
    if (fromPath && importsOrPath !== '*') {
      validateImportList(importsOrPath, node);
    }
    return;
  }

  // Try old format with path parameter
  const pathMatch = directive.value.match(/path\s*=\s*["']([^"']+)["']/);
  if (!pathMatch) {
    throw new MeldDirectiveError(
      'Invalid import syntax. Expected either @import [file.md] or @import [x,y,z] from [file.md]',
      'import',
      node.location,
      DirectiveErrorCode.VALIDATION_FAILED
    );
  }

  const path = pathMatch[1];
  validatePath(path, node);

  // Check for import list in old format
  const importListMatch = directive.value.match(/imports\s*=\s*\[(.*?)\]/);
  if (importListMatch) {
    const importList = importListMatch[1].trim();
    if (importList) {
      validateImportList(importList, node);
    }
  }
}

function validatePath(path: string, node: DirectiveNode): void {
  // Validate path is not empty
  if (path.trim() === '') {
    throw new MeldDirectiveError(
      'Import path cannot be empty',
      'import',
      node.location,
      DirectiveErrorCode.VALIDATION_FAILED
    );
  }

  // Validate path format
  if (path.includes('..')) {
    throw new MeldDirectiveError(
      'Import path cannot contain parent directory references (..)',
      'import',
      node.location,
      DirectiveErrorCode.VALIDATION_FAILED
    );
  }
}

function validateImportList(importList: string, node: DirectiveNode): void {
  if (importList === '*') {
    return; // Wildcard import is valid
  }

  const imports = importList.split(',');
  for (const imp of imports) {
    const asMatch = imp.trim().match(/^(\S+)(?:\s+as\s+(\S+))?$/);
    if (!asMatch) {
      throw new MeldDirectiveError(
        `Invalid import syntax: ${imp}`,
        'import',
        node.location,
        DirectiveErrorCode.VALIDATION_FAILED
      );
    }

    const [, identifier, alias] = asMatch;
    if (!identifier || identifier.trim() === '') {
      throw new MeldDirectiveError(
        'Import identifier cannot be empty',
        'import',
        node.location,
        DirectiveErrorCode.VALIDATION_FAILED
      );
    }

    if (alias && alias.trim() === '') {
      throw new MeldDirectiveError(
        'Import alias cannot be empty',
        'import',
        node.location,
        DirectiveErrorCode.VALIDATION_FAILED
      );
    }
  }
} 