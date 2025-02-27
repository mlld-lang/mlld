import { DirectiveNode, ImportDirectiveData } from 'meld-spec';
import { MeldDirectiveError } from '@core/errors/MeldDirectiveError.js';
import { DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import { ErrorSeverity } from '@core/errors/MeldError.js';

/**
 * Validates @import directives
 */
export function validateImportDirective(node: DirectiveNode): void {
  const directive = node.directive;
  
  // Access the path directly from the structured path object
  if (!directive.path) {
    throw new MeldDirectiveError(
      'Import directive requires a valid path',
      'import',
      {
        location: node.location?.start,
        code: DirectiveErrorCode.VALIDATION_FAILED,
        severity: ErrorSeverity.Recoverable
      }
    );
  }

  // The AST already provides a structured path object that has been parsed
  // We just need to validate it's not empty
  let path: string;
  
  if (typeof directive.path === 'string') {
    path = directive.path;
  } else if (directive.path.normalized) {
    path = directive.path.normalized;
  } else if (directive.path.raw) {
    path = directive.path.raw;
  } else {
    throw new MeldDirectiveError(
      'Import directive path is invalid',
      'import',
      {
        location: node.location?.start,
        code: DirectiveErrorCode.VALIDATION_FAILED,
        severity: ErrorSeverity.Recoverable
      }
    );
  }

  validatePath(path, node);

  // Validate imports - the parser should have already extracted these
  if (directive.imports) {
    validateImports(directive.imports, node);
  }
}

function validatePath(path: string, node: DirectiveNode): void {
  // Validate path is not empty
  if (path.trim() === '') {
    throw new MeldDirectiveError(
      'Import path cannot be empty',
      'import',
      {
        location: node.location?.start,
        code: DirectiveErrorCode.VALIDATION_FAILED,
        severity: ErrorSeverity.Recoverable
      }
    );
  }

  // Allow path variables starting with $ but still validate ..
  if (!path.startsWith('$') && path.includes('..')) {
    throw new MeldDirectiveError(
      'Import path cannot contain parent directory references (..) unless using a path variable',
      'import',
      {
        location: node.location?.start,
        code: DirectiveErrorCode.VALIDATION_FAILED,
        severity: ErrorSeverity.Recoverable
      }
    );
  }
}

function validateImports(imports: string[] | string, node: DirectiveNode): void {
  if (imports === '*' || imports.includes('*')) {
    return; // Wildcard import is valid
  }

  // If we have an array of imports, validate each one
  if (Array.isArray(imports)) {
    for (const imp of imports) {
      validateSingleImport(imp, node);
    }
  } else if (typeof imports === 'string') {
    // If we have a single string, it should be a valid identifier
    validateSingleImport(imports, node);
  }
}

function validateSingleImport(importItem: string, node: DirectiveNode): void {
  // Import may be in format "name as alias" or just "name"
  let identifier: string;
  let alias: string | undefined;
  
  // The AST should already have parsed this in most cases, but as a fallback:
  if (importItem.includes(' as ')) {
    const parts = importItem.split(' as ');
    identifier = parts[0];
    alias = parts[1];
  } else {
    identifier = importItem;
  }

  if (!identifier || identifier.trim() === '') {
    throw new MeldDirectiveError(
      'Import identifier cannot be empty',
      'import',
      {
        location: node.location?.start,
        code: DirectiveErrorCode.VALIDATION_FAILED,
        severity: ErrorSeverity.Recoverable
      }
    );
  }

  if (alias && alias.trim() === '') {
    throw new MeldDirectiveError(
      'Import alias cannot be empty',
      'import',
      {
        location: node.location?.start,
        code: DirectiveErrorCode.VALIDATION_FAILED,
        severity: ErrorSeverity.Recoverable
      }
    );
  }
} 