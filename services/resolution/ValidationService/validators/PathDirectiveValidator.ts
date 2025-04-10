import { DirectiveNode, PathDirectiveData } from '@core/syntax/types.js';
import { MeldDirectiveError, DirectiveLocation } from '@core/errors/MeldDirectiveError.js';
import { DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import { ErrorSeverity } from '@core/errors/MeldError.js';
import { ResolutionContext } from '@services/resolution/ResolutionService/IResolutionService.js';

/**
 * Converts AST SourceLocation to DirectiveLocation
 */
function convertLocation(location: any): DirectiveLocation {
  if (!location) return { line: 0, column: 0 };
  return {
    line: location.line,
    column: location.column
  };
}

/**
 * Validates path directives based on the latest meld-ast structure
 * Uses AST-based validation instead of regex
 */
export async function validatePathDirective(node: DirectiveNode, context?: ResolutionContext): Promise<void> {
  if (!node.directive) {
    throw new MeldDirectiveError(
      'Path directive is missing required fields',
      'path',
      {
        location: convertLocation(node.location?.start),
        code: DirectiveErrorCode.VALIDATION_FAILED,
        severity: ErrorSeverity.Fatal
      }
    );
  }
  
  // Cast to PathDirectiveData to access typed properties
  const directive = node.directive as PathDirectiveData;
  
  // Fix for different field names: AST can use either 'id' or 'identifier'
  const identifier = directive.identifier || (directive as any).id;
  
  // Check for required fields
  if (!identifier || typeof identifier !== 'string' || identifier.trim() === '') {
    throw new MeldDirectiveError(
      'Path directive requires a valid identifier',
      'path',
      {
        location: convertLocation(node.location?.start),
        code: DirectiveErrorCode.VALIDATION_FAILED,
        severity: ErrorSeverity.Fatal
      }
    );
  }
  
  // Validate identifier format using character-by-character validation
  // instead of regex
  if (!isValidIdentifier(identifier)) {
    throw new MeldDirectiveError(
      'Path identifier must be a valid identifier (letters, numbers, underscore, starting with letter/underscore)',
      'path',
      {
        location: convertLocation(node.location?.start),
        code: DirectiveErrorCode.VALIDATION_FAILED,
        severity: ErrorSeverity.Fatal
      }
    );
  }
  
  // Handle both direct string value and path object
  const pathObject = directive.path;
  let pathRaw: string | undefined;
  
  if (!pathObject) {
    // If path is missing, check for value property as fallback
    if (directive.value) {
      pathRaw = typeof directive.value === 'string' 
        ? directive.value
        : (directive.value as any).raw || '';
    } else {
      throw new MeldDirectiveError(
        'Path directive requires a path value',
        'path',
        {
          location: convertLocation(node.location?.start),
          code: DirectiveErrorCode.VALIDATION_FAILED,
          severity: ErrorSeverity.Fatal
        }
      );
    }
  } else if (typeof pathObject === 'string') {
    // Handle direct string path
    pathRaw = pathObject;
  } else if (typeof pathObject === 'object') {
    // Handle path object with raw property
    if (!pathObject.raw || typeof pathObject.raw !== 'string' || pathObject.raw.trim() === '') {
      throw new MeldDirectiveError(
        'Path directive requires a non-empty path value',
        'path',
        {
          location: convertLocation(node.location?.start),
          code: DirectiveErrorCode.VALIDATION_FAILED,
          severity: ErrorSeverity.Fatal
        }
      );
    }
    pathRaw = pathObject.raw;
  } else {
    throw new MeldDirectiveError(
      'Path directive requires a valid path',
      'path',
      {
        location: convertLocation(node.location?.start),
        code: DirectiveErrorCode.VALIDATION_FAILED,
        severity: ErrorSeverity.Fatal
      }
    );
  }
  
  // Ensure we have a non-empty path
  if (!pathRaw || pathRaw.trim() === '') {
    throw new MeldDirectiveError(
      'Path directive requires a non-empty path value',
      'path',
      {
        location: convertLocation(node.location?.start),
        code: DirectiveErrorCode.VALIDATION_FAILED,
        severity: ErrorSeverity.Fatal
      }
    );
  }
  
  // Path validation (absolute paths, path segments) is handled by ParserService
}

/**
 * Helper function to validate identifier format without regex
 */
function isValidIdentifier(str: string): boolean {
  if (!str || str.length === 0) return false;
  
  // First character must be letter or underscore
  const firstChar = str.charAt(0);
  if (!(firstChar === '_' || (firstChar >= 'a' && firstChar <= 'z') || (firstChar >= 'A' && firstChar <= 'Z'))) {
    return false;
  }
  
  // Rest of characters must be letters, numbers, or underscore
  for (let i = 1; i < str.length; i++) {
    const char = str.charAt(i);
    if (!((char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z') || 
          (char >= '0' && char <= '9') || char === '_')) {
      return false;
    }
  }
  
  return true;
} 