import { DirectiveNode, ImportDirectiveData } from 'meld-spec';
import { MeldDirectiveError, DirectiveLocation } from '@core/errors/MeldDirectiveError.js';
import { DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import { ErrorSeverity } from '@core/errors/MeldError.js';

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

  // Validate import list if present
  if (directive.importList && directive.importList !== '*') {
    validateImportList(directive.importList, node);
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