import { IStateService } from '../../StateService/IStateService';
import { ResolutionContext, ResolutionErrorCode } from '../IResolutionService';
import { ResolutionError } from '../errors/ResolutionError';

/**
 * Handles resolution of command references ($command(args))
 */
export class CommandResolver {
  constructor(private stateService: IStateService) {}

  /**
   * Resolve command references
   */
  async resolve(cmd: string, args: string[], context: ResolutionContext): Promise<string> {
    // Validate commands are allowed
    if (!context.allowCommands) {
      throw new ResolutionError(
        'Command references are not allowed in this context',
        ResolutionErrorCode.INVALID_CONTEXT,
        { value: cmd, context }
      );
    }

    // Get command definition
    const command = this.stateService.getCommand(cmd);
    if (!command) {
      throw new ResolutionError(
        `Undefined command: ${cmd}`,
        ResolutionErrorCode.INVALID_COMMAND,
        { value: cmd, context }
      );
    }

    // Validate command format
    if (!command.command.startsWith('@run [')) {
      throw new ResolutionError(
        'Invalid command definition: must start with @run [',
        ResolutionErrorCode.INVALID_COMMAND,
        { value: command.command, context }
      );
    }

    // Extract command content
    const content = command.command.slice(6, -1); // Remove '@run [' and ']'

    // Replace parameters with arguments
    let result = content;
    const paramPattern = /\${([^}]+)}/g;
    const matches = content.match(paramPattern);

    if (matches && matches.length !== args.length) {
      throw new ResolutionError(
        `Command ${cmd} expects ${matches.length} parameters but got ${args.length}`,
        ResolutionErrorCode.INVALID_COMMAND,
        { value: cmd, context }
      );
    }

    if (matches) {
      for (let i = 0; i < matches.length; i++) {
        result = result.split(matches[i]).join(args[i]);
      }
    }

    return result;
  }

  /**
   * Extract command references from a string
   */
  extractReferences(text: string): string[] {
    const refs: string[] = [];
    const cmdPattern = /\$([A-Za-z_][A-Za-z0-9_]*)\(/g;
    let match;

    while ((match = cmdPattern.exec(text)) !== null) {
      refs.push(match[1]); // Add the command name
    }

    return refs;
  }

  /**
   * Parse a command reference string into command name and arguments
   */
  parseCommandReference(text: string): { cmd: string; args: string[] } | null {
    const cmdPattern = /\$([A-Za-z_][A-Za-z0-9_]*)\((.*?)\)/;
    const match = text.match(cmdPattern);

    if (!match) {
      return null;
    }

    const cmd = match[1];
    const argsStr = match[2];
    const args = argsStr.split(',').map(arg => arg.trim());

    return { cmd, args };
  }
} 