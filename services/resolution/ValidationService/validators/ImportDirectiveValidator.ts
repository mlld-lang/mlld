import { DirectiveNode, ImportDirectiveData } from '@core/syntax/types';
import { MeldDirectiveError, DirectiveLocation } from '@core/errors/MeldDirectiveError';
import { DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError';
import { ErrorSeverity } from '@core/errors/MeldError';

// Local definition for StructuredPath interface
interface StructuredPath {
  raw: string;
  normalized?: string;
  structured?: {
    base?: string;
    segments?: string[];
    variables?: {
      special?: string[];
      [key: string]: any;
    };
  };
}

// Definition for Import item from meld-ast 3.4.0
interface ImportItem {
  name: string;
  alias?: string;
}

/**
 * Convert AST SourceLocation to DirectiveLocation
 */
function convertLocation(location: any): DirectiveLocation | undefined {
  if (!location) return undefined;
  
  return {
    line: location.start?.line || 0,
    column: location.start?.column || 0,
    filePath: location.filePath
  };
}

/**
 * Validates @import directives
 */
export function validateImportDirective(node: DirectiveNode): void {
  const directive = node.directive as ImportDirectiveData;
  
  // Validate that a path exists
  if (!directive.path) {
    throw new MeldDirectiveError(
      'Import directive requires a path',
      'import',
      {
        location: convertLocation(node.location),
        code: DirectiveErrorCode.VALIDATION_FAILED,
        severity: ErrorSeverity.Fatal
      }
    );
  }

  // Get path value from structured path or string
  let pathValue: string;
  
  if (typeof directive.path === 'string') {
    pathValue = directive.path;
  } else if (directive.path.raw) {
    pathValue = directive.path.raw;
  } else if (directive.path.normalized) {
    pathValue = directive.path.normalized;
  } else {
    throw new MeldDirectiveError(
      'Import directive has an invalid path format',
      'import',
      {
        location: convertLocation(node.location),
        code: DirectiveErrorCode.VALIDATION_FAILED,
        severity: ErrorSeverity.Fatal
      }
    );
  }
  
  // Validate path is not empty
  if (pathValue.trim() === '') {
    throw new MeldDirectiveError(
      'Import path cannot be empty',
      'import',
      {
        location: convertLocation(node.location),
        code: DirectiveErrorCode.VALIDATION_FAILED,
        severity: ErrorSeverity.Fatal
      }
    );
  }

  // Allow path variables starting with $ but still validate ..
  if (!pathValue.startsWith('$') && pathValue.includes('..')) {
    throw new MeldDirectiveError(
      'Import path cannot contain parent directory references (..) unless using a path variable',
      'import',
      {
        location: convertLocation(node.location),
        code: DirectiveErrorCode.VALIDATION_FAILED,
        severity: ErrorSeverity.Fatal
      }
    );
  }

  // Validate imports - Grammar MUST provide the structured 'imports' array.
  if (!directive.imports || !Array.isArray(directive.imports)) {
    // If imports array is missing or not an array, it's a grammar/AST generation issue.
    throw new MeldDirectiveError(
      'Invalid or missing structured imports array in AST node for @import', 
      'import',
      {
        location: convertLocation(node.location),
        code: DirectiveErrorCode.VALIDATION_FAILED, 
        severity: ErrorSeverity.Fatal // Problem with core AST structure
      }
    );
  }

  // Validate the structured imports array provided by the grammar.
  validateStructuredImports(directive.imports, node);
}

/**
 * Validates structured imports array from meld-ast 3.4.0
 * @private
 */
function validateStructuredImports(imports: ImportItem[], node: DirectiveNode): void {
  if (imports.length === 0) {
    // Empty imports array is valid - equivalent to "*"
    return;
  }

  // Check if there's a wildcard import
  if (imports.some(imp => imp.name === '*')) {
    if (imports.length > 1) {
      throw new MeldDirectiveError(
        'Wildcard import (*) cannot be combined with other imports',
        'import',
        {
          location: convertLocation(node.location),
          code: DirectiveErrorCode.VALIDATION_FAILED,
          severity: ErrorSeverity.Fatal
        }
      );
    }
    return; // Single wildcard import is valid
  }

  // Validate each import item
  for (const item of imports) {
    if (!item.name || item.name.trim() === '') {
      throw new MeldDirectiveError(
        'Import identifier cannot be empty',
        'import',
        {
          location: convertLocation(node.location),
          code: DirectiveErrorCode.VALIDATION_FAILED,
          severity: ErrorSeverity.Fatal
        }
      );
    }

    // Only validate the alias if it's a non-undefined, non-null string
    // This allows for cases where alias is undefined (no alias specified)
    if (item.alias !== undefined && item.alias !== null && item.alias.trim() === '') {
      throw new MeldDirectiveError(
        'Import alias cannot be empty',
        'import',
        {
          location: convertLocation(node.location),
          code: DirectiveErrorCode.VALIDATION_FAILED,
          severity: ErrorSeverity.Fatal
        }
      );
    }
  }
}