import type { DirectiveNode } from 'meld-spec';
import { DirectiveHandler } from './types';
import { InterpreterState } from '../state/state';
import { MeldDirectiveError } from '../errors/errors';

export class CallDirectiveHandler implements DirectiveHandler {
  canHandle(kind: string): boolean {
    return kind === '@call';
  }

  handle(node: DirectiveNode, state: InterpreterState): void {
    const data = node.directive;
    if (!data.name) {
      throw new MeldDirectiveError('Call target name is required', 'call', node.location?.start);
    }

    // Get the API definition
    const apiDef = state.getDataVar(`api:${data.name}`);
    if (!apiDef) {
      throw new MeldDirectiveError(`API '${data.name}' not found`, 'call', node.location?.start);
    }

    // Store call information in state
    state.setDataVar(`call:${data.name}`, {
      api: apiDef,
      params: data.params || {},
      headers: data.headers || {},
      body: data.body
    });
  }
}

export const callDirectiveHandler = new CallDirectiveHandler(); 