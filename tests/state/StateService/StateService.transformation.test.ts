import { describe, it, expect, beforeEach } from 'vitest';
import { StateService } from '@services/state/StateService/StateService.js';
import type { IStateService, TransformationOptions } from '@services/state/StateService/IStateService.js';
import type { MeldNode } from '@core/syntax/types/index.js';

let service: IStateService;

describe('StateService node transformation', () => {
  beforeEach(() => {
    service = new StateService();
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
    service.setTransformationEnabled(true);
    expect(service.getTransformedNodes()).toEqual([node]);
  });

  it('should add nodes to both arrays when transformation is enabled', () => {
    service.setTransformationEnabled(true);
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
    const original: MeldNode = { type: 'Text', content: 'original' };
    const transformed: MeldNode = { type: 'Text', content: 'transformed' };
    service.addNode(original);
    
    // Attempt transform (transformation is always on)
    service.transformNode(original, transformed);
    expect(service.getTransformedNodes()).toEqual([transformed]); // Should reflect transformation
    expect(service.getNodes()).toEqual([original]); // Original nodes remain unchanged
  });

  it('should throw when transforming non-existent node', () => {
    const nonExistent: MeldNode = { type: 'Text', content: 'ghost' }; // Added content
    const transformed: MeldNode = { type: 'Text', content: 'transformed' };
    // Expect transformNode to handle non-existent node gracefully or throw specific error
    expect(() => service.transformNode(nonExistent, transformed)).toThrow(/original node not found/);
  });

  it('should preserve transformation state when cloning', () => {
    const node: MeldNode = {
      type: 'Text',
      content: 'test',
      location: { start: { line: 1, column: 1 }, end: { line: 1, column: 4 } }
    };
    service.addNode(node);
    service.setTransformationEnabled(true);
    service.transformNode(0, { type: 'Text', content: 'transformed', location: node.location });

    const clone = service.clone();
    expect(clone.isTransformationEnabled()).toBe(true);
    expect(clone.getTransformedNodes()).toEqual([{ type: 'Text', content: 'transformed', location: node.location }]);
  });

  it('should handle immutability correctly with transformations', () => {
    const original: MeldNode = { type: 'Text', content: 'immutable test' }; // Added content
    service.addNode(original);
    service.makeImmutable();

    const transformed: MeldNode = { type: 'Text', content: 'transformed immutable' };
    // Expect transformNode on immutable state to throw or handle appropriately
    expect(() => service.transformNode(original, transformed)).toThrow(/Cannot modify immutable state/);
  });

  it('should support transformation options', () => {
    service.setTransformationOptions({
      enabled: true,
      preserveOriginal: true,
      transformNested: true
    });
    expect(service.isTransformationEnabled()).toBe(true);
    expect(service.getTransformationOptions()).toEqual({
      enabled: true,
      preserveOriginal: true,
      transformNested: true
    });
  });
}); 