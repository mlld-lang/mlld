import { describe, it, expect, vi } from 'vitest';
import { 
  ResolutionContext, 
  shouldPreserveVariable, 
  resolveVariable,
  isVariable,
  extractValue
} from './variable-resolution';
import { createSimpleTextVariable, createArrayVariable, createObjectVariable } from '@core/types/variable/VariableFactories';
import { Environment } from '@interpreter/env/Environment';

// Mock the module imports
vi.mock('@interpreter/eval/data-values', () => ({
  evaluateDataValue: vi.fn(async (value) => value)
}));

describe('Variable Resolution Strategy', () => {
  const mockEnv = {} as Environment;
  const mockSource = {
    directive: 'var' as const,
    syntax: 'literal' as const,
    hasInterpolation: false,
    isMultiLine: false
  };
  
  describe('shouldPreserveVariable', () => {
    it('should preserve Variables in assignment contexts', () => {
      expect(shouldPreserveVariable(ResolutionContext.VariableAssignment)).toBe(true);
      expect(shouldPreserveVariable(ResolutionContext.ArrayElement)).toBe(true);
      expect(shouldPreserveVariable(ResolutionContext.ObjectProperty)).toBe(true);
      expect(shouldPreserveVariable(ResolutionContext.FunctionArgument)).toBe(true);
      expect(shouldPreserveVariable(ResolutionContext.PipelineStage)).toBe(true);
    });
    
    it('should extract values in output contexts', () => {
      expect(shouldPreserveVariable(ResolutionContext.StringInterpolation)).toBe(false);
      expect(shouldPreserveVariable(ResolutionContext.CommandExecution)).toBe(false);
      expect(shouldPreserveVariable(ResolutionContext.FileOutput)).toBe(false);
      expect(shouldPreserveVariable(ResolutionContext.Conditional)).toBe(false);
      expect(shouldPreserveVariable(ResolutionContext.Display)).toBe(false);
    });
  });
  
  describe('resolveVariable', () => {
    it('should preserve Variable in assignment context', async () => {
      const textVar = createSimpleTextVariable('test', 'Hello World', mockSource);
      const result = await resolveVariable(textVar, mockEnv, ResolutionContext.VariableAssignment);
      
      expect(isVariable(result)).toBe(true);
      expect(result).toBe(textVar); // Same reference
    });
    
    it('should extract value in display context', async () => {
      const textVar = createSimpleTextVariable('test', 'Hello World', mockSource);
      const result = await resolveVariable(textVar, mockEnv, ResolutionContext.Display);
      
      expect(isVariable(result)).toBe(false);
      expect(result).toBe('Hello World');
    });
    
    it('should preserve array Variable in array element context', async () => {
      const arrayVar = createArrayVariable('items', ['a', 'b', 'c'], false, mockSource);
      const result = await resolveVariable(arrayVar, mockEnv, ResolutionContext.ArrayElement);
      
      expect(isVariable(result)).toBe(true);
      expect(result).toBe(arrayVar);
    });
    
    it('should handle complex Variables by evaluating but preserving wrapper', async () => {
      const complexVar = createObjectVariable('complex', { nested: 'value' }, true, mockSource);
      const result = await resolveVariable(complexVar, mockEnv, ResolutionContext.ObjectProperty);
      
      expect(isVariable(result)).toBe(true);
      if (isVariable(result)) {
        expect(result.metadata?.wasEvaluated).toBe(true);
        expect(result.metadata?.evaluatedAt).toBeDefined();
      }
    });
  });
  
  describe('isVariable', () => {
    it('should identify Variables correctly', () => {
      const variable = createSimpleTextVariable('test', 'value', mockSource);
      expect(isVariable(variable)).toBe(true);
      
      expect(isVariable('string')).toBe(false);
      expect(isVariable(123)).toBe(false);
      expect(isVariable(null)).toBe(false);
      expect(isVariable(undefined)).toBe(false);
      expect(isVariable({ value: 'test' })).toBe(false); // Missing required fields
    });
  });
  
  describe('extractValue', () => {
    it('should extract value from Variable', async () => {
      const variable = createSimpleTextVariable('test', 'Hello', mockSource);
      const result = await extractValue(variable, mockEnv);
      expect(result).toBe('Hello');
    });
    
    it('should return non-Variable values as-is', async () => {
      expect(await extractValue('string', mockEnv)).toBe('string');
      expect(await extractValue(123, mockEnv)).toBe(123);
      expect(await extractValue({ obj: true }, mockEnv)).toEqual({ obj: true });
    });
  });
});