import { DirectiveNode } from 'meld-spec';
import { MeldDirectiveError } from '@core/errors/MeldDirectiveError.js';
import { DirectiveErrorCode } from '@services/DirectiveService/errors/DirectiveError.js';

/**
 * Validates @run directives
 */
export async function validateRunDirective(node: DirectiveNode): Promise<void> {
  const directive = node.directive;
  
  // Extract command from either the command property or the value property
  let command: string | undefined;
  
  if (directive.command && typeof directive.command === 'string') {
    command = directive.command;
  } else if (typeof directive.value === 'string') {
    // Check for [command] format
    const match = directive.value.match(/^\[(.*)\]$/);
    if (match) {
      command = match[1];
    }
  }
  
  // Validate command exists and is not empty
  if (!command) {
    throw new MeldDirectiveError(
      'Run directive requires a command (either as a property or in [command] format)',
      'run',
      node.location?.start,
      DirectiveErrorCode.VALIDATION_FAILED
    );
  }
  
  if (!command.trim()) {
    throw new MeldDirectiveError(
      'Run directive command cannot be empty',
      'run',
      node.location?.start,
      DirectiveErrorCode.VALIDATION_FAILED
    );
  }
  
  // Store the command in the directive for later use
  directive.command = command;
} 