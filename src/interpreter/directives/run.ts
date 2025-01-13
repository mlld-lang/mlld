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
    const data = node.directive;
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
      directiveLogger.info(`Executing command: ${data.command}`, {
        background: data.background,
        mode: context.mode
      });

      const { stdout, stderr } = await execAsync(data.command);
      
      if (stdout) {
        directiveLogger.debug('Command stdout', { stdout });
      }
      if (stderr) {
        directiveLogger.warn('Command stderr', { stderr });
      }
    } catch (error) {
      directiveLogger.error('Command execution failed', {
        command: data.command,
        error: error instanceof Error ? error.message : String(error),
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