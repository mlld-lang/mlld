import { DirectiveNode, PathDirectiveData } from '@core/syntax/types';
import { MeldDirectiveError, DirectiveLocation } from '@core/errors/MeldDirectiveError';
import { DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError';
import { ErrorSeverity } from '@core/errors/MeldError';
import { ResolutionContext } from '@services/resolution/ResolutionService/IResolutionService';

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
  
  const identifier = directive.identifier; 
  
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
  
  // NEW CHECKS: Validate the expected path object structure
  if (!directive.path || typeof directive.path !== 'object') {
    throw new MeldDirectiveError(
      'Path directive requires a path object',
      'path',
      {
        location: convertLocation(node.location?.start),
        code: DirectiveErrorCode.VALIDATION_FAILED,
        severity: ErrorSeverity.Fatal
      }
    );
  }

  if (!directive.path.raw || typeof directive.path.raw !== 'string' || directive.path.raw.trim() === '') {
    throw new MeldDirectiveError(
      'Path directive requires a non-empty path.raw string',
      'path',
      {
        location: convertLocation(node.location?.start),
        code: DirectiveErrorCode.VALIDATION_FAILED,
        severity: ErrorSeverity.Fatal
      }
    );
  }

  // Ensure the path was processed into a values array
  if (!Array.isArray(directive.path.values)) {
    throw new MeldDirectiveError(
      'Path directive requires a valid path.values array',
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