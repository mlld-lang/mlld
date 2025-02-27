import { DirectiveNode, PathDirectiveData } from 'meld-spec';
import { MeldDirectiveError } from '@core/errors/MeldDirectiveError.js';
import { DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import { ErrorSeverity } from '@core/errors/MeldError.js';
import { ResolutionContext } from '@services/resolution/ResolutionService/IResolutionService.js';
import { isValidIdentifier } from '../utils/IdentifierValidator.js';

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
      DirectiveErrorCode.VALIDATION_FAILED,
      { location: node.location?.start }
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
      DirectiveErrorCode.VALIDATION_FAILED,
      { location: node.location?.start }
    );
  }
  
  // Validate identifier format using the shared utility
  if (!isValidIdentifier(identifier)) {
    throw new MeldDirectiveError(
      `Invalid identifier format: ${identifier}. Must contain only letters, numbers, and underscores.`,
      DirectiveErrorCode.VALIDATION_FAILED,
      { location: node.location?.start }
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
        DirectiveErrorCode.VALIDATION_FAILED,
        { location: node.location?.start }
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
        DirectiveErrorCode.VALIDATION_FAILED,
        { location: node.location?.start }
      );
    }
    pathRaw = pathObject.raw;
  } else {
    throw new MeldDirectiveError(
      'Path directive requires a valid path',
      DirectiveErrorCode.VALIDATION_FAILED,
      { location: node.location?.start }
    );
  }
  
  // Ensure we have a non-empty path
  if (!pathRaw || pathRaw.trim() === '') {
    throw new MeldDirectiveError(
      'Path directive requires a non-empty path value',
      DirectiveErrorCode.VALIDATION_FAILED,
      { location: node.location?.start }
    );
  }
  
  // Validate absolute path requirement if needed
  if (context?.pathValidation?.requireAbsolute && pathRaw.startsWith('/')) {
    throw new MeldDirectiveError(
      'Raw absolute paths are not allowed',
      DirectiveErrorCode.VALIDATION_FAILED,
      { 
        location: node.location?.start,
        severity: ErrorSeverity.Fatal
      }
    );
  }

  // Validate path segments (no relative segments)
  if (pathRaw.includes('/./') || pathRaw.includes('/../') || 
      pathRaw === '.' || pathRaw === '..' || 
      pathRaw.startsWith('./') || pathRaw.startsWith('../') || 
      pathRaw.endsWith('/.') || pathRaw.endsWith('/..')) {
    throw new MeldDirectiveError(
      'Path cannot contain . or .. segments',
      DirectiveErrorCode.VALIDATION_FAILED,
      { 
        location: node.location?.start,
        severity: ErrorSeverity.Fatal
      }
    );
  }
} 