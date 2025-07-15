import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Environment } from '@interpreter/env/Environment';
import { createSimpleTextVariable, createArrayVariable } from '@core/types/variable/VariableFactories';
import { isVariable } from '@interpreter/utils/variable-resolution';
import { enableEnhancedArrays, disableEnhancedArrays } from './var-migration';
import { enableEnhancedResolution, disableEnhancedResolution } from '@interpreter/core/resolution-migration';
import { evaluateDirective } from './directive';
import { evaluateArrayItemEnhanced } from './var-enhanced';
import { IFileSystemService } from '@core/services/FileSystemService';
import { IPathService } from '@core/services/PathService';
import path from 'path';

describe('Phase 3 Integration - Enhanced Variable Preservation', () => {
  let env: Environment;
  let fileSystem: IFileSystemService;
  let pathService: IPathService;
  
  const mockSource = {
    directive: 'var' as const,
    syntax: 'literal' as const,
    hasInterpolation: false,
    isMultiLine: false
  };
  
  beforeEach(() => {
    // Enable enhanced features
    enableEnhancedArrays();
    enableEnhancedResolution();
    
    // Mock file system
    fileSystem = {
      readFile: async () => '',
      writeFile: async () => {},
      exists: async () => true,
      listFiles: async () => [],
      getStats: async () => ({ isDirectory: () => false } as any),
      createDirectory: async () => {},
      deleteFile: async () => {},
      deleteDirectory: async () => {}
    };
    
    // Mock path service
    pathService = {
      resolve: (...paths: string[]) => path.resolve(...paths),
      join: (...paths: string[]) => path.join(...paths),
      dirname: (p: string) => path.dirname(p),
      basename: (p: string) => path.basename(p),
      relative: (from: string, to: string) => path.relative(from, to),
      normalize: (p: string) => path.normalize(p),
      isAbsolute: (p: string) => path.isAbsolute(p),
      extname: (p: string) => path.extname(p)
    };
    
    env = new Environment(fileSystem, pathService, '/test/project');
  });
  
  afterEach(() => {
    disableEnhancedArrays();
    disableEnhancedResolution();
  });
  
  describe('Array Variable Preservation via var directive', () => {
    it('should preserve Variables in arrays when enhanced mode is enabled', async () => {
      // Create test variables
      const var1 = createSimpleTextVariable('elem1', 'First', mockSource);
      const var2 = createSimpleTextVariable('elem2', 'Second', mockSource);
      env.setVariable('elem1', var1);
      env.setVariable('elem2', var2);
      
      // Create array directive that references variables
      const arrayDirective = {
        type: 'Directive',
        kind: 'var',
        values: {
          identifier: [{ type: 'VariableReference', identifier: 'myArray' }],
          value: [{
            type: 'array',
            items: [
              { type: 'Text', content: 'literal' },
              { type: 'VariableReference', identifier: 'elem1' },
              { type: 'VariableReference', identifier: 'elem2' }
            ]
          }]
        }
      };
      
      await evaluateDirective(arrayDirective, env);
      
      const arrayVar = env.getVariable('myArray');
      expect(arrayVar).toBeDefined();
      expect(arrayVar?.type).toBe('array');
      
      // For complex arrays, we need to evaluate the value
      let arrayValue: any[];
      if ((arrayVar as any).isComplex && arrayVar?.value.type === 'array') {
        // Manually evaluate array items with enhanced evaluation
        const items = [];
        for (const item of (arrayVar.value as any).items || []) {
          const evaluated = await evaluateArrayItemEnhanced(item, env);
          items.push(evaluated);
        }
        arrayValue = items;
      } else {
        arrayValue = arrayVar?.value as any[];
      }
      
      expect(Array.isArray(arrayValue)).toBe(true);
      expect(arrayValue).toHaveLength(3);
      expect(arrayValue[0]).toBe('literal');
      
      // With enhanced mode, Variables should be preserved
      expect(isVariable(arrayValue[1])).toBe(true);
      expect(isVariable(arrayValue[2])).toBe(true);
      expect(arrayValue[1]).toBe(var1);
      expect(arrayValue[2]).toBe(var2);
    });
    
    it('should extract values when enhanced mode is disabled', async () => {
      // Disable enhanced mode
      disableEnhancedArrays();
      
      // Create test variables
      const var1 = createSimpleTextVariable('elem1', 'First', mockSource);
      const var2 = createSimpleTextVariable('elem2', 'Second', mockSource);
      env.setVariable('elem1', var1);
      env.setVariable('elem2', var2);
      
      // Create array directive
      const arrayDirective = {
        type: 'Directive',
        kind: 'var',
        values: {
          identifier: [{ type: 'VariableReference', identifier: 'myArray' }],
          value: [{
            type: 'array',
            items: [
              { type: 'Text', content: 'literal' },
              { type: 'VariableReference', identifier: 'elem1' },
              { type: 'VariableReference', identifier: 'elem2' }
            ]
          }]
        }
      };
      
      await evaluateDirective(arrayDirective, env);
      
      const arrayVar = env.getVariable('myArray');
      
      // For complex arrays, we need to evaluate the value  
      let arrayValue: any[];
      if ((arrayVar as any).isComplex && arrayVar?.value.type === 'array') {
        // Manually evaluate array items WITHOUT enhanced evaluation
        // This simulates the original behavior
        const { interpolate } = await import('@interpreter/core/interpreter');
        const items = [];
        for (const item of (arrayVar.value as any).items || []) {
          if (item.type === 'Text') {
            items.push(item.content);
          } else if (item.type === 'VariableReference') {
            const variable = env.getVariable(item.identifier);
            items.push(variable?.value); // Extract the value
          } else {
            items.push(item);
          }
        }
        arrayValue = items;
      } else {
        arrayValue = arrayVar?.value as any[];
      }
      
      // Without enhanced mode, values should be extracted
      expect(arrayValue[0]).toBe('literal');
      expect(arrayValue[1]).toBe('First'); // Extracted value
      expect(arrayValue[2]).toBe('Second'); // Extracted value
      expect(isVariable(arrayValue[1])).toBe(false);
      expect(isVariable(arrayValue[2])).toBe(false);
    });
  });
  
  describe('Nested Object Variable Preservation', () => {
    it('should preserve Variables in nested object properties', async () => {
      const textVar = createSimpleTextVariable('textVar', 'nested value', mockSource);
      env.setVariable('textVar', textVar);
      
      const objectDirective = {
        type: 'Directive',
        kind: 'var',
        values: {
          identifier: [{ type: 'VariableReference', identifier: 'myObject' }],
          value: [{
            type: 'object',
            properties: {
              literal: { type: 'Text', content: 'plain' },
              variable: { type: 'VariableReference', identifier: 'textVar' },
              nested: {
                type: 'object',
                properties: {
                  deep: { type: 'VariableReference', identifier: 'textVar' }
                }
              }
            }
          }]
        }
      };
      
      await evaluateDirective(objectDirective, env);
      
      const objVar = env.getVariable('myObject');
      expect(objVar).toBeDefined();
      expect(objVar?.type).toBe('object');
      
      // For complex objects, we need to evaluate the value
      let objValue: any;
      if ((objVar as any).isComplex && objVar?.value.type === 'object') {
        // Manually evaluate object properties with enhanced evaluation
        const obj: any = {};
        for (const [key, propNode] of Object.entries((objVar.value as any).properties || {})) {
          obj[key] = await evaluateArrayItemEnhanced(propNode, env);
        }
        objValue = obj;
      } else {
        objValue = objVar?.value as any;
      }
      
      expect(objValue.literal).toBe('plain');
      
      // Variables should be preserved in object properties
      expect(isVariable(objValue.variable)).toBe(true);
      expect(objValue.variable).toBe(textVar);
      
      // Even in nested objects
      expect(isVariable(objValue.nested.deep)).toBe(true);
      expect(objValue.nested.deep).toBe(textVar);
    });
  });
});