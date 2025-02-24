import { DirectiveNode, DefineDirective } from 'meld-spec';
import { MeldDirectiveError } from '@core/errors/MeldDirectiveError.js';
import { DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';

/**
 * Validates @define directives
 */
export function validateDefineDirective(node: DirectiveNode): void {
  const directive = node.directive as DefineDirective;
  
  // Validate identifier
  if (!directive.identifier || typeof directive.identifier !== 'string') {
    throw new MeldDirectiveError(
      'Define directive requires an "identifier" property (string)',
      'define',
      node.location?.start,
      DirectiveErrorCode.VALIDATION_FAILED
    );
  }
  
  // Validate identifier format
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*(?:\.(risk|about)(?:\.(high|med|low))?)?$/.test(directive.identifier)) {
    throw new MeldDirectiveError(
      'Invalid define directive identifier format',
      'define',
      node.location?.start,
      DirectiveErrorCode.VALIDATION_FAILED
    );
  }

  // Validate value exists
  if (!directive.value || typeof directive.value !== 'string') {
    throw new MeldDirectiveError(
      'Define directive requires a "value" property (string)',
      'define',
      node.location?.start,
      DirectiveErrorCode.VALIDATION_FAILED
    );
  }

  // Try to parse as JSON first
  try {
    const parsed = JSON.parse(directive.value);
    if (parsed.command?.kind === 'run' && typeof parsed.command.command === 'string') {
      // For JSON format, validate command is not empty
      if (!parsed.command.command.trim()) {
        throw new MeldDirectiveError(
          'Command cannot be empty',
          'define',
          node.location?.start,
          DirectiveErrorCode.VALIDATION_FAILED
        );
      }
      return;
    }
  } catch (e) {
    // Not JSON, validate raw command is not empty
    if (!directive.value.trim()) {
      throw new MeldDirectiveError(
        'Command cannot be empty',
        'define',
        node.location?.start,
        DirectiveErrorCode.VALIDATION_FAILED
      );
    }
  }
} 