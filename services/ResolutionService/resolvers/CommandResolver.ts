import { IStateService } from '@services/StateService/IStateService.js';
import { ResolutionContext, ResolutionErrorCode } from '@services/ResolutionService/IResolutionService.js';
import { ResolutionError } from '@services/ResolutionService/errors/ResolutionError.js';
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

    // Validate command type first
    if (directiveNode.directive.kind !== 'run') {
      throw new ResolutionError(
        'Invalid node type for command resolution',
        ResolutionErrorCode.SYNTAX_ERROR,
        { value: JSON.stringify(node) }
      );
    }

    // Validate commands are allowed
    if (!context.allowedVariableTypes.command) {
      throw new ResolutionError(
        'Command references are not allowed in this context',
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

    // Get command definition
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

    // Get the command template and args
    const template = match[1];
    const args = directiveNode.directive.args || [];

    // Count required parameters in template
    const paramCount = (template.match(/\${[^}]+}/g) || []).length;
    if (args.length !== paramCount) {
      throw new ResolutionError(
        `Command ${directiveNode.directive.identifier} expects ${paramCount} parameters but got ${args.length}`,
        ResolutionErrorCode.SYNTAX_ERROR,
        { value: directiveNode.directive.identifier }
      );
    }

    // Replace parameters in template
    let result = template;
    const params = template.match(/\${([^}]+)}/g) || [];
    for (let i = 0; i < params.length; i++) {
      const param = params[i];
      const value = args[i];
      result = result.replace(param, value);
    }

    return result;
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