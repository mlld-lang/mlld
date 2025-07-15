import { describe, it, expect, beforeEach } from 'vitest';
import { evaluateArrayItemEnhanced } from './var-enhanced';
import { Environment } from '@interpreter/env/Environment';
import { createSimpleTextVariable } from '@core/types/variable/VariableFactories';
import { isVariable } from '@interpreter/utils/variable-resolution';
import { IFileSystemService } from '@core/services/FileSystemService';
import { IPathService } from '@core/services/PathService';
import path from 'path';

describe('Enhanced Array Evaluation', () => {
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
  
  describe('evaluateArrayItemEnhanced', () => {
    it('should preserve Variables when evaluating VariableReference in arrays', async () => {
      // Create a test variable
      const testVar = createSimpleTextVariable('myVar', 'Hello', mockSource);
      env.setVariable('myVar', testVar);
      
      // Create a VariableReference node
      const varRefNode = {
        type: 'VariableReference',
        identifier: 'myVar'
      };
      
      // Evaluate it
      const result = await evaluateArrayItemEnhanced(varRefNode, env);
      
      // Should return the Variable itself, not the extracted value
      expect(isVariable(result)).toBe(true);
      expect(result).toBe(testVar); // Same reference
    });
    
    it('should handle primitive values normally', async () => {
      expect(await evaluateArrayItemEnhanced('string', env)).toBe('string');
      expect(await evaluateArrayItemEnhanced(123, env)).toBe(123);
      expect(await evaluateArrayItemEnhanced(true, env)).toBe(true);
      expect(await evaluateArrayItemEnhanced(null, env)).toBe(null);
    });
    
    it('should handle Text nodes by extracting content', async () => {
      const textNode = {
        type: 'Text',
        content: 'Hello World'
      };
      
      const result = await evaluateArrayItemEnhanced(textNode, env);
      expect(result).toBe('Hello World');
    });
    
    it('should preserve Variables in nested arrays', async () => {
      const testVar = createSimpleTextVariable('nested', 'Nested Value', mockSource);
      env.setVariable('nested', testVar);
      
      const nestedArrayNode = {
        type: 'array',
        items: [
          { type: 'Text', content: 'literal' },
          { type: 'VariableReference', identifier: 'nested' }
        ]
      };
      
      const result = await evaluateArrayItemEnhanced(nestedArrayNode, env);
      expect(Array.isArray(result)).toBe(true);
      expect(result[0]).toBe('literal');
      expect(isVariable(result[1])).toBe(true);
      expect(result[1]).toBe(testVar);
    });
    
    it('should preserve Variables in object properties', async () => {
      const testVar = createSimpleTextVariable('propVar', 'Property Value', mockSource);
      env.setVariable('propVar', testVar);
      
      const objectNode = {
        type: 'object',
        properties: {
          literal: { type: 'Text', content: 'plain text' },
          variable: { type: 'VariableReference', identifier: 'propVar' }
        }
      };
      
      const result = await evaluateArrayItemEnhanced(objectNode, env);
      expect(result.literal).toBe('plain text');
      expect(isVariable(result.variable)).toBe(true);
      expect(result.variable).toBe(testVar);
    });
  });
});