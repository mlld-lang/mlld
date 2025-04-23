import type { 
  StateEventType, 
  StateEventBase, 
  StateEventHandlerBase, 
  StateEventFilterBase,
  StateEventHandlerOptionsBase,
  StateEventServiceBase
} from '@core/shared/types';

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
 * Specific event type for state transformations, including details.
 */
interface StateTransformEvent extends StateEventBase {
  type: 'transform'; // Discriminating literal type
  details: {
    operation: string; // e.g., 'setTextVar', 'addNode'
    before?: unknown;  // State or relevant part before change
    after?: unknown;   // State or relevant part after change
  };
}

/**
 * Represents any possible state event.
 * Use type narrowing (e.g., checking event.type) to access specific details.
 */
// Make StateEvent a union of the base and specific event types
type StateEvent = StateEventBase | StateTransformEvent;

/**
 * Event handler function type for processing state events.
 * Can be synchronous or asynchronous.
 * 
 * @param event - The state event to handle
 */
type StateEventHandler = (event: StateEvent) => void | Promise<void>;

/**
 * Event filter predicate for selective event handling.
 * Returns true if the event should be processed, false if it should be ignored.
 * 
 * @param event - The event to evaluate
 * @returns true if the event should be handled, false otherwise
 */
type StateEventFilter = (event: StateEvent) => boolean;

/**
 * Handler registration options for configuring event subscription.
 */
interface StateEventHandlerOptions extends StateEventHandlerOptionsBase {
}

/**
 * Service responsible for state event management and distribution.
 * Implements the observer pattern for state change notifications.
 */
export interface IStateEventService extends StateEventServiceBase {
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
  StateTransformEvent,
  StateEvent,
  StateEventHandler,
  StateEventFilter,
  StateEventHandlerOptions
}; 