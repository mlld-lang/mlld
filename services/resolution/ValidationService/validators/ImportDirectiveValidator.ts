import { DirectiveNode, ImportDirective } from 'meld-spec';
import { MeldDirectiveError } from '@core/errors/MeldDirectiveError.js';
import { DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';

/**
 * Validates @import directives
 */
export function validateImportDirective(node: DirectiveNode): void {
  const directive = node.directive as ImportDirective;
  
  // Handle both old format (value) and new format (path)
  // Properly handle the path object or string
  let pathValue: string | null = null;
  
  if (directive.value && typeof directive.value === 'string') {
    pathValue = directive.value;
  } else if (directive.path) {
    if (typeof directive.path === 'string') {
      pathValue = directive.path;
    } else if (directive.path.raw && typeof directive.path.raw === 'string') {
      pathValue = directive.path.raw;
    } else if (directive.path.normalized && typeof directive.path.normalized === 'string') {
      pathValue = directive.path.normalized;
    }
  }
  
  if (!pathValue) {
    throw new MeldDirectiveError(
      'Import directive requires a valid path',
      'import',
      node.location,
      DirectiveErrorCode.VALIDATION_FAILED
    );
  }

  // Try new format: @import [x,y,z] from [file.md] or @import [file.md]
  // Now also handles path variables like [$./file.md]
  const newFormatMatch = pathValue.match(/^\s*\[([^\]]+)\](?:\s+from\s+\[([^\]]+)\])?\s*$/);
  if (newFormatMatch) {
    const [, importsOrPath, fromPath] = newFormatMatch;
    const path = fromPath || importsOrPath;

    // Validate path
    validatePath(path.trim(), node);

    // If it's an explicit import list, validate each import
    if (fromPath && importsOrPath !== '*') {
      validateImportList(importsOrPath, node);
    }
    return;
  }

  // Try old format with path parameter
  const pathMatch = pathValue.match(/path\s*=\s*["']([^"']+)["']/);
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
  const importListMatch = pathValue.match(/imports\s*=\s*\[(.*?)\]/);
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

  // Allow path variables starting with $ but still validate ..
  if (!path.startsWith('$') && path.includes('..')) {
    throw new MeldDirectiveError(
      'Import path cannot contain parent directory references (..) unless using a path variable',
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