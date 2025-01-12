import type { DirectiveNode } from 'meld-spec';
import type { InterpreterState } from '../state/state';

export interface DirectiveHandler {
  canHandle(kind: string): boolean;
  handle(node: DirectiveNode, state: InterpreterState): void;
} 