import type { DirectiveNode } from 'meld-spec';
import { DirectiveHandler } from './types';
import { InterpreterState } from '../state/state';
import { MeldDirectiveError } from '../errors/errors';

export class DataDirectiveHandler implements DirectiveHandler {
  canHandle(kind: DirectiveKind): boolean {
    return kind === '@data' || kind === 'data';
  }

  handle(node: DirectiveNode, state: InterpreterState): void {
    const data = node.directive;
    if (!data.identifier) {
      throw new MeldDirectiveError('Data directive requires an identifier', 'data', node.location?.start);
    }
    if (!data.value) {
      throw new MeldDirectiveError('Data directive requires a value', 'data', node.location?.start);
    }

    state.setDataVar(data.identifier, data.value);
  }
}

export const dataDirectiveHandler = new DataDirectiveHandler(); 