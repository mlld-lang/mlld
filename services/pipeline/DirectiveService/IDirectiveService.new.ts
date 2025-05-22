import type { DirectiveNode } from '@core/ast/types';
import type { DirectiveResult } from '@core/directives/DirectiveHandler';
import type { IStateService } from '@services/state/StateService/IStateService';

/**
 * Minimal directive handler interface.
 * Handlers process directives and return state changes.
 */
export interface IDirectiveHandler {
  /**
   * The directive kind this handler processes
   */
  readonly kind: string;
  
  /**
   * Process a directive and return state changes
   */
  handle(
    directive: DirectiveNode,
    state: IStateService,
    options: {
      strict: boolean;
      filePath?: string;
    }
  ): Promise<DirectiveResult>;
}

/**
 * Minimal directive service interface.
 * Coordinates directive processing through handlers.
 */
export interface IDirectiveService {
  /**
   * Register a directive handler
   */
  registerHandler(handler: IDirectiveHandler): void;
  
  /**
   * Handle a directive with the appropriate handler
   */
  handleDirective(
    directive: DirectiveNode,
    state: IStateService,
    options: {
      strict: boolean;
      filePath?: string;
    }
  ): Promise<DirectiveResult>;
  
  /**
   * Process multiple directives in sequence
   */
  processDirectives(
    directives: DirectiveNode[],
    state: IStateService,
    options: {
      strict: boolean;
      filePath?: string;
    }
  ): Promise<IStateService>;
}