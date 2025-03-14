import { DirectiveNode } from '@core/syntax/types.js';
import { MeldDirectiveError } from '@core/errors/MeldDirectiveError.js';
import { DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';

/**
 * Validates @run directives
 */
export async function validateRunDirective(node: DirectiveNode): Promise<void> {
  const directive = node.directive;
  
  // Extract command from either the command property or the value property
  // Check for proper command format in the AST node
  if (!directive.command) {
    throw new MeldDirectiveError(
      'Run directive requires a command',
      'run',
      { 
        location: node.location?.start,
        code: DirectiveErrorCode.VALIDATION_FAILED
      }
    );
  }
  
  // Get the command value for validation
  const commandValue = typeof directive.command === 'string' 
    ? directive.command 
    : directive.command.raw;
  
  // Command cannot be empty
  if (!commandValue || commandValue.trim() === '') {
    throw new MeldDirectiveError(
      'Run directive command cannot be empty',
      'run',
      { 
        location: node.location?.start,
        code: DirectiveErrorCode.VALIDATION_FAILED
      }
    );
  }
} 