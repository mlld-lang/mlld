import { DirectiveNode } from '@core/syntax/types';
import { MeldDirectiveError } from '@core/errors/MeldDirectiveError';
import { DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError';

// Define valid subtypes for @run directive
const VALID_RUN_SUBTYPES = ['runExec', 'runCommand', 'runCode', 'runCodeParams'] as const;
type RunDirectiveSubtype = typeof VALID_RUN_SUBTYPES[number];

/**
 * Validates @run directives
 */
export async function validateRunDirective(node: DirectiveNode): Promise<void> {
  const directive = node.directive;
  
  // 1. Check for the existence of the 'command' property (fundamental)
  if (!directive.command) { // Assuming grammar ensures 'command' holds the core content
    throw new MeldDirectiveError(
      '@run directive requires a "command" property representing the command to run or reference',
      'run',
      { 
        location: node.location?.start,
        code: DirectiveErrorCode.VALIDATION_FAILED
      }
    );
  }

  // 2. Check for the existence and validity of the 'subtype' property
  const subtype = directive.subtype as RunDirectiveSubtype;
  if (!subtype || !VALID_RUN_SUBTYPES.includes(subtype)) {
    throw new MeldDirectiveError(
      `@run directive requires a valid "subtype" (${VALID_RUN_SUBTYPES.join(' | ')}). Found: ${subtype || 'undefined'}`, 
      'run',
      { 
        location: node.location?.start,
        code: DirectiveErrorCode.VALIDATION_FAILED
      }
    );
  }

  // Note: We trust the grammar to set the correct structure for 'directive.command' 
  // based on the 'subtype'. e.g., object for 'runExec', array for others.
  // Further structural validation here would be redundant with grammar rules.
}