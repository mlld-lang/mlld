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

  // Validate imports - use structured imports array if available, otherwise use importList
  if (directive.imports && Array.isArray(directive.imports)) {
    validateStructuredImports(directive.imports, node);
  } else if (directive.importList && directive.importList !== '*') {
    validateImportList(directive.importList, node);
  }
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

/**
 * Validates import list
 * @private
 */
function validateImportList(importList: string, node: DirectiveNode): void {
  if (importList === '*') {
    return; // Wildcard import is valid
  }

  // Remove brackets if present using direct string manipulation
  let cleanList = importList;
  if (cleanList.startsWith('[') && cleanList.endsWith(']')) {
    cleanList = cleanList.substring(1, cleanList.length - 1);
  }
  
  // Split by commas and validate each part
  const parts = cleanList.split(',');
  
  for (const part of parts) {
    const trimmedPart = part.trim();
    
    if (trimmedPart === '') {
      throw new MeldDirectiveError(
        'Import list contains an empty item',
        'import',
        {
          location: convertLocation(node.location),
          code: DirectiveErrorCode.VALIDATION_FAILED,
          severity: ErrorSeverity.Fatal
        }
      );
    }
    
    // Handle colon syntax (var:alias)
    if (trimmedPart.includes(':')) {
      const [name, alias] = trimmedPart.split(':').map(s => s.trim());
      
      if (!name || name === '') {
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
      
      if (!alias || alias === '') {
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
      
      continue;
    }
    
    // Handle 'as' syntax (var as alias) without regex
    const asIndex = trimmedPart.indexOf(' as ');
    if (asIndex !== -1) {
      const name = trimmedPart.substring(0, asIndex).trim();
      const alias = trimmedPart.substring(asIndex + 4).trim();
      
      if (!name || name === '') {
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
      
      // When using 'as' syntax, the alias must not be empty
      if (!alias || alias === '') {
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
      
      continue;
    }
    
    // Simple import without alias
    if (trimmedPart === '') {
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
  }
} 