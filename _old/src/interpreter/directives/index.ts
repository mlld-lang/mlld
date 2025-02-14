import type { DirectiveNode } from 'meld-spec';
import { InterpreterState } from '../state/state.js';
import { DirectiveHandler } from './types';

/**
 * Registry for directive handlers
 */
export class DirectiveRegistry {
  private handlers: DirectiveHandler[] = [];

  /**
   * Register a new directive handler
   */
  register(handler: DirectiveHandler): void {
    this.handlers.push(handler);
  }

  /**
   * Find a handler for the given directive kind
   */
  findHandler(kind: string, mode: 'toplevel' | 'rightside'): DirectiveHandler | undefined {
    return this.handlers.find(handler => handler.canHandle(kind, mode));
  }

  /**
   * Clear all registered handlers
   */
  clear(): void {
    this.handlers = [];
  }
}

// Create and export a singleton instance
export const directiveRegistry = new DirectiveRegistry(); 