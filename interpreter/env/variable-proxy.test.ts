import { describe, it, expect } from 'vitest';
import { createVariableProxy, VARIABLE_PROXY_PROPS, isVariableProxy, getVariableType, createMlldHelpers, prepareParamsForShadow } from './variable-proxy';
import { createSimpleTextVariable, createArrayVariable, createObjectVariable } from '@core/types/variable/VariableFactories';
import { makeSecurityDescriptor } from '@core/types/security';

describe('Variable Proxy System', () => {
  const mockSource = {
    directive: 'var' as const,
    syntax: 'literal' as const,
    hasInterpolation: false,
    isMultiLine: false
  };
  
  describe('createVariableProxy', () => {
    it('should return primitives unchanged', () => {
      const stringVar = createSimpleTextVariable('test', 'hello', mockSource);
      const proxy = createVariableProxy(stringVar);
      
      // Primitives can't be proxied
      expect(proxy).toBe('hello');
      expect(typeof proxy).toBe('string');
    });
    
    it('should create proxy for array Variables', () => {
      const arrayVar = createArrayVariable('arr', [1, 2, 3], false, mockSource);
      const proxy = createVariableProxy(arrayVar);
      
      // Normal array access works
      expect(Array.isArray(proxy)).toBe(true);
      expect(proxy[0]).toBe(1);
      expect(proxy.length).toBe(3);
      
      // Special properties work
      expect(proxy[VARIABLE_PROXY_PROPS.TYPE]).toBe('array');
      expect(proxy[VARIABLE_PROXY_PROPS.SUBTYPE]).toBeUndefined(); // Arrays don't have subtype
      expect(proxy[VARIABLE_PROXY_PROPS.IS_VARIABLE]).toBe(true);
    });
    
    it('should create proxy for object Variables', () => {
      const objVar = createObjectVariable('obj', { name: 'Alice', age: 30 }, false, mockSource);
      const proxy = createVariableProxy(objVar);
      
      // Normal object access works
      expect(proxy.name).toBe('Alice');
      expect(proxy.age).toBe(30);
      
      // Special properties work
      expect(proxy[VARIABLE_PROXY_PROPS.TYPE]).toBe('object');
      const metadata = proxy[VARIABLE_PROXY_PROPS.METADATA];
      expect(metadata?.ctx).toEqual(
        expect.objectContaining({
          name: 'obj',
          type: 'object'
        })
      );
      expect(metadata?.internal).toEqual({});
    });
    
    it('should preserve custom toString behavior', () => {
      const arrayVar = createArrayVariable('arr', ['a', 'b', 'c'], false, mockSource, {
        customToString: () => 'a|b|c'
      });
      const proxy = createVariableProxy(arrayVar);
      
      // Custom toString should be used
      expect(proxy.toString()).toBe('a|b|c');
    });
    
    it('should not enumerate special properties', () => {
      const objVar = createObjectVariable('obj', { x: 1, y: 2 }, false, mockSource);
      const proxy = createVariableProxy(objVar);
      
      // Object.keys should not include special properties
      expect(Object.keys(proxy)).toEqual(['x', 'y']);
      
      // JSON.stringify should not include special properties
      expect(JSON.stringify(proxy)).toBe('{"x":1,"y":2}');
      
      // for...in should not include special properties
      const keys: string[] = [];
      for (const key in proxy) {
        keys.push(key);
      }
      expect(keys).toEqual(['x', 'y']);
    });
  });
  
  describe('isVariableProxy', () => {
    it('should identify proxied Variables', () => {
      const arrayVar = createArrayVariable('arr', [1, 2, 3], false, mockSource);
      const proxy = createVariableProxy(arrayVar);
      
      expect(isVariableProxy(proxy)).toBe(true);
    });
    
    it('should return false for non-proxied values', () => {
      expect(isVariableProxy('string')).toBe(false);
      expect(isVariableProxy(123)).toBe(false);
      expect(isVariableProxy(null)).toBe(false);
      expect(isVariableProxy([1, 2, 3])).toBe(false);
      expect(isVariableProxy({ x: 1 })).toBe(false);
    });
  });
  
  describe('getVariableType', () => {
    it('should return type from proxy', () => {
      const arrayVar = createArrayVariable('arr', [1, 2, 3], false, mockSource);
      const proxy = createVariableProxy(arrayVar);
      
      expect(getVariableType(proxy)).toBe('array');
    });
    
    it('should return undefined for non-proxy values', () => {
      expect(getVariableType('string')).toBeUndefined();
      expect(getVariableType([1, 2, 3])).toBeUndefined();
    });
  });
  
  describe('mlld helpers', () => {
    it('should provide useful helper functions', () => {
      const helpers = createMlldHelpers();
      
      const arrayVar = createArrayVariable('arr', [1, 2, 3], false, mockSource, {
        arrayType: 'load-content'
      });
      const proxy = createVariableProxy(arrayVar);
      
      // Helper functions work
      expect(helpers.isVariable(proxy)).toBe(true);
      expect(helpers.getType(proxy)).toBe('array');
      const helperMetadata = helpers.getMetadata(proxy);
      expect(helperMetadata?.internal).toMatchObject({ arrayType: 'load-content' });
      
      // Direct property access works
      expect(proxy[helpers.TYPE]).toBe('array');
      const proxyMetadata = proxy[helpers.METADATA];
      expect(proxyMetadata?.internal).toMatchObject({ arrayType: 'load-content' });
    });

    it('exposes ctx metadata for primitive parameters', () => {
      const variable = createSimpleTextVariable(
        'secret',
        'value',
        mockSource,
        { security: makeSecurityDescriptor({ labels: ['secret'] }) }
      );

      const prepared = prepareParamsForShadow({ secret: variable });
      const metadata = (prepared as any).__mlldPrimitiveMetadata;
      delete (prepared as any).__mlldPrimitiveMetadata;

      const helpers = createMlldHelpers(metadata);
      const ctx = helpers.ctx(prepared.secret, 'secret');
      expect(ctx?.labels).toContain('secret');
    });
  });
});
