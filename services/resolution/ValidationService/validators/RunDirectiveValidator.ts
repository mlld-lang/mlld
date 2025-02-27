import { DirectiveNode } from 'meld-spec';
import { MeldDirectiveError } from '@core/errors/MeldDirectiveError.js';
import { DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import { ErrorSeverity } from '@core/errors/MeldError.js';

/**
 * Validates @run directives
 */
export async function validateRunDirective(node: DirectiveNode): Promise<void> {
  const directive = node.directive;
  
  // Extract command from the command property directly
  // The AST parser should have already extracted the command from any [command] format
  let command: string | undefined = directive.command;
  
  // As a fallback, try to use value if command is not available
  if (!command && typeof directive.value === 'string') {
    command = directive.value;
  }
  
  // Validate command exists and is not empty
  if (!command) {
    throw new MeldDirectiveError(
      'Run directive requires a command',
      'run',
      {
        location: node.location?.start,
        code: DirectiveErrorCode.VALIDATION_FAILED,
        severity: ErrorSeverity.Recoverable
      }
    );
  }
  
  if (!command.trim()) {
    throw new MeldDirectiveError(
      'Run directive command cannot be empty',
      'run',
      {
        location: node.location?.start,
        code: DirectiveErrorCode.VALIDATION_FAILED,
        severity: ErrorSeverity.Recoverable
      }
    );
  }
  
  // Store the command in the directive for later use
  directive.command = command;
} 