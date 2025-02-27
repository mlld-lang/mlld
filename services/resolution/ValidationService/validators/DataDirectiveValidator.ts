import { DirectiveNode } from 'meld-spec';
import { MeldDirectiveError } from '@core/errors/MeldDirectiveError.js';
import { DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';

// Define interface matching the meld-ast structure for data directives
interface DataDirectiveData {
  kind: 'data';
  identifier: string;
  source: 'literal' | 'reference';
  value: any;
}

/**
 * Validates @data directives
 */
export function validateDataDirective(node: DirectiveNode): void {
  const directive = node.directive as DataDirectiveData;
  
  // Validate identifier
  if (!directive.identifier || typeof directive.identifier !== 'string') {
    throw new MeldDirectiveError(
      'Data directive requires an "identifier" property (string)',
      'data',
      {
        location: node.location?.start,
        code: DirectiveErrorCode.VALIDATION_FAILED
      }
    );
  }
  
  // Validate identifier format
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(directive.identifier)) {
    throw new MeldDirectiveError(
      'Data identifier must be a valid identifier (letters, numbers, underscore, starting with letter/underscore)',
      'data',
      {
        location: node.location?.start,
        code: DirectiveErrorCode.VALIDATION_FAILED
      }
    );
  }
  
  // Validate value
  if (directive.value === undefined) {
    throw new MeldDirectiveError(
      'Data directive requires a value',
      'data',
      {
        location: node.location?.start,
        code: DirectiveErrorCode.VALIDATION_FAILED
      }
    );
  }
  
  // Validate source type if present
  if (directive.source && !['literal', 'reference'].includes(directive.source)) {
    throw new MeldDirectiveError(
      `Invalid source type "${directive.source}" for data directive, must be "literal" or "reference"`,
      'data',
      {
        location: node.location?.start,
        code: DirectiveErrorCode.VALIDATION_FAILED
      }
    );
  }
  
  // If value is a string and source is literal, try to ensure it's valid JSON
  if (typeof directive.value === 'string' && directive.source === 'literal') {
    try {
      JSON.parse(directive.value);
    } catch (error) {
      // AST parser should have handled this, but double-check
      throw new MeldDirectiveError(
        'Invalid JSON string in data directive',
        'data',
        {
          location: node.location?.start,
          code: DirectiveErrorCode.VALIDATION_FAILED
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
        code: DirectiveErrorCode.VALIDATION_FAILED
      }
    );
  }
} 