import { DirectiveNode } from '@core/ast/types';
import { ValidationContext } from '@core/types/index';
import { MeldDirectiveError } from '@core/errors/MeldDirectiveError';

/**
 * Validates @exec directives using new AST structure
 * Grammar handles all syntax validation - we only do semantic checks
 */
export async function validateExecDirective(node: DirectiveNode, context: ValidationContext): Promise<void> {
  // With new AST structure, directives have flattened properties
  if (!node.kind || node.kind !== 'exec') {
    throw new MeldDirectiveError(
      'Expected exec directive', 
      'exec', 
      { location: node.location?.start }
    );
  }
  
  // Grammar already validates and structures the exec directive correctly
  // It ensures we have either a command (from @run) or value (from literal)
  // Grammar also validates the field (e.g., 'risk.high') and parameters
  
  // All structural validation is done by grammar
  // This validator can focus only on semantic rules if needed
  
  // For example, we might want to validate that referenced exec names
  // are defined elsewhere, but that would be a cross-directive validation
  // which would happen at a different layer
}