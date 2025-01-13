import type { DirectiveNode } from 'meld-spec';
import { DirectiveHandler, HandlerContext } from './types';
import { InterpreterState } from '../state/state';
import { ErrorFactory } from '../errors/factory';
import { throwWithContext } from '../utils/location-helpers';
import { exec } from 'child_process';
import { promisify } from 'util';

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

    // Validate command parameter
    if (!data.command || typeof data.command !== 'string') {
      const error = ErrorFactory.createDirectiveError(
        'Run directive requires a command parameter',
        'run',
        node.location?.start
      );
      
      if (context.mode === 'rightside' && node.location && context.baseLocation) {
        throw ErrorFactory.createWithAdjustedLocation(
          () => error,
          error.message,
          node.location.start,
          context.baseLocation.start,
          'run'
        );
      }
      throw error;
    }

    try {
      // Get working directory from context or current process
      const cwd = context.currentPath || process.cwd();

      // Execute command and capture output
      const result = await execAsync(data.command, {
        cwd,
        env: { ...process.env },
        maxBuffer: 10 * 1024 * 1024 // 10MB buffer
      });

      // Combine stdout and stderr, ensuring proper line endings
      const output = [
        result.stdout && result.stdout.trim(),
        result.stderr && `Error: ${result.stderr.trim()}`
      ].filter(Boolean).join('\n');

      if (output) {
        // Store output in state
        const commandName = `run_${Date.now()}`;
        state.setCommand(commandName, output);
      }
    } catch (error: any) {
      // Handle command execution errors
      const errorMessage = `Command execution failed: ${error.message}`;
      const commandError = ErrorFactory.createDirectiveError(
        errorMessage,
        'run',
        node.location?.start
      );
      
      if (context.mode === 'rightside' && node.location && context.baseLocation) {
        throw ErrorFactory.createWithAdjustedLocation(
          () => commandError,
          errorMessage,
          node.location.start,
          context.baseLocation.start,
          'run'
        );
      }
      throw commandError;
    }
  }
}

export const runDirectiveHandler = new RunDirectiveHandler(); 