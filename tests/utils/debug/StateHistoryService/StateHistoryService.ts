import type { IStateEventService } from '@services/state/StateEventService/IStateEventService';
import { IStateHistoryService, StateOperation, StateTransformation, HistoryFilter } from '@tests/utils/debug/StateHistoryService/IStateHistoryService';
import type { StateTransformEvent } from '@services/state/StateEventService/IStateEventService';
import { injectable, inject } from 'tsyringe';

/**
 * @package
 * Implementation of state history tracking service.
 */
@injectable()
export class StateHistoryService implements IStateHistoryService {
  private operations: StateOperation[] = [];
  private transformations: StateTransformation[] = [];

  constructor(
    @inject('IStateEventService') private eventService: IStateEventService
  ) {
    // Subscribe to all state events
    this.setupEventSubscriptions();
  }

  private setupEventSubscriptions(): void {
    // Subscribe to create, clone, transform, and merge events
    this.eventService.on('create', this.handleStateEvent.bind(this));
    this.eventService.on('clone', this.handleStateEvent.bind(this));
    this.eventService.on('transform', this.handleStateEvent.bind(this));
    this.eventService.on('merge', this.handleStateEvent.bind(this));
  }

  private handleStateEvent(event: StateEvent): void {
    const operation: StateOperation = {
      type: event.type,
      stateId: event.stateId,
      source: event.source,
      timestamp: event.timestamp,
      // Add metadata if available in the event (needs StateEvent definition check)
      // metadata: event.metadata 
      // Add parentId if available in the event (needs StateEvent definition check)
      // parentId: event.parentId
    };

    this.recordOperation(operation);

    // Use type narrowing check
    if (event.type === 'transform') {
      // Explicitly assert the type within the block
      const transformEvent = event as StateTransformEvent;
      
      const transformation: StateTransformation = {
        stateId: transformEvent.stateId,
        timestamp: transformEvent.timestamp,
        operation: transformEvent.details.operation, // Access via asserted type
        source: transformEvent.source,
        before: transformEvent.details.before,       // Access via asserted type
        after: transformEvent.details.after,         // Access via asserted type
      };
      this.transformations.push(transformation);
    }
  }

  public recordOperation(operation: StateOperation): void {
    this.operations.push({ ...operation });
  }

  public getOperationHistory(stateId: string): StateOperation[] {
    return this.operations
      .filter(op => op.stateId === stateId)
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  public getTransformationChain(stateId: string): StateTransformation[] {
    return this.transformations
      .filter(t => t.stateId === stateId)
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  public queryHistory(filter: HistoryFilter): StateOperation[] {
    return this.operations
      .filter(op => {
        // Apply each filter criteria
        if (filter.stateIds && !filter.stateIds.includes(op.stateId)) {
          return false;
        }
        if (filter.types && !filter.types.includes(op.type)) {
          return false;
        }
        if (filter.source && op.source !== filter.source) {
          return false;
        }
        if (filter.timeRange) {
          if (filter.timeRange.start && op.timestamp < filter.timeRange.start) {
            return false;
          }
          if (filter.timeRange.end && op.timestamp > filter.timeRange.end) {
            return false;
          }
        }
        return true;
      })
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  public getRelatedOperations(operation: StateOperation, windowMs: number): StateOperation[] {
    const windowStart = operation.timestamp - windowMs;
    const windowEnd = operation.timestamp + windowMs;

    return this.operations
      .filter(op => 
        op.timestamp >= windowStart &&
        op.timestamp <= windowEnd &&
        op.stateId !== operation.stateId
      )
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  public clearHistoryBefore(beforeTimestamp: number): void {
    this.operations = this.operations.filter(op => op.timestamp >= beforeTimestamp);
    this.transformations = this.transformations.filter(t => t.timestamp >= beforeTimestamp);
  }

  public async getStateHistory(stateId: string): Promise<{
    operations: StateOperation[];
    transformations: StateTransformation[];
  } | undefined> {
    // Simulate async operation, or potentially check if stateId exists first
    // For now, just wrap the existing logic in a promise resolution.
    // In a real scenario, this might involve async lookups if history was stored elsewhere.
    
    // Basic check if any operations/transformations exist for the stateId
    const operations = this.getOperationHistory(stateId);
    const transformations = this.getTransformationChain(stateId);
    
    if (operations.length === 0 && transformations.length === 0) {
        // Check if the state itself was ever registered, even if no history?
        // This requires access to StateTrackingService, which isn't injected here.
        // For simplicity, let's return undefined if no history found.
        return undefined;
    }
    
    return {
      operations,
      transformations
    };
  }
} 