import { DirectiveNode } from '@core/types/ast-nodes';
import { MeldDirectiveError } from '@core/errors/MeldDirectiveError';
import { DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError';

/**
 * Validates @run directives using new AST structure
 * Grammar handles all syntax validation - we only do semantic checks
 */
export async function validateRunDirective(node: DirectiveNode): Promise<void> {
  // With new AST structure, directives have flattened properties
  if (!node.kind || node.kind !== 'run') {
    throw new MeldDirectiveError(
      'Expected run directive',
      'run',
      { 
        location: node.location?.start,
        code: DirectiveErrorCode.VALIDATION_FAILED
      }
    );
  }
  
  // Grammar already validates structure and sets the correct subtype
  // Subtypes like runExec, runCommand, runCode are guaranteed by grammar
  
  // The values object contains the parsed command/code/exec info
  // Grammar ensures proper structure so we don't need to validate that
  
  // Only semantic validation needed here
  // For example, checking if referenced executables exist would be a runtime concern
  // Not something to validate here
  
  // Most validation is now done by grammar
  // This validator can be very minimal
}