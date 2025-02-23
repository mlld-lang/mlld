import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StateHistoryService } from './StateHistoryService';
import { IStateEventService, StateEvent } from '../StateEventService/IStateEventService';
import { StateOperation, StateTransformation } from './IStateHistoryService';

describe('StateHistoryService', () => {
  let mockEventService: IStateEventService;
  let historyService: StateHistoryService;
  let eventHandlers: Map<string, Function[]>;

  beforeEach(() => {
    eventHandlers = new Map();
    mockEventService = {
      on: vi.fn((type, handler) => {
        if (!eventHandlers.has(type)) {
          eventHandlers.set(type, []);
        }
        eventHandlers.get(type)!.push(handler);
      }),
      off: vi.fn(),
      emit: vi.fn(),
      getHandlers: vi.fn(),
    };

    historyService = new StateHistoryService(mockEventService);
  });

  describe('Event Subscription', () => {
    it('subscribes to all relevant state events', () => {
      expect(mockEventService.on).toHaveBeenCalledWith('create', expect.any(Function));
      expect(mockEventService.on).toHaveBeenCalledWith('clone', expect.any(Function));
      expect(mockEventService.on).toHaveBeenCalledWith('transform', expect.any(Function));
      expect(mockEventService.on).toHaveBeenCalledWith('merge', expect.any(Function));
    });
  });

  describe('Operation Recording', () => {
    it('records operations when events are received', () => {
      const event: StateEvent = {
        type: 'create',
        stateId: 'state1',
        source: 'test',
        timestamp: Date.now(),
      };

      // Simulate event emission
      eventHandlers.get('create')![0](event);

      const history = historyService.getOperationHistory('state1');
      expect(history).toHaveLength(1);
      expect(history[0]).toMatchObject({
        type: 'create',
        stateId: 'state1',
        source: 'test',
      });
    });

    it('records transformation details separately', () => {
      const event: StateEvent = {
        type: 'transform',
        stateId: 'state1',
        source: 'test',
        timestamp: Date.now(),
        details: {
          operation: 'update',
          before: { value: 1 },
          after: { value: 2 },
        },
      };

      // Simulate event emission
      eventHandlers.get('transform')![0](event);

      const transformations = historyService.getTransformationChain('state1');
      expect(transformations).toHaveLength(1);
      expect(transformations[0]).toMatchObject({
        stateId: 'state1',
        operation: 'update',
        before: { value: 1 },
        after: { value: 2 },
      });
    });
  });

  describe('History Querying', () => {
    beforeEach(() => {
      // Setup some test data
      const operations: StateOperation[] = [
        {
          type: 'create',
          stateId: 'state1',
          source: 'test',
          timestamp: 1000,
        },
        {
          type: 'transform',
          stateId: 'state1',
          source: 'test',
          timestamp: 2000,
        },
        {
          type: 'clone',
          stateId: 'state2',
          source: 'other',
          timestamp: 3000,
        },
      ];

      operations.forEach(op => historyService.recordOperation(op));
    });

    it('filters operations by state ID', () => {
      const history = historyService.queryHistory({ stateIds: ['state1'] });
      expect(history).toHaveLength(2);
      expect(history.every(op => op.stateId === 'state1')).toBe(true);
    });

    it('filters operations by type', () => {
      const history = historyService.queryHistory({ types: ['create'] });
      expect(history).toHaveLength(1);
      expect(history[0].type).toBe('create');
    });

    it('filters operations by source', () => {
      const history = historyService.queryHistory({ source: 'other' });
      expect(history).toHaveLength(1);
      expect(history[0].source).toBe('other');
    });

    it('filters operations by time range', () => {
      const history = historyService.queryHistory({
        timeRange: {
          start: 1500,
          end: 2500,
        },
      });
      expect(history).toHaveLength(1);
      expect(history[0].timestamp).toBe(2000);
    });
  });

  describe('Related Operations', () => {
    it('finds operations within time window', () => {
      const operations: StateOperation[] = [
        {
          type: 'create',
          stateId: 'state1',
          source: 'test',
          timestamp: 1000,
        },
        {
          type: 'create',
          stateId: 'state2',
          source: 'test',
          timestamp: 1100,
        },
        {
          type: 'create',
          stateId: 'state3',
          source: 'test',
          timestamp: 2000,
        },
      ];

      operations.forEach(op => historyService.recordOperation(op));

      const related = historyService.getRelatedOperations(operations[0], 200);
      expect(related).toHaveLength(1);
      expect(related[0].stateId).toBe('state2');
    });
  });

  describe('History Cleanup', () => {
    it('clears history before specified timestamp', () => {
      const operations: StateOperation[] = [
        {
          type: 'create',
          stateId: 'state1',
          source: 'test',
          timestamp: 1000,
        },
        {
          type: 'create',
          stateId: 'state2',
          source: 'test',
          timestamp: 2000,
        },
      ];

      operations.forEach(op => historyService.recordOperation(op));

      historyService.clearHistoryBefore(1500);
      const history = historyService.queryHistory({});
      expect(history).toHaveLength(1);
      expect(history[0].timestamp).toBe(2000);
    });
  });
}); 