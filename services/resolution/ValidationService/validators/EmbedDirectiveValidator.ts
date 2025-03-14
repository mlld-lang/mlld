import type { DirectiveNode, EmbedDirectiveData } from '@core/syntax/types';
import { MeldDirectiveError } from '@core/errors/MeldDirectiveError.js';
import { DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import { ErrorSeverity } from '@core/errors/MeldError.js';

export function validateEmbedDirective(node: DirectiveNode): void {
  const directive = node.directive as EmbedDirectiveData;
  
  // Check path is present in the appropriate format (string or path object)
  // Handle both string paths and structured path objects
  if (!directive.path || 
      (typeof directive.path !== 'string' && 
       (!directive.path.raw || typeof directive.path.raw !== 'string'))) {
    throw new MeldDirectiveError(
      'Embed directive requires a valid path',
      'embed',
      { 
        location: node.location?.start,
        code: DirectiveErrorCode.VALIDATION_FAILED,
        severity: ErrorSeverity.Fatal
      }
    );
  }
  
  // Get the path value for validation
  const pathValue = typeof directive.path === 'string' 
    ? directive.path 
    : directive.path.raw;
  
  // Path cannot be empty
  if (pathValue.trim() === '') {
    throw new MeldDirectiveError(
      'Embed directive path cannot be empty',
      'embed',
      {
        location: node.location?.start,
        code: DirectiveErrorCode.VALIDATION_FAILED,
        severity: ErrorSeverity.Fatal
      }
    );
  }
  
  // Optional fields validation
  if (directive.section !== undefined && typeof directive.section !== 'string') {
    throw new MeldDirectiveError(
      'Embed directive "section" property must be a string if provided',
      'embed',
      {
        location: node.location?.start,
        code: DirectiveErrorCode.VALIDATION_FAILED,
        severity: ErrorSeverity.Fatal
      }
    );
  }
  
  if (directive.fuzzy !== undefined) {
    if (typeof directive.fuzzy !== 'number' || directive.fuzzy < 0 || directive.fuzzy > 1) {
      throw new MeldDirectiveError(
        'Embed directive "fuzzy" property must be a number between 0 and 1 if provided',
        'embed',
        {
          location: node.location?.start,
          code: DirectiveErrorCode.VALIDATION_FAILED,
          severity: ErrorSeverity.Fatal
        }
      );
    }
  }
  
  if (directive.format !== undefined && typeof directive.format !== 'string') {
    throw new MeldDirectiveError(
      'Embed directive "format" property must be a string if provided',
      'embed',
      {
        location: node.location?.start,
        code: DirectiveErrorCode.VALIDATION_FAILED,
        severity: ErrorSeverity.Fatal
      }
    );
  }
} 