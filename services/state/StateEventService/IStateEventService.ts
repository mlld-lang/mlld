import type { 
  StateEventType, 
  StateEventBase, 
  StateEventHandlerBase, 
  StateEventFilterBase,
  StateEventHandlerOptionsBase,
  StateEventServiceBase
} from '@core/shared/types.js';

/**
 * Core event system for state tracking and instrumentation.
 * Provides event emission and handling for state operations.
 * 
 * @remarks
 * The state event system enables monitoring, debugging, and instrumentation of state changes
 * across the Meld processing pipeline. It follows an observer pattern where state operations
 * emit events that can be listened to by various components of the system.
 * 
 * This is particularly useful for:
 * - Debugging complex state transformations
 * - Tracking state lineage and relationships
 * - Performance monitoring and profiling
 * - IDE integration and visualization
 * 
 * Dependencies:
 * - None directly, though it interacts with IStateService implementations
 */

/**
 * Base state event interface providing context for state operations.
 * Contains core information about what happened, where, and when.
 */
interface StateEvent extends StateEventBase {
}

/**
 * Event handler function type for processing state events.
 * Can be synchronous or asynchronous.
 * 
 * @param event - The state event to handle
 */
type StateEventHandler = StateEventHandlerBase;

/**
 * Event filter predicate for selective event handling.
 * Returns true if the event should be processed, false if it should be ignored.
 * 
 * @param event - The event to evaluate
 * @returns true if the event should be handled, false otherwise
 */
type StateEventFilter = StateEventFilterBase;

/**
 * Handler registration options for configuring event subscription.
 */
interface StateEventHandlerOptions extends StateEventHandlerOptionsBase {
}

/**
 * Service responsible for state event management and distribution.
 * Implements the observer pattern for state change notifications.
 */
interface IStateEventService extends StateEventServiceBase {
  /**
   * Register an event handler with optional filtering.
   * 
   * @param type - The event type to listen for
   * @param handler - The handler function to call when events occur
   * @param options - Optional configuration for the handler registration
   * 
   * @example
   * ```ts
   * stateEventService.on('transform', (event) => {
   *   console.log(`State ${event.stateId} was transformed by ${event.source}`);
   * }, {
   *   filter: (event) => event.source === 'DirectiveService'
   * });
   * ```
   */
  on(type: StateEventType, handler: StateEventHandler, options?: StateEventHandlerOptions): void;

  /**
   * Remove an event handler.
   * 
   * @param type - The event type the handler was registered for
   * @param handler - The handler function to remove
   */
  off(type: StateEventType, handler: StateEventHandler): void;

  /**
   * Emit a state event to all registered handlers.
   * 
   * @param event - The event to emit
   * @returns A promise that resolves when all handlers have processed the event
   * 
   * @example
   * ```ts
   * await stateEventService.emit({
   *   type: 'transform',
   *   stateId: '1234',
   *   source: 'DirectiveService',
   *   timestamp: Date.now(),
   *   location: { file: 'example.meld', line: 42 }
   * });
   * ```
   */
  emit(event: StateEvent): Promise<void>;

  /**
   * Get all registered handlers for an event type.
   * Primarily used for debugging and testing.
   * 
   * @param type - The event type to get handlers for
   * @returns Array of registered handlers and their options
   */
  getHandlers(type: StateEventType): Array<{
    handler: StateEventHandler;
    options?: StateEventHandlerOptions;
  }>;
}

export type {
  StateEvent,
  StateEventHandler,
  StateEventFilter,
  StateEventHandlerOptions,
  IStateEventService
}; 