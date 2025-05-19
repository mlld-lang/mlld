import { DirectiveNode } from '@core/types/ast-nodes';
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
 * Validates path directives using new AST structure
 * Grammar handles all syntax validation - we only do semantic checks
 */
export async function validatePathDirective(node: DirectiveNode, context?: ResolutionContext): Promise<void> {
  // With new AST structure, directives have flattened properties
  if (!node.kind || node.kind !== 'path') {
    throw new MeldDirectiveError(
      'Expected path directive',
      'path',
      {
        location: convertLocation(node.location?.start),
        code: DirectiveErrorCode.VALIDATION_FAILED,
        severity: ErrorSeverity.Fatal
      }
    );
  }
  
  // Check for identifier in values
  if (!node.values?.identifier || !Array.isArray(node.values.identifier) || 
      node.values.identifier.length === 0) {
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
  
  // Check if identifier is empty
  const identifierNode = node.values.identifier[0];
  const identifier = identifierNode.identifier;
  
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
  
  // Validate identifier format
  const firstChar = identifier.charAt(0);
  if (!/[a-zA-Z_]/.test(firstChar)) {
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
  
  // Check for path value - could be in values.path or raw.path
  const pathValue = node.values?.path || node.raw?.path;
  
  if (!pathValue || (typeof pathValue === 'string' && pathValue.trim() === '')) {
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
  
  // Check if path has required structure (for test compatibility)
  if (typeof pathValue === 'object' && pathValue.raw && pathValue.raw.trim() === '') {
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
  
  // Grammar ensures path content exists and is properly structured
  // No need to validate path structure - grammar handles that
}