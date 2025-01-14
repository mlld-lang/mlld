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
  readonly directiveKind = 'run';

  canHandle(kind: string, mode: 'toplevel' | 'rightside'): boolean {
    return kind === 'run';
  }

  async handle(node: DirectiveNode, state: InterpreterState, context: HandlerContext): Promise<void> {
    const data = node.directive;

    // Validate command parameter
    if (!data.command) {
      throwWithContext(
        ErrorFactory.createDirectiveError,
        'Run directive requires a command parameter',
        node.location,
        context,
        'run'
      );
    }

    try {
      const { stdout, stderr } = await execAsync(data.command);
      
      if (stderr) {
        throwWithContext(
          ErrorFactory.createDirectiveError,
          `Command failed: ${stderr}`,
          node.location,
          context,
          'run'
        );
      }

      // Store output in state
      state.setTextVar('output', stdout);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throwWithContext(
        ErrorFactory.createDirectiveError,
        `Command failed: ${errorMessage}`,
        node.location,
        context,
        'run'
      );
    }
  }
}

// Export a singleton instance
export const runDirectiveHandler = new RunDirectiveHandler(); 