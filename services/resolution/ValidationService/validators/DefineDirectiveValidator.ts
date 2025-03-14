import { DirectiveNode } from '@core/syntax/types.js';
import { MeldDirectiveError } from '@core/errors/MeldDirectiveError.js';
import { DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';

/**
 * Validates @define directives
 */
export function validateDefineDirective(node: DirectiveNode): void {
  const directive = node.directive;
  
  // Validate name
  if (!directive.name || typeof directive.name !== 'string') {
    throw new MeldDirectiveError(
      'Define directive requires a "name" property (string)',
      'define',
      { 
        location: node.location?.start,
        code: DirectiveErrorCode.VALIDATION_FAILED 
      }
    );
  }
  
  // Check if it's a basic name or a name with risk annotation
  const nameParts = directive.name.split('.');
  
  // The AST has already validated the function name format
  
  // If there are extensions (like risk annotations), validate them
  if (nameParts.length > 1) {
    // First extension must be 'risk' or 'about'
    if (nameParts[1] !== 'risk' && nameParts[1] !== 'about') {
      throw new MeldDirectiveError(
        'Define directive name extension must be "risk" or "about"',
        'define',
        { 
          location: node.location?.start,
          code: DirectiveErrorCode.VALIDATION_FAILED 
        }
      );
    }
    
    // If there's a third part (risk level), it must be high, med, or low
    if (nameParts.length > 2 && !['high', 'med', 'low'].includes(nameParts[2])) {
      throw new MeldDirectiveError(
        'Risk level must be "high", "med", or "low"',
        'define',
        { 
          location: node.location?.start,
          code: DirectiveErrorCode.VALIDATION_FAILED 
        }
      );
    }
    
    // No more than 3 parts allowed
    if (nameParts.length > 3) {
      throw new MeldDirectiveError(
        'Define directive name cannot have more than 3 parts',
        'define',
        { 
          location: node.location?.start,
          code: DirectiveErrorCode.VALIDATION_FAILED 
        }
      );
    }
  }

  // Validate command exists
  if (!directive.command || typeof directive.command !== 'object') {
    throw new MeldDirectiveError(
      'Define directive requires a "command" property (object)',
      'define',
      { 
        location: node.location?.start,
        code: DirectiveErrorCode.VALIDATION_FAILED 
      }
    );
  }

  // Validate command structure
  if (directive.command.kind !== 'run' || typeof directive.command.command !== 'string') {
    throw new MeldDirectiveError(
      'Define directive command must have a kind="run" and a command string',
      'define',
      { 
        location: node.location?.start,
        code: DirectiveErrorCode.VALIDATION_FAILED 
      }
    );
  }

  // Validate command is not empty
  if (!directive.command.command.trim()) {
    throw new MeldDirectiveError(
      'Command cannot be empty',
      'define',
      { 
        location: node.location?.start,
        code: DirectiveErrorCode.VALIDATION_FAILED 
      }
    );
  }
} 