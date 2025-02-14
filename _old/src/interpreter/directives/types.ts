import type { DirectiveNode } from 'meld-spec';
import type { InterpreterState } from '../state/state';

/**
 * Context for directive handlers
 */
export interface HandlerContext {
  /**
   * Mode of operation ('toplevel' | 'rightside')
   */
  mode: 'toplevel' | 'rightside';

  /**
   * Base location for adjusting error locations
   */
  baseLocation?: { start: { line: number; column: number } };

  /**
   * Parent state for inheritance
   */
  parentState?: InterpreterState;

  /**
   * Current file path
   */
  currentPath?: string;

  /**
   * The root directory of the workspace
   */
  workspaceRoot?: string;
}

/**
 * Interface for directive handlers
 */
export interface DirectiveHandler {
  /**
   * Check if this handler can handle the given directive kind
   */
  canHandle(kind: string, mode: 'toplevel' | 'rightside'): boolean;

  /**
   * Handle a directive node
   */
  handle(node: DirectiveNode, state: InterpreterState, context: HandlerContext): Promise<void>;
} 