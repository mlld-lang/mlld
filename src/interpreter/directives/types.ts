import type { DirectiveNode, Location } from 'meld-spec';
import type { InterpreterState } from '../state/state';

/**
 * Context passed to directive handlers indicating whether they are being called
 * at the top level or in a right-side operation context
 */
export interface HandlerContext {
  /**
   * 'toplevel' means the directive is processed at the file's top level
   * 'rightside' means the directive is processed in a right-side operation context
   */
  mode: 'toplevel' | 'rightside';

  /**
   * If there's a parent state from which we inherit variables
   */
  parentState?: InterpreterState;

  /**
   * If there's a "base" location for right-side operations
   */
  baseLocation?: Location;

  /**
   * The current file path being processed
   */
  currentPath?: string;

  /**
   * You can add any additional flags you need here in the future
   */
}

export interface DirectiveHandler {
  canHandle(kind: string, mode: 'toplevel' | 'rightside'): boolean;
  handle(node: DirectiveNode, state: InterpreterState, context: HandlerContext): void;
} 