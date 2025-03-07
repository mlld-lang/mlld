import { IStateEventService, StateEvent, StateEventType, StateEventHandler, StateEventHandlerOptions } from './IStateEventService.js';
import { stateLogger as logger } from '@core/utils/logger.js';
import { Service } from '@core/ServiceProvider.js';

/**
 * @package
 * Core event system implementation for state tracking.
 * 
 * @remarks
 * Provides event emission and handling for state operations.
 * Implements filtering and async event handling.
 */
@Service({
  description: 'Service for emitting and handling state events'
})
export class StateEventService implements IStateEventService {
  private handlers: Map<StateEventType, Array<{
    handler: StateEventHandler;
    options?: StateEventHandlerOptions;
  }>> = new Map();

  constructor() {
    // Initialize handler arrays for each event type
    const eventTypes: StateEventType[] = ['create', 'clone', 'transform', 'merge', 'error'];
    eventTypes.forEach(type => this.handlers.set(type, []));
  }

  /**
   * Register an event handler with optional filtering
   */
  on(type: StateEventType, handler: StateEventHandler, options?: StateEventHandlerOptions): void {
    const handlers = this.handlers.get(type);
    if (!handlers) {
      throw new Error(`Invalid event type: ${type}`);
    }

    handlers.push({ handler, options });
    logger.debug(`Registered handler for ${type} events`, { 
      type,
      hasFilter: !!options?.filter 
    });
  }

  /**
   * Remove an event handler
   */
  off(type: StateEventType, handler: StateEventHandler): void {
    const handlers = this.handlers.get(type);
    if (!handlers) {
      throw new Error(`Invalid event type: ${type}`);
    }

    const index = handlers.findIndex(h => h.handler === handler);
    if (index !== -1) {
      handlers.splice(index, 1);
      logger.debug(`Removed handler for ${type} events`);
    }
  }

  /**
   * Emit a state event
   */
  async emit(event: StateEvent): Promise<void> {
    const handlers = this.handlers.get(event.type);
    if (!handlers) {
      throw new Error(`Invalid event type: ${event.type}`);
    }

    logger.debug(`Emitting ${event.type} event`, { 
      stateId: event.stateId,
      source: event.source
    });

    // Group handlers by their filter conditions to prevent duplicate processing
    const handlerGroups = new Map<string, Array<{ handler: StateEventHandler; options?: StateEventHandlerOptions }>>();
    
    for (const handlerEntry of handlers) {
      // Create a key based on the filter condition
      const filterKey = handlerEntry.options?.filter ? 
        `${event.source}-${event.stateId}-${event.location?.file || ''}` : 
        'no-filter';
      
      const group = handlerGroups.get(filterKey) || [];
      group.push(handlerEntry);
      handlerGroups.set(filterKey, group);
    }

    // Process each group once
    for (const [_, groupHandlers] of handlerGroups) {
      // Only execute if the first handler's filter passes
      const firstHandler = groupHandlers[0];
      if (firstHandler.options?.filter && !firstHandler.options.filter(event)) {
        continue;
      }

      // Execute all handlers in the group
      for (const { handler } of groupHandlers) {
        try {
          await Promise.resolve(handler(event));
        } catch (error) {
          // Log error but continue processing other handlers
          logger.error(`Error in ${event.type} event handler`, {
            error: error instanceof Error ? error.message : String(error),
            stateId: event.stateId
          });
        }
      }
    }
  }

  /**
   * Get all registered handlers for an event type
   */
  getHandlers(type: StateEventType): Array<{
    handler: StateEventHandler;
    options?: StateEventHandlerOptions;
  }> {
    const handlers = this.handlers.get(type);
    if (!handlers) {
      throw new Error(`Invalid event type: ${type}`);
    }
    return [...handlers];
  }
} 