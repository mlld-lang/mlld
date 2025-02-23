import { IStateEventService, StateEvent } from '../StateEventService/IStateEventService';
import { IStateHistoryService, StateOperation, StateTransformation, HistoryFilter } from './IStateHistoryService';

/**
 * @package
 * Implementation of state history tracking service.
 */
export class StateHistoryService implements IStateHistoryService {
  private operations: StateOperation[] = [];
  private transformations: StateTransformation[] = [];

  constructor(private eventService: IStateEventService) {
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
    };

    this.recordOperation(operation);

    // If it's a transformation, record it separately
    if (event.type === 'transform' && 'details' in event) {
      const transformation: StateTransformation = {
        stateId: event.stateId,
        timestamp: event.timestamp,
        operation: event.details?.operation || 'unknown',
        source: event.source,
        before: event.details?.before,
        after: event.details?.after,
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

  public getStateHistory(stateId: string): { operations: StateOperation[]; transformations: StateTransformation[] } {
    return {
      operations: this.getOperationHistory(stateId),
      transformations: this.getTransformationChain(stateId)
    };
  }
} 