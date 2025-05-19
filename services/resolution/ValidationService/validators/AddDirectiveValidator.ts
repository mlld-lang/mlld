import type { DirectiveNode } from '@core/ast/types';
import { MeldDirectiveError } from '@core/errors/MeldDirectiveError';
import { DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError';
import { ErrorSeverity } from '@core/errors/MeldError';

/**
 * Validates @add directives using new AST structure
 * Grammar handles all syntax validation - we only do semantic checks
 */
export function validateAddDirective(node: DirectiveNode): void {
  // With new AST structure, directives have flattened properties
  if (!node.kind || node.kind !== 'add') {
    throw new MeldDirectiveError(
      'Expected add directive',
      'add',
      { 
        location: node.location?.start,
        code: DirectiveErrorCode.VALIDATION_FAILED,
        severity: ErrorSeverity.Fatal
      }
    );
  }
  
  // Check for path - could be in values.path or raw.path 
  // The test expects a path for @add directive
  const pathValue = node.values?.path || node.raw?.path;
  
  if (!pathValue) {
    throw new MeldDirectiveError(
      'Add directive requires a path',
      'add',
      { 
        location: node.location?.start,
        code: DirectiveErrorCode.VALIDATION_FAILED,
        severity: ErrorSeverity.Fatal
      }
    );
  }
  
  // Get the actual path string
  let pathString: string = '';
  
  if (typeof pathValue === 'string') {
    pathString = pathValue;
  } else if (Array.isArray(pathValue) && pathValue.length > 0 && pathValue[0].content) {
    pathString = pathValue[0].content;
  } else if (pathValue.raw) {
    pathString = pathValue.raw;
  }
  
  // Validate path is not empty
  if (!pathString || pathString.trim() === '') {
    throw new MeldDirectiveError(
      'Add directive requires a valid path',
      'add',
      { 
        location: node.location?.start,
        code: DirectiveErrorCode.VALIDATION_FAILED,
        severity: ErrorSeverity.Fatal
      }
    );
  }
  
  // Grammar already validates and sets the subtype (addPath, addVariable, addTemplate)
  // Grammar ensures the values object has the correct structure for each subtype
  
  // All structural validation is handled by grammar
  // This validator can focus on semantic rules only
}