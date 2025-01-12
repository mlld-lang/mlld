import type { DirectiveNode, DirectiveKind } from 'meld-spec';
import { InterpreterState } from '../state/state.js';

/**
 * Interface for handling Meld directives
 */
export interface DirectiveHandler {
  /**
   * Check if this handler can handle the given directive kind
   */
  canHandle(kind: DirectiveKind): boolean;

  /**
   * Handle the directive node with the given state
   */
  handle(node: DirectiveNode, state: InterpreterState): void;
}

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
  findHandler(kind: DirectiveKind): DirectiveHandler | undefined {
    return this.handlers.find(handler => handler.canHandle(kind));
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