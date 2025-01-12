import type { DirectiveNode, DirectiveKind } from 'meld-spec';
import { DirectiveHandler } from './index.js';
import { InterpreterState } from '../state/state.js';
import { MeldDirectiveError } from '../errors/errors.js';

interface RunDirectiveData {
  kind: 'run';
  command: string;
  background?: boolean;
}

/**
 * Handler for @run directives
 */
export class RunDirectiveHandler implements DirectiveHandler {
  canHandle(kind: DirectiveKind): boolean {
    return kind === 'run';
  }

  handle(node: DirectiveNode, state: InterpreterState): void {
    const data = node.directive as RunDirectiveData;
    
    if (!data.command) {
      throw new MeldDirectiveError(
        'Run directive requires a command',
        'run',
        node.location?.start
      );
    }

    // Store command in state for execution
    state.setDataVar('__pendingCommand', {
      command: data.command,
      background: !!data.background,
      location: node.location
    });
  }
} 