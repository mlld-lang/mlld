import type { DirectiveNode } from 'meld-spec';
import { DirectiveHandler, HandlerContext } from './types';
import { InterpreterState } from '../state/state';
import { ErrorFactory } from '../errors/factory';
import { throwWithContext } from '../utils/location-helpers';
import { directiveLogger } from '../../utils/logger';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

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
      directiveLogger.error('Run directive missing command', {
        location: node.location,
        mode: context.mode
      });
      throwWithContext(
        ErrorFactory.createDirectiveError,
        'Run directive requires a command',
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

      // Store output in state
      if (stdout) {
        state.setTextVar('stdout', stdout);
      }
      if (stderr) {
        state.setTextVar('stderr', stderr);
      }

      directiveLogger.info('Command executed successfully', {
        command: data.command,
        stdout: stdout.length,
        stderr: stderr.length
      });
    } catch (error) {
      directiveLogger.error('Command execution failed', {
        command: data.command,
        error: error instanceof Error ? error.message : String(error)
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

// Export a singleton instance
export const runDirectiveHandler = new RunDirectiveHandler(); 