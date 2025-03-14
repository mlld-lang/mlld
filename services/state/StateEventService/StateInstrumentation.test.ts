import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StateEventService } from '@services/state/StateEventService/StateEventService.js';
import type { StateEvent, StateEventType } from '@services/state/StateEventService/IStateEventService.js';

describe('State Instrumentation', () => {
  describe('Event Ordering', () => {
    it('should maintain event order during state lifecycle', async () => {
      const events: StateEvent[] = [];
      const service = new StateEventService();
      
      // Record all events in order
      service.on('create', e => events.push(e));
      service.on('transform', e => events.push(e));
      service.on('clone', e => events.push(e));
      service.on('merge', e => events.push(e));

      // Simulate a typical state lifecycle
      await service.emit({
        type: 'create',
        stateId: 'parent',
        source: 'test',
        timestamp: 1
      });

      await service.emit({
        type: 'transform',
        stateId: 'parent',
        source: 'test',
        timestamp: 2
      });

      await service.emit({
        type: 'clone',
        stateId: 'child',
        source: 'test',
        timestamp: 3
      });

      await service.emit({
        type: 'merge',
        stateId: 'parent',
        source: 'test',
        timestamp: 4
      });

      // Verify event order
      expect(events.map(e => e.type)).toEqual(['create', 'transform', 'clone', 'merge']);
      expect(events.map(e => e.timestamp)).toEqual([1, 2, 3, 4]);
    });
  });

  describe('Event Filtering', () => {
    it('should support complex filtering patterns', async () => {
      const service = new StateEventService();
      const results: string[] = [];

      // Filter for specific state transitions
      service.on('transform', e => {
        results.push(`transform:${e.stateId}`);
      }, {
        filter: e => e.stateId.startsWith('test-')
      });

      // Filter for specific sources
      service.on('transform', e => {
        results.push(`source:${e.source}`);
      }, {
        filter: e => e.source === 'variable-update'
      });

      // Filter based on location
      service.on('transform', e => {
        results.push(`file:${e.location?.file}`);
      }, {
        filter: e => e.location?.file === 'test.meld'
      });

      // Emit test events
      await service.emit({
        type: 'transform',
        stateId: 'test-1',
        source: 'variable-update',
        timestamp: Date.now(),
        location: { file: 'test.meld' }
      });

      await service.emit({
        type: 'transform',
        stateId: 'other',
        source: 'variable-update',
        timestamp: Date.now(),
        location: { file: 'other.meld' }
      });

      expect(results).toEqual([
        'transform:test-1',
        'source:variable-update',
        'file:test.meld'
      ]);
    });
  });

  describe('Error Handling', () => {
    it('should handle errors in event handlers without affecting others', async () => {
      const service = new StateEventService();
      const results: string[] = [];

      // Add a handler that will error
      service.on('error', () => {
        throw new Error('Handler error');
      });

      // Add handlers that should still execute
      service.on('error', () => {
        results.push('handler1');
      });
      service.on('error', () => {
        results.push('handler2');
      });

      await service.emit({
        type: 'error',
        stateId: 'test',
        source: 'test',
        timestamp: Date.now()
      });

      expect(results).toEqual(['handler1', 'handler2']);
    });
  });

  describe('Event Context', () => {
    it('should maintain complete event context through handlers', async () => {
      const service = new StateEventService();
      let capturedEvent: StateEvent | undefined;

      service.on('transform', event => {
        capturedEvent = event;
      });

      const testEvent: StateEvent = {
        type: 'transform',
        stateId: 'test',
        source: 'variable-update',
        timestamp: Date.now(),
        location: {
          file: 'test.meld',
          line: 42,
          column: 10
        }
      };

      await service.emit(testEvent);

      expect(capturedEvent).toEqual(testEvent);
      expect(capturedEvent?.location).toEqual(testEvent.location);
    });
  });

  describe('Event Type Safety', () => {
    it('should enforce valid event types', () => {
      const service = new StateEventService();
      const handler = vi.fn();

      // These should all be type-safe and not throw
      const validTypes: StateEventType[] = ['create', 'clone', 'transform', 'merge', 'error'];
      validTypes.forEach(type => {
        expect(() => service.on(type, handler)).not.toThrow();
      });

      // @ts-expect-error Testing invalid event type
      expect(() => service.on('invalid' as StateEventType, handler))
        .toThrow('Invalid event type');
    });
  });

  describe('Handler Management', () => {
    it('should properly manage handler lifecycle', () => {
      const service = new StateEventService();
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      // Add handlers
      service.on('create', handler1);
      service.on('create', handler2);

      // Verify both are registered
      expect(service.getHandlers('create')).toHaveLength(2);

      // Remove one handler
      service.off('create', handler1);

      // Verify only one remains
      const remainingHandlers = service.getHandlers('create');
      expect(remainingHandlers).toHaveLength(1);
      expect(remainingHandlers[0].handler).toBe(handler2);
    });
  });

  describe('Async Handler Execution', () => {
    it('should handle mixed sync/async handlers correctly', async () => {
      const service = new StateEventService();
      const results: string[] = [];

      // Add mix of sync and async handlers
      service.on('transform', () => {
        results.push('sync1');
      });

      service.on('transform', async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        results.push('async1');
      });

      service.on('transform', () => {
        results.push('sync2');
      });

      service.on('transform', async () => {
        await new Promise(resolve => setTimeout(resolve, 5));
        results.push('async2');
      });

      await service.emit({
        type: 'transform',
        stateId: 'test',
        source: 'test',
        timestamp: Date.now()
      });

      // Verify handlers executed in order
      expect(results).toEqual(['sync1', 'async1', 'sync2', 'async2']);
    });
  });
}); 