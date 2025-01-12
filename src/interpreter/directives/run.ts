import type { DirectiveNode, Location } from 'meld-spec';
import { DirectiveHandler, HandlerContext } from './types';
import { InterpreterState } from '../state/state';
import { MeldDirectiveError } from '../errors/errors';

interface RunDirectiveData {
  kind: '@run';
  command: string;
  name?: string;
  background?: boolean;
}

/**
 * Adjusts a location based on the base location in right-side mode
 */
function adjustLocation(location: Location | undefined, baseLocation: Location | undefined): Location | undefined {
  if (!location || !baseLocation) {
    return location;
  }

  return {
    start: {
      line: location.start.line + baseLocation.start.line - 1,
      column: location.start.line === 1 
        ? location.start.column + baseLocation.start.column - 1 
        : location.start.column
    },
    end: {
      line: location.end.line + baseLocation.start.line - 1,
      column: location.end.line === 1 
        ? location.end.column + baseLocation.start.column - 1 
        : location.end.column
    }
  };
}

class RunDirectiveHandler implements DirectiveHandler {
  canHandle(kind: string, mode: 'toplevel' | 'rightside'): boolean {
    // Run directives can be used in both top-level and right-side contexts
    return kind === '@run';
  }

  handle(node: DirectiveNode, state: InterpreterState, context: HandlerContext): void {
    const data = node.directive;
    
    if (!data.command) {
      throw new MeldDirectiveError(
        'Run directive requires a command',
        'run',
        // Adjust error location if in right-side mode
        context.mode === 'rightside' 
          ? adjustLocation(node.location, context.baseLocation)?.start
          : node.location?.start
      );
    }

    // Store command metadata in state, adjusting location if needed
    state.setDataVar('__pendingCommand', {
      command: data.command,
      background: data.background || false,
      location: context.mode === 'rightside'
        ? adjustLocation(node.location, context.baseLocation)
        : node.location
    });

    // Store the command in the commands map
    state.setDataVar(data.name || 'default', data.command);
  }
}

export const runDirectiveHandler = new RunDirectiveHandler(); 