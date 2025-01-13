import type { DirectiveNode } from 'meld-spec';
import { DirectiveHandler, HandlerContext } from './types';
import { InterpreterState } from '../state/state';
import { ErrorFactory } from '../errors/factory';
import { throwWithContext } from '../utils/location-helpers';
import { exec } from 'child_process';
import { promisify } from 'util';
import { directiveLogger } from '../../utils/logger';

const execAsync = promisify(exec);

interface RunDirectiveData {
  kind: 'run';
  command: string;
  background?: boolean;
}

/**
 * Handler for @run directives
 */
export class RunDirectiveHandler implements DirectiveHandler {
  public static readonly directiveKind = 'run';

  canHandle(kind: string, mode: 'toplevel' | 'rightside'): boolean {
    return kind === RunDirectiveHandler.directiveKind;
  }

  async handle(node: DirectiveNode, state: InterpreterState, context: HandlerContext): Promise<void> {
    const data = node.directive as RunDirectiveData;
    directiveLogger.debug('Processing run directive', { 
      command: data.command,
      mode: context.mode,
      location: node.location
    });

    // Validate command parameter
    if (!data.command || typeof data.command !== 'string') {
      directiveLogger.error('Run directive missing command parameter', {
        location: node.location,
        mode: context.mode
      });

      throwWithContext(
        ErrorFactory.createDirectiveError,
        'Run directive requires a command parameter',
        node.location,
        context,
        'run'
      );
    }

    try {
      // Execute the command
      const { stdout, stderr } = await execAsync(data.command, {
        cwd: context.workspaceRoot || process.cwd()
      });

      // Handle output
      if (stdout) {
        directiveLogger.debug('Command stdout', { stdout });
      }
      if (stderr) {
        directiveLogger.warn('Command stderr', { stderr });
      }

      // Store the result
      state.setCommand(data.command, stdout.trim());
    } catch (error) {
      directiveLogger.error('Command execution failed', {
        error,
        command: data.command,
        location: node.location
      });

      throwWithContext(
        ErrorFactory.createDirectiveError,
        `Command execution failed: ${error instanceof Error ? error.message : String(error)}`,
        node.location,
        context,
        'run'
      );
    }
  }
}

export const runDirectiveHandler = new RunDirectiveHandler(); 