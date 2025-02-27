import { DirectiveNode, DirectiveData } from 'meld-spec';
import { MeldDirectiveError } from '@core/errors/MeldDirectiveError.js';
import { DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import { ErrorSeverity } from '@core/errors/MeldError.js';

/**
 * Validates @data directives
 */
export function validateDataDirective(node: DirectiveNode): void {
  const directive = node.directive as DirectiveData;
  
  // Validate identifier
  if (!directive.identifier || typeof directive.identifier !== 'string') {
    throw new MeldDirectiveError(
      'Data directive requires an "identifier" property (string)',
      'data',
      {
        location: node.location?.start,
        code: DirectiveErrorCode.VALIDATION_FAILED,
        severity: ErrorSeverity.Recoverable
      }
    );
  }
  
  // NOTE: AST parser already validates the identifier format, so we don't need regex here
  // If the identifier made it to the AST, it's already in the correct format
  
  // Validate value
  if (directive.value === undefined) {
    throw new MeldDirectiveError(
      'Data directive requires a value',
      'data',
      {
        location: node.location?.start,
        code: DirectiveErrorCode.VALIDATION_FAILED,
        severity: ErrorSeverity.Recoverable
      }
    );
  }
  
  // If value is a string, try to parse it as JSON
  if (typeof directive.value === 'string') {
    try {
      JSON.parse(directive.value);
    } catch (error) {
      throw new MeldDirectiveError(
        'Invalid JSON string in data directive',
        'data',
        {
          location: node.location?.start,
          code: DirectiveErrorCode.VALIDATION_FAILED,
          severity: ErrorSeverity.Recoverable
        }
      );
    }
  }
  
  // Validate value is JSON-serializable
  try {
    JSON.stringify(directive.value);
  } catch (error) {
    throw new MeldDirectiveError(
      'Data value must be JSON-serializable',
      'data',
      {
        location: node.location?.start,
        code: DirectiveErrorCode.VALIDATION_FAILED,
        severity: ErrorSeverity.Recoverable
      }
    );
  }
} 