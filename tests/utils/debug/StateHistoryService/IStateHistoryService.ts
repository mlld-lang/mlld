/**
 * @package
 * Interface for state history tracking service.
 * 
 * @remarks
 * Provides chronological tracking of state operations, transformations,
 * and relationships. Supports debugging and analysis of state transitions
 * through history querying capabilities.
 */

import { StateEvent, StateEventType } from '@services/state/StateEventService/IStateEventService.js';
import { StateMetadata, StateRelationship } from '@tests/utils/debug/StateTrackingService/IStateTrackingService.js';

/**
 * Represents a recorded state operation
 */
export interface StateOperation {
  type: StateEventType;
  stateId: string;
  source: string;
  timestamp: number;
  parentId?: string;
  metadata?: Partial<StateMetadata>;
  details?: {
    operation?: string;
    key?: string;
    value?: unknown;
  };
}

/**
 * Represents a state transformation record
 */
export interface StateTransformation {
  stateId: string;
  timestamp: number;
  operation: string;
  source: string;
  before?: unknown;
  after?: unknown;
}

/**
 * Filter criteria for querying history
 */
export interface HistoryFilter {
  stateIds?: string[];
  types?: StateEventType[];
  timeRange?: {
    start?: number;
    end?: number;
  };
  source?: string;
}

/**
 * Core state history service interface
 */
export interface IStateHistoryService {
  /**
   * Record a state operation in history
   * @param operation - The operation details to record
   */
  recordOperation(operation: StateOperation): void;

  /**
   * Get the complete operation history for a state
   * @param stateId - The ID of the state to get history for
   * @returns Array of operations in chronological order
   */
  getOperationHistory(stateId: string): StateOperation[];

  /**
   * Get the transformation chain for a state
   * @param stateId - The ID of the state to get transformations for
   * @returns Array of transformations in chronological order
   */
  getTransformationChain(stateId: string): StateTransformation[];

  /**
   * Query history using filter criteria
   * @param filter - The filter criteria to apply
   * @returns Array of matching operations
   */
  queryHistory(filter: HistoryFilter): StateOperation[];

  /**
   * Get related operations that occurred within a time window
   * @param operation - The reference operation
   * @param windowMs - Time window in milliseconds
   * @returns Array of related operations
   */
  getRelatedOperations(operation: StateOperation, windowMs: number): StateOperation[];

  /**
   * Clear history older than specified timestamp
   * @param beforeTimestamp - Clear history before this timestamp
   */
  clearHistoryBefore(beforeTimestamp: number): void;

  /**
   * Get the complete state history including operations and transformations
   * @param stateId - The ID of the state to get history for
   * @returns Combined history of operations and transformations or undefined if state not found
   */
  getStateHistory(stateId: string): Promise<{
    operations: StateOperation[];
    transformations: StateTransformation[];
  } | undefined>;
} 