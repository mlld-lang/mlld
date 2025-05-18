import { DirectiveNode } from '@core/syntax/types/nodes';
import { ValidationContext } from '@core/syntax/types/index';
import { MeldDirectiveError } from '@core/errors/MeldDirectiveError';

/**
 * Validates the structure of a `@exec` directive node based on grammar expectations.
 * Assumes the grammar correctly parses the directive into:
 * - `name`: string (required, non-empty)
 * - `field`?: string (optional, specific allowed values like 'risk.high')
 * - `parameters`?: string[] (optional, for runnable exec directives)
 * - EITHER `command`: object (if defined using =@run ...)
 * - OR `value`: object[] (if defined using ="...")
 */
export async function validateExecDirective(node: DirectiveNode, context: ValidationContext): Promise<void> {
  const directive = node.directive;

  // 1. Validate 'name' property (Required by grammar as Identifier)
  if (!directive.name || typeof directive.name !== 'string' || directive.name.trim() === '') {
    // This check ensures the identifier wasn't empty, though grammar likely prevents this. Safety check.
    throw new MeldDirectiveError('Exec directive requires a non-empty "name" property', 'exec', { location: node.location?.start });
  }

  // 2. Validate 'field' property (Optional, specific values enforced by grammar: ExecField rule)
  // No explicit validation needed here; trust the grammar's ExecField rule.

  // 3. Validate 'parameters' property (Optional, enforced by grammar: ExecParams rule)
  // No explicit validation needed here; trust the grammar's ExecParams rule.

  // 4. Validate presence of EITHER 'command' (from @run) OR 'value' (from literal string)
  // The grammar's ExecValue rule ensures one or the other is present.
  if (directive.command === undefined && directive.value === undefined) {
    // This case should ideally not happen if the grammar is correct.
    throw new MeldDirectiveError('Internal Grammar Error: Exec directive lacks required "command" or "value" property after parsing.', 'exec', { location: node.location?.start });
  }
  if (directive.command !== undefined && directive.value !== undefined) {
    // This case should also ideally not happen if the grammar is correct.
     throw new MeldDirectiveError('Internal Grammar Error: Exec directive has both "command" and "value" properties after parsing.', 'exec', { location: node.location?.start });
  }

  // 5. Validate structure of 'command' or 'value' (Optional, mostly handled by grammar)
  // - The structure of `command` is defined by the _RunRHS rule in the grammar.
  // - The structure of `value` is defined by InterpolatedStringLiteral rules.
  // Explicit validation here would duplicate grammar logic. Trust the parser.
}