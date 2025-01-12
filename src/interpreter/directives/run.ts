import type { DirectiveNode } from 'meld-spec';
import { DirectiveHandler } from './types';
import { InterpreterState } from '../state/state';
import { MeldDirectiveError } from '../errors/errors';

interface RunDirectiveData {
  kind: '@run';
  command: string;
  name?: string;
  background?: boolean;
}

class RunDirectiveHandler implements DirectiveHandler {
  canHandle(kind: string): boolean {
    return kind === '@run';
  }

  handle(node: DirectiveNode, state: InterpreterState): void {
    const data = node.directive;
    
    if (!data.command) {
      throw new MeldDirectiveError(
        'Run directive requires a command',
        'run',
        node.location?.start
      );
    }

    // Store command metadata in state
    state.setDataVar('__pendingCommand', {
      command: data.command,
      background: data.background || false,
      location: node.location
    });

    // Store the command function
    state.setCommand(data.name || 'default', data.command);
  }
}

export const runDirectiveHandler = new RunDirectiveHandler(); 