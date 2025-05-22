import type { DirectiveNode } from '@core/ast/types';
import type { DirectiveResult, StateChanges } from '@core/directives/DirectiveHandler';
import type { IDirectiveHandler, IDirectiveService } from './IDirectiveService.new';
import type { IStateService } from '@services/state/StateService/IStateService';
import { MeldDirectiveError } from '@core/errors';
import { injectable, inject, DependencyContainer } from 'tsyringe';
import { HandlerRegistry } from './HandlerRegistry.new';

/**
 * Minimal DirectiveService implementation.
 * 
 * This service simply routes directives to their handlers and returns results.
 * All complexity is removed - no context objects, no state merging, just simple dispatch.
 */
@injectable()
export class DirectiveService implements IDirectiveService {
  private handlers = new Map<string, IDirectiveHandler>();
  private handlersInitialized = false;
  
  constructor(
    @inject('DependencyContainer') private container: DependencyContainer
  ) {
    // Handlers will be registered lazily on first use
  }
  
  private ensureHandlersRegistered(): void {
    if (!this.handlersInitialized) {
      HandlerRegistry.registerWithService(this, this.container);
      this.handlersInitialized = true;
    }
  }
  
  /**
   * Register a directive handler
   */
  registerHandler(handler: IDirectiveHandler): void {
    this.handlers.set(handler.kind, handler);
  }
  
  /**
   * Handle a directive with the appropriate handler
   */
  async handleDirective(
    directive: DirectiveNode,
    state: IStateService,
    options: {
      strict: boolean;
      filePath?: string;
    }
  ): Promise<DirectiveResult> {
    this.ensureHandlersRegistered();
    const handler = this.handlers.get(directive.kind);
    
    if (!handler) {
      throw new MeldDirectiveError(
        `No handler registered for directive kind: ${directive.kind}`,
        { nodeLocation: directive.location }
      );
    }
    
    // Simply call the handler and return its result
    return handler.handle(directive, state, options);
  }
  
  /**
   * Process multiple directives in sequence
   */
  async processDirectives(
    directives: DirectiveNode[],
    state: IStateService,
    options: {
      strict: boolean;
      filePath?: string;
    }
  ): Promise<IStateService> {
    let currentState = state;
    
    for (const directive of directives) {
      const result = await this.handleDirective(directive, currentState, options);
      
      // Apply state changes if present
      if (result.stateChanges) {
        currentState = await this.applyStateChanges(currentState, result.stateChanges);
      }
    }
    
    return currentState;
  }
  
  /**
   * Apply state changes to the existing state
   */
  private async applyStateChanges(
    state: IStateService,
    changes: StateChanges
  ): Promise<IStateService> {
    // Apply variable changes directly to the state
    if (changes.variables) {
      for (const [name, variable] of Object.entries(changes.variables)) {
        state.setVariable(variable);
      }
    }
    
    return state;
  }
}