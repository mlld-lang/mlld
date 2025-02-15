import { IStateService } from '../../StateService/IStateService';
import { ResolutionContext, ResolutionErrorCode } from '../IResolutionService';
import { ResolutionError } from '../errors/ResolutionError';
import type { MeldNode, DirectiveNode, TextNode } from 'meld-spec';

/**
 * Handles resolution of command references ($run)
 */
export class CommandResolver {
  constructor(private stateService: IStateService) {}

  /**
   * Resolve command references in a node
   */
  async resolve(node: MeldNode, context: ResolutionContext): Promise<string> {
    // Early return if not a directive node
    if (node.type !== 'Directive') {
      return node.type === 'Text' ? (node as TextNode).content : '';
    }

    const directiveNode = node as DirectiveNode;

    // Validate command variables are allowed
    if (!context.allowedVariableTypes.command) {
      throw new ResolutionError(
        'Command variables are not allowed in this context',
        ResolutionErrorCode.INVALID_CONTEXT,
        { value: directiveNode.directive.value, context }
      );
    }

    // Validate command identifier
    if (!directiveNode.directive.identifier) {
      throw new ResolutionError(
        'Command identifier is required',
        ResolutionErrorCode.SYNTAX_ERROR,
        { value: JSON.stringify(node) }
      );
    }

    // Get command value
    const command = this.stateService.getCommand(directiveNode.directive.identifier);
    if (!command) {
      throw new ResolutionError(
        `Undefined command: ${directiveNode.directive.identifier}`,
        ResolutionErrorCode.UNDEFINED_VARIABLE,
        { value: directiveNode.directive.identifier, context }
      );
    }

    // Extract the actual command from the @run format
    const match = command.command.match(/^@run\s*\[(.*)\]$/);
    if (!match) {
      throw new ResolutionError(
        'Invalid command definition: must start with @run [',
        ResolutionErrorCode.INVALID_COMMAND,
        { value: command.command }
      );
    }

    return match[1];
  }

  /**
   * Extract references from a node
   */
  extractReferences(node: MeldNode): string[] {
    if (node.type !== 'Directive' || (node as DirectiveNode).directive.kind !== 'run') {
      return [];
    }

    return [(node as DirectiveNode).directive.identifier];
  }
} 