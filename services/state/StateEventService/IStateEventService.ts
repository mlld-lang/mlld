/**
 * @package
 * Core event system for state tracking.
 * 
 * @remarks
 * Provides event emission and handling for state operations.
 */

/**
 * Core state event types as defined in the instrumentation plan
 */
export type StateEventType = 'create' | 'clone' | 'transform' | 'merge' | 'error';

/**
 * Base state event interface
 */
export interface StateEvent {
  type: StateEventType;
  stateId: string;
  source: string;
  timestamp: number;
  location?: {
    file?: string;
    line?: number;
    column?: number;
  };
}

/**
 * Event handler function type
 */
export type StateEventHandler = (event: StateEvent) => void | Promise<void>;

/**
 * Event filter predicate
 */
export type StateEventFilter = (event: StateEvent) => boolean;

/**
 * Handler registration options
 */
export interface StateEventHandlerOptions {
  filter?: StateEventFilter;
}

/**
 * Core state event service interface
 */
export interface IStateEventService {
  /**
   * Register an event handler with optional filtering
   */
  on(type: StateEventType, handler: StateEventHandler, options?: StateEventHandlerOptions): void;

  /**
   * Remove an event handler
   */
  off(type: StateEventType, handler: StateEventHandler): void;

  /**
   * Emit a state event
   */
  emit(event: StateEvent): Promise<void>;

  /**
   * Get all registered handlers for an event type
   */
  getHandlers(type: StateEventType): Array<{
    handler: StateEventHandler;
    options?: StateEventHandlerOptions;
  }>;
} 