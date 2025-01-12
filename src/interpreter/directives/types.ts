import { DirectiveNode } from 'meld-spec';
import { InterpreterState } from '../state/state.js';

export interface DirectiveHandler {
  canHandle(kind: string): boolean;
  handle(node: DirectiveNode, state: InterpreterState): void;
} 