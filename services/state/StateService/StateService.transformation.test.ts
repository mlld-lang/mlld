import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { StateService } from '@services/state/StateService/StateService.js';
import { StateFactory } from '@services/state/StateService/StateFactory.js';
import { StateTrackingService } from '@tests/utils/debug/StateTrackingService/StateTrackingService.js';
import { container } from 'tsyringe';
import { TestContextDI } from '@tests/utils/di/TestContextDI.js';
import type { MeldNode } from '@core/syntax/types.js';

describe('StateService node transformation', () => {
  let service: StateService;
  let testContext: TestContextDI;

  beforeEach(() => {
    testContext = TestContextDI.create({ isolatedContainer: true });
    
    // Register necessary services
    const stateFactory = new StateFactory();
    container.registerInstance(StateFactory, stateFactory);
    
    const trackingService = new StateTrackingService();
    container.registerInstance('IStateTrackingService', trackingService);
    container.registerInstance('StateTrackingService', trackingService);
    
    // Resolve the service from the container
    service = container.resolve(StateService);
  });

  afterEach(() => {
    testContext.cleanup();
  });

  it('should have transformation disabled by default', () => {
    expect(service.isTransformationEnabled()).toBe(false);
  });

  it('should return original nodes when transformation is disabled', () => {
    const node: MeldNode = {
      type: 'Text',
      content: 'test',
      location: { start: { line: 1, column: 1 }, end: { line: 1, column: 4 } }
    };
    service.addNode(node);
    expect(service.getTransformedNodes()).toEqual([node]);
  });

  it('should initialize transformed nodes when enabling transformation', () => {
    const node: MeldNode = {
      type: 'Text',
      content: 'test',
      location: { start: { line: 1, column: 1 }, end: { line: 1, column: 4 } }
    };
    service.addNode(node);
    service.enableTransformation(true);
    expect(service.getTransformedNodes()).toEqual([node]);
  });

  it('should add nodes to both arrays when transformation is enabled', () => {
    service.enableTransformation(true);
    const node: MeldNode = {
      type: 'Text',
      content: 'test',
      location: { start: { line: 1, column: 1 }, end: { line: 1, column: 4 } }
    };
    service.addNode(node);
    expect(service.getNodes()).toEqual([node]);
    expect(service.getTransformedNodes()).toEqual([node]);
  });

  it('should transform nodes only when enabled', () => {
    const original: MeldNode = {
      type: 'Text',
      content: 'original',
      location: { start: { line: 1, column: 1 }, end: { line: 1, column: 8 } }
    };
    const transformed: MeldNode = {
      type: 'Text',
      content: 'transformed',
      location: { start: { line: 1, column: 1 }, end: { line: 1, column: 11 } }
    };

    service.addNode(original);
    service.transformNode(original, transformed); // Should be ignored
    expect(service.getTransformedNodes()).toEqual([original]);

    service.enableTransformation(true);
    service.transformNode(original, transformed);
    expect(service.getNodes()).toEqual([original]); // Original unchanged
    expect(service.getTransformedNodes()).toEqual([transformed]); // Transformed updated
  });

  it('should throw when transforming non-existent node', () => {
    service.enableTransformation(true);
    const nonExistent: MeldNode = {
      type: 'Text',
      content: 'missing',
      location: { start: { line: 1, column: 1 }, end: { line: 1, column: 7 } }
    };
    const transformed: MeldNode = {
      type: 'Text',
      content: 'transformed',
      location: { start: { line: 1, column: 1 }, end: { line: 1, column: 11 } }
    };
    expect(() => service.transformNode(nonExistent, transformed))
      .toThrow('Cannot transform node: original node not found');
  });

  it('should preserve transformation state when cloning', () => {
    service.enableTransformation(true);
    const node: MeldNode = {
      type: 'Text',
      content: 'test',
      location: { start: { line: 1, column: 1 }, end: { line: 1, column: 4 } }
    };
    service.addNode(node);
    
    const cloned = service.clone();
    expect(cloned.isTransformationEnabled()).toBe(true);
    expect(cloned.getTransformedNodes()).toEqual([node]);
  });

  it('should handle immutability correctly with transformations', () => {
    service.enableTransformation(true);
    const original: MeldNode = {
      type: 'Text',
      content: 'original',
      location: { start: { line: 1, column: 1 }, end: { line: 1, column: 8 } }
    };
    service.addNode(original);
    service.setImmutable();

    const transformed: MeldNode = {
      type: 'Text',
      content: 'transformed',
      location: { start: { line: 1, column: 1 }, end: { line: 1, column: 11 } }
    };
    expect(() => service.transformNode(original, transformed))
      .toThrow('Cannot modify immutable state');
  });
}); 