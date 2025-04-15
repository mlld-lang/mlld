import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StateEventService } from '@services/state/StateEventService/StateEventService.js';
import type { StateEvent, StateEventHandler, IStateEventService } from '@services/state/StateEventService/IStateEventService.js';
import { TestContextDI } from '@tests/utils/di/TestContextDI.js';

describe('StateEventService', () => {
  // Remove describe.each for DI modes, as we standardise on DI
  const helpers = TestContextDI.createTestHelpers();
  let context: TestContextDI;
  let service: IStateEventService;

  beforeEach(async () => {
    // Use the helper - assuming StateEventService is registered globally or 
    // setupWithStandardMocks doesn't mock it, allowing resolution of the real one.
    context = helpers.setupWithStandardMocks(); 
    // Await initialization implicitly
    await context.resolve('IFileSystemService');
    
    // Resolve the service (expecting the real implementation)
    service = await context.resolve('IStateEventService');
    
    // Verify we got a real service instance
    expect(service).toBeInstanceOf(StateEventService);
  });

  afterEach(async () => {
    await context?.cleanup();
  });

  it('should register and emit events', async () => {
    const handler = vi.fn();
    const event: StateEvent = {
      type: 'create',
      stateId: 'test-state',
      source: 'test',
      timestamp: Date.now()
    };

    service.on('create', handler);
    await service.emit(event);

    expect(handler).toHaveBeenCalledWith(event);
  });

  it('should support multiple handlers for same event type', async () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();
    const event: StateEvent = {
      type: 'transform',
      stateId: 'test-state',
      source: 'test',
      timestamp: Date.now()
    };

    service.on('transform', handler1);
    service.on('transform', handler2);
    await service.emit(event);

    expect(handler1).toHaveBeenCalledWith(event);
    expect(handler2).toHaveBeenCalledWith(event);
  });

  it('should remove handlers correctly', async () => {
    const handler = vi.fn();
    const event: StateEvent = {
      type: 'clone',
      stateId: 'test-state',
      source: 'test',
      timestamp: Date.now()
    };

    service.on('clone', handler);
    service.off('clone', handler);
    await service.emit(event);

    expect(handler).not.toHaveBeenCalled();
  });

  it('should apply filters correctly', async () => {
    const handler = vi.fn();
    const event: StateEvent = {
      type: 'transform',
      stateId: 'test-state',
      source: 'test',
      timestamp: Date.now()
    };

    // Only handle events with stateId starting with 'test'
    service.on('transform', handler, {
      filter: (e) => e.stateId.startsWith('test')
    });

    await service.emit(event); // Should be handled
    expect(handler).toHaveBeenCalledWith(event);

    await service.emit({
      ...event,
      stateId: 'other-state'
    }); // Should be filtered out
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('should handle async handlers', async () => {
    const result: string[] = [];
    const asyncHandler1: StateEventHandler = async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      result.push('handler1');
    };
    const asyncHandler2: StateEventHandler = async () => {
      await new Promise(resolve => setTimeout(resolve, 5));
      result.push('handler2');
    };

    service.on('merge', asyncHandler1);
    service.on('merge', asyncHandler2);

    await service.emit({
      type: 'merge',
      stateId: 'test-state',
      source: 'test',
      timestamp: Date.now()
    });

    // Note: Async handlers run concurrently, order isn't guaranteed unless emit awaits all
    // Assuming emit awaits all handlers before resolving based on original test passing
    expect(result).toContain('handler1');
    expect(result).toContain('handler2');
    expect(result).toHaveLength(2);
  });

  it('should continue processing handlers after error', async () => {
    const errorHandler = vi.fn().mockRejectedValue(new Error('test error'));
    const successHandler = vi.fn();
    const event: StateEvent = {
      type: 'error',
      stateId: 'test-state',
      source: 'test',
      timestamp: Date.now()
    };

    service.on('error', errorHandler);
    service.on('error', successHandler);

    // Assuming emit handles errors internally and continues
    await service.emit(event);

    expect(errorHandler).toHaveBeenCalled();
    expect(successHandler).toHaveBeenCalled();
  });

  it('should throw on invalid event type registration', () => {
    const handler = vi.fn();
    // @ts-expect-error Testing invalid event type
    expect(() => service.on('invalid' as any, handler)).toThrow(/Invalid event type/);
  });

  it('should return registered handlers', () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();
    const options = { filter: (e: StateEvent) => e.stateId === 'test' };

    service.on('create', handler1);
    service.on('create', handler2, options);

    const handlers = service.getHandlers('create');
    expect(handlers).toHaveLength(2);
    expect(handlers[0].handler).toBe(handler1);
    expect(handlers[1].handler).toBe(handler2);
    expect(handlers[1].options).toBe(options);
  });
}); 