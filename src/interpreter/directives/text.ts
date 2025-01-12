import type { DirectiveNode } from 'meld-spec';
import { DirectiveHandler, HandlerContext } from './types';
import { InterpreterState } from '../state/state';
import { MeldDirectiveError } from '../errors/errors';
import { adjustLocation } from '../utils/location';

export class TextDirectiveHandler implements DirectiveHandler {
  canHandle(kind: string, mode: 'toplevel' | 'rightside'): boolean {
    return kind === '@text';
  }

  handle(node: DirectiveNode, state: InterpreterState, context: HandlerContext): void {
    const data = node.directive;
    
    if (!data.name) {
      throw new MeldDirectiveError(
        'Text directive requires a name',
        'text',
        context.mode === 'rightside'
          ? adjustLocation(node.location, context.baseLocation)?.start
          : node.location?.start
      );
    }

    // Allow empty string values
    let value = data.value === undefined ? '' : data.value;
    if (Array.isArray(value)) {
      value = value.join('');
    }

    // If we're in a right-side context, adjust any locations in the value
    if (context.mode === 'rightside' && context.baseLocation && node.location) {
      // Create a copy of the node to avoid modifying the original
      const nodeCopy = { ...node, location: { ...node.location } };
      
      // Adjust location based on the base location
      const adjustedLocation = adjustLocation(nodeCopy.location, context.baseLocation);
      if (adjustedLocation) {
        nodeCopy.location = adjustedLocation;
      }

      // Add the adjusted node to the state
      state.addNode(nodeCopy);
    } else {
      // Add the original node if not in right-side context
      state.addNode(node);
    }

    state.setTextVar(data.name, value);
  }
}

export const textDirectiveHandler = new TextDirectiveHandler();