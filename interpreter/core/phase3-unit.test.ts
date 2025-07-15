import { describe, it, expect } from 'vitest';
import { createSimpleTextVariable, createArrayVariable } from '@core/types/variable/VariableFactories';
import { ResolutionContext, isVariable } from '@interpreter/utils/variable-resolution';

describe('Phase 3 Unit Tests - Variable Resolution', () => {
  const mockSource = {
    directive: 'var' as const,
    syntax: 'literal' as const,
    hasInterpolation: false,
    isMultiLine: false
  };
  
  describe('Variable Detection', () => {
    it('should correctly identify Variables', () => {
      const textVar = createSimpleTextVariable('test', 'value', mockSource);
      const arrayVar = createArrayVariable('arr', [1, 2, 3], mockSource);
      
      expect(isVariable(textVar)).toBe(true);
      expect(isVariable(arrayVar)).toBe(true);
      expect(isVariable('not a variable')).toBe(false);
      expect(isVariable(42)).toBe(false);
      expect(isVariable(null)).toBe(false);
      expect(isVariable(undefined)).toBe(false);
      expect(isVariable({})).toBe(false);
      expect(isVariable([])).toBe(false);
    });
    
    it('should handle Variables with metadata', () => {
      const varWithMeta = createSimpleTextVariable('meta', 'value', mockSource);
      varWithMeta.metadata = {
        customToString: () => 'custom',
        arrayType: 'RenamedContentArray'
      };
      
      expect(isVariable(varWithMeta)).toBe(true);
      expect(varWithMeta.metadata?.customToString).toBeDefined();
      expect(varWithMeta.metadata?.arrayType).toBe('RenamedContentArray');
    });
  });
  
  describe('Resolution Context Enum', () => {
    it('should have all expected contexts', () => {
      // Contexts where Variables should be preserved
      expect(ResolutionContext.VariableAssignment).toBe('variable-assignment');
      expect(ResolutionContext.ArrayElement).toBe('array-element');
      expect(ResolutionContext.ObjectProperty).toBe('object-property');
      expect(ResolutionContext.FunctionArgument).toBe('function-argument');
      expect(ResolutionContext.PipelineStage).toBe('pipeline-stage');
      
      // Contexts where values must be extracted
      expect(ResolutionContext.StringInterpolation).toBe('string-interpolation');
      expect(ResolutionContext.CommandExecution).toBe('command-execution');
      expect(ResolutionContext.FileOutput).toBe('file-output');
      expect(ResolutionContext.Conditional).toBe('conditional');
      expect(ResolutionContext.Display).toBe('display');
    });
  });
  
  describe('Variable Creation', () => {
    it('should create array Variables that can contain other Variables', () => {
      const elem1 = createSimpleTextVariable('elem1', 'first', mockSource);
      const elem2 = createSimpleTextVariable('elem2', 'second', mockSource);
      
      // Arrays can contain Variables
      const arrayVar = createArrayVariable('arr', [elem1, elem2, 'literal'], mockSource);
      
      expect(arrayVar.type).toBe('array');
      expect(Array.isArray(arrayVar.value)).toBe(true);
      
      const arrayValue = arrayVar.value as any[];
      expect(arrayValue).toHaveLength(3);
      
      // Variables should be stored as-is
      expect(isVariable(arrayValue[0])).toBe(true);
      expect(isVariable(arrayValue[1])).toBe(true);
      expect(arrayValue[2]).toBe('literal');
    });
    
    it('should support nested Variables in objects', () => {
      const textVar = createSimpleTextVariable('text', 'value', mockSource);
      const arrayVar = createArrayVariable('arr', [1, 2], mockSource);
      
      // Objects can contain Variables as property values
      const obj = {
        literal: 'plain text',
        variable: textVar,
        array: arrayVar,
        nested: {
          deep: textVar
        }
      };
      
      expect(isVariable(obj.variable)).toBe(true);
      expect(isVariable(obj.array)).toBe(true);
      expect(isVariable(obj.nested.deep)).toBe(true);
      expect(obj.literal).toBe('plain text');
    });
  });
});