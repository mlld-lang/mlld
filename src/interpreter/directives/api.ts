import type { DirectiveNode } from 'meld-spec';
import { DirectiveHandler } from './types';
import { InterpreterState } from '../state/state';
import { MeldDirectiveError } from '../errors/errors';

export class ApiDirectiveHandler implements DirectiveHandler {
  canHandle(kind: string): boolean {
    return kind === '@api';
  }

  handle(node: DirectiveNode, state: InterpreterState): void {
    const data = node.directive;
    if (!data.name) {
      throw new MeldDirectiveError('API name is required', 'api', node.location?.start);
    }

    // Store API definition in state
    state.setDataVar(`api:${data.name}`, {
      name: data.name,
      method: data.method || 'GET',
      path: data.path || '/',
      params: data.params || {},
      headers: data.headers || {},
      body: data.body
    });
  }
}

export const apiDirectiveHandler = new ApiDirectiveHandler(); 