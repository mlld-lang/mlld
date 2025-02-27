import { DirectiveNode, PathDirectiveData } from 'meld-spec';
import { MeldDirectiveError } from '@core/errors/MeldDirectiveError.js';
import { DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import { ErrorSeverity } from '@core/errors/MeldError.js';
import { ResolutionContext } from '@services/resolution/ResolutionService/IResolutionService.js';

/**
 * Validates path directives based on the latest meld-ast 1.6.1 structure
 */
export async function validatePathDirective(node: DirectiveNode, context?: ResolutionContext): Promise<void> {
  // Debug: Log the node structure
  console.log('*** VALIDATOR: DIRECTIVE NODE STRUCTURE ***');
  console.log(JSON.stringify(node, null, 2));
  
  if (!node.directive) {
    throw new MeldDirectiveError(
      'Path directive is missing required fields',
      'path',
      {
        location: node.location?.start,
        code: DirectiveErrorCode.VALIDATION_FAILED
      }
    );
  }
  
  // Log the directive properties for debugging
  console.log('*** VALIDATOR: DIRECTIVE PROPERTIES ***');
  console.log('Properties:', Object.keys(node.directive));
  console.log('Full directive:', JSON.stringify(node.directive, null, 2));
  
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
        location: node.location?.start,
        code: DirectiveErrorCode.VALIDATION_FAILED
      }
    );
  }
  
  // Validate identifier format - must start with letter or underscore and contain only letters, numbers, and underscores
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(identifier)) {
    throw new MeldDirectiveError(
      'Path identifier must be a valid identifier (letters, numbers, underscore, starting with letter/underscore)',
      'path',
      {
        location: node.location?.start,
        code: DirectiveErrorCode.VALIDATION_FAILED
      }
    );
  }
  
  // Handle both direct string value and path object
  let pathObject = directive.path;
  let pathRaw: string;
  
  if (!pathObject) {
    // If path is missing, check for value property as fallback
    if (directive.value) {
      pathRaw = typeof directive.value === 'string' 
        ? directive.value
        : directive.value.raw || '';
    } else {
      throw new MeldDirectiveError(
        'Path directive requires a path value',
        'path',
        {
          location: node.location?.start,
          code: DirectiveErrorCode.VALIDATION_FAILED
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
          location: node.location?.start,
          code: DirectiveErrorCode.VALIDATION_FAILED
        }
      );
    }
    pathRaw = pathObject.raw;
  } else {
    throw new MeldDirectiveError(
      'Path directive requires a valid path',
      'path',
      {
        location: node.location?.start,
        code: DirectiveErrorCode.VALIDATION_FAILED
      }
    );
  }
  
  // Ensure we have a non-empty path
  if (!pathRaw || pathRaw.trim() === '') {
    throw new MeldDirectiveError(
      'Path directive requires a non-empty path value',
      'path',
      {
        location: node.location?.start,
        code: DirectiveErrorCode.VALIDATION_FAILED
      }
    );
  }
  
  // Path validation (absolute paths, path segments) is handled by ParserService
} 