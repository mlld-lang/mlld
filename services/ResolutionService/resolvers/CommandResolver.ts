import { IStateService } from '../../StateService/IStateService';
import { ResolutionContext, ResolutionErrorCode } from '../IResolutionService';
import { ResolutionError } from '../errors/ResolutionError';
import { MeldNode, DirectiveNode, TextNode } from 'meld-spec';

/**
 * Handles resolution of command references ($command(args))
 */
export class CommandResolver {
  constructor(private stateService: IStateService) {}

  /**
   * Resolve command references in a node
   */
  async resolve(node: MeldNode, context: ResolutionContext): Promise<string> {
    // Return text node content unchanged
    if (node.type === 'Text') {
      return (node as TextNode).content;
    }

    // Validate node type
    const directiveNode = node as DirectiveNode;
    if (node.type !== 'Directive' || directiveNode.directive.kind !== 'run') {
      throw new ResolutionError(
        'Invalid node type for command resolution',
        ResolutionErrorCode.SYNTAX_ERROR,
        { value: JSON.stringify(directiveNode) }
      );
    }

    // Check if commands are allowed in this context
    if (!context.allowedVariableTypes.command) {
      throw new ResolutionError(
        'Command references are not allowed in this context',
        ResolutionErrorCode.INVALID_CONTEXT,
        { value: directiveNode.directive.value, context }
      );
    }

    // Validate command name
    if (!directiveNode.directive.name) {
      throw new ResolutionError(
        'Command name is required',
        ResolutionErrorCode.SYNTAX_ERROR,
        { value: JSON.stringify(directiveNode) }
      );
    }

    // Get command definition
    const cmdDef = this.stateService.getCommand(directiveNode.directive.name);
    if (!cmdDef) {
      throw new ResolutionError(
        `Undefined command: ${directiveNode.directive.name}`,
        ResolutionErrorCode.UNDEFINED_VARIABLE,
        { value: directiveNode.directive.name, context }
      );
    }

    // Validate command format
    if (!cmdDef.command.startsWith('@run [')) {
      throw new ResolutionError(
        'Invalid command definition: must start with @run [',
        ResolutionErrorCode.SYNTAX_ERROR,
        { value: cmdDef.command, context }
      );
    }

    // Extract command template
    const template = cmdDef.command.slice(6, -1);

    // Count expected parameters
    const paramMatches = template.match(/\${[^}]+}/g) || [];
    const expectedParams = paramMatches.length;

    // Validate parameter count
    const actualParams = directiveNode.directive.args?.length || 0;
    if (actualParams !== expectedParams) {
      throw new ResolutionError(
        `Command ${directiveNode.directive.name} expects ${expectedParams} parameters but got ${actualParams}`,
        ResolutionErrorCode.SYNTAX_ERROR,
        { value: directiveNode.directive.value, context }
      );
    }

    // Replace parameters in template
    let result = template;
    paramMatches.forEach((param, index) => {
      result = result.replace(param, directiveNode.directive.args[index]);
    });

    return result;
  }

  /**
   * Extract references from a node
   */
  extractReferences(node: MeldNode): string[] {
    if (node.type !== 'Directive') return [];
    const directiveNode = node as DirectiveNode;
    if (directiveNode.directive.kind !== 'run' || !directiveNode.directive.name) {
      return [];
    }
    return [directiveNode.directive.name];
  }
} 