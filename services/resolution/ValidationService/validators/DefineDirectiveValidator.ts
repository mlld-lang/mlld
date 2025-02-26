import { DirectiveNode, DefineDirective } from 'meld-spec';
import { MeldDirectiveError } from '@core/errors/MeldDirectiveError.js';
import { DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';

/**
 * Validates @define directives
 */
export function validateDefineDirective(node: DirectiveNode): void {
  const directive = node.directive as DefineDirective;
  
  // Validate name
  if (!directive.name || typeof directive.name !== 'string') {
    throw new MeldDirectiveError(
      'Define directive requires a "name" property (string)',
      'define',
      node.location?.start,
      DirectiveErrorCode.VALIDATION_FAILED
    );
  }
  
  // Validate name format
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*(?:\.(risk|about)(?:\.(high|med|low))?)?$/.test(directive.name)) {
    throw new MeldDirectiveError(
      'Invalid define directive name format',
      'define',
      node.location?.start,
      DirectiveErrorCode.VALIDATION_FAILED
    );
  }

  // Validate command exists
  if (!directive.command || typeof directive.command !== 'object') {
    throw new MeldDirectiveError(
      'Define directive requires a "command" property (object)',
      'define',
      node.location?.start,
      DirectiveErrorCode.VALIDATION_FAILED
    );
  }

  // Validate command structure
  if (directive.command.kind !== 'run' || typeof directive.command.command !== 'string') {
    throw new MeldDirectiveError(
      'Define directive command must have a kind="run" and a command string',
      'define',
      node.location?.start,
      DirectiveErrorCode.VALIDATION_FAILED
    );
  }

  // Validate command is not empty
  if (!directive.command.command.trim()) {
    throw new MeldDirectiveError(
      'Command cannot be empty',
      'define',
      node.location?.start,
      DirectiveErrorCode.VALIDATION_FAILED
    );
  }
} 