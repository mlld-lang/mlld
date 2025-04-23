import { DirectiveNode } from '@core/syntax/types';
import { MeldDirectiveError } from '@core/errors/MeldDirectiveError';
import { DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError';

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
} 