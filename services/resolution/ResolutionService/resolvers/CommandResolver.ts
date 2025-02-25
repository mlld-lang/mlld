import { IStateService } from '@services/state/StateService/IStateService.js';
import { ResolutionContext, ResolutionErrorCode } from '@services/resolution/ResolutionService/IResolutionService.js';
import { ResolutionError } from '@services/resolution/ResolutionService/errors/ResolutionError.js';
import type { MeldNode, DirectiveNode, TextNode } from 'meld-spec';
import { MeldResolutionError } from '@core/errors/MeldResolutionError.js';
import { ErrorSeverity } from '@core/errors/MeldError.js';

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
      throw new MeldResolutionError(
        'Invalid node type for command resolution',
        {
          code: ResolutionErrorCode.SYNTAX_ERROR,
          severity: ErrorSeverity.Fatal,
          details: { 
            value: JSON.stringify(node)
          }
        }
      );
    }

    // Validate commands are allowed
    if (!context.allowedVariableTypes.command) {
      throw new MeldResolutionError(
        'Command references are not allowed in this context',
        {
          code: ResolutionErrorCode.INVALID_CONTEXT,
          severity: ErrorSeverity.Fatal,
          details: { 
            value: directiveNode.directive.value,
            context: JSON.stringify(context)
          }
        }
      );
    }

    // Validate command identifier
    if (!directiveNode.directive.identifier) {
      throw new MeldResolutionError(
        'Command identifier is required',
        {
          code: ResolutionErrorCode.SYNTAX_ERROR,
          severity: ErrorSeverity.Fatal,
          details: { 
            value: JSON.stringify(node)
          }
        }
      );
    }

    // Get command definition
    const command = this.stateService.getCommand(directiveNode.directive.identifier);
    if (!command) {
      throw new MeldResolutionError(
        `Undefined command: ${directiveNode.directive.identifier}`,
        {
          code: ResolutionErrorCode.UNDEFINED_VARIABLE,
          severity: ErrorSeverity.Recoverable,
          details: { 
            variableName: directiveNode.directive.identifier,
            variableType: 'command'
          }
        }
      );
    }

    // Extract the actual command from the @run format
    const match = command.command.match(/^@run\s*\[(.*)\]$/);
    if (!match) {
      throw new MeldResolutionError(
        'Invalid command definition: must start with @run [',
        {
          code: ResolutionErrorCode.INVALID_COMMAND,
          severity: ErrorSeverity.Fatal,
          details: { 
            value: command.command
          }
        }
      );
    }

    // Get the command template and args
    const template = match[1];
    const args = directiveNode.directive.args || [];

    // Count required parameters in template
    const paramCount = (template.match(/\${[^}]+}/g) || []).length;
    if (args.length !== paramCount) {
      throw new MeldResolutionError(
        `Command ${directiveNode.directive.identifier} expects ${paramCount} parameters but got ${args.length}`,
        {
          code: ResolutionErrorCode.PARAMETER_MISMATCH,
          severity: ErrorSeverity.Fatal, // Parameter mismatches are fatal as they indicate a syntax error
          details: { 
            variableName: directiveNode.directive.identifier,
            variableType: 'command',
            context: `Expected ${paramCount} parameters, got ${args.length}`
          }
        }
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