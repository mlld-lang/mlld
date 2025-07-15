import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Environment } from '@interpreter/env/Environment';
import { createSimpleTextVariable, createArrayVariable } from '@core/types/variable/VariableFactories';
import { isVariable } from '@interpreter/utils/variable-resolution';
import { enableEnhancedInterpolation, disableEnhancedInterpolation, interpolateEnhanced } from './interpolate-migration';
import { enableEnhancedArrays, disableEnhancedArrays } from '@interpreter/eval/var-migration';
import { IFileSystemService } from '@core/services/FileSystemService';
import { IPathService } from '@core/services/PathService';
import path from 'path';

describe('Phase 3 - Enhanced Interpolation', () => {
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
    enableEnhancedInterpolation();
    enableEnhancedArrays();
    
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
    disableEnhancedInterpolation();
    disableEnhancedArrays();
  });
  
  describe('Context-aware interpolation', () => {
    it('should preserve Variables when building arrays', async () => {
      const var1 = createSimpleTextVariable('elem1', 'First', mockSource);
      const var2 = createSimpleTextVariable('elem2', 'Second', mockSource);
      env.setVariable('elem1', var1);
      env.setVariable('elem2', var2);
      
      // Simulate array building context
      const nodes = [
        { type: 'VariableReference', identifier: 'elem1' },
        { type: 'Text', content: ', ' },
        { type: 'VariableReference', identifier: 'elem2' }
      ];
      
      const result = await interpolateEnhanced(nodes, env, 'array');
      
      // In array context, should return array with Variables preserved
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(3);
      expect(isVariable(result[0])).toBe(true);
      expect(result[0]).toBe(var1);
      expect(result[1]).toBe(', ');
      expect(isVariable(result[2])).toBe(true);
      expect(result[2]).toBe(var2);
    });
    
    it('should extract values for string context', async () => {
      const var1 = createSimpleTextVariable('name', 'Alice', mockSource);
      env.setVariable('name', var1);
      
      const nodes = [
        { type: 'Text', content: 'Hello ' },
        { type: 'VariableReference', identifier: 'name' },
        { type: 'Text', content: '!' }
      ];
      
      const result = await interpolateEnhanced(nodes, env, 'string');
      
      // In string context, should return concatenated string
      expect(typeof result).toBe('string');
      expect(result).toBe('Hello Alice!');
    });
    
    it('should preserve Variables in object context', async () => {
      const textVar = createSimpleTextVariable('value', 'test', mockSource);
      env.setVariable('value', textVar);
      
      const nodes = [
        { type: 'VariableReference', identifier: 'value' }
      ];
      
      const result = await interpolateEnhanced(nodes, env, 'object');
      
      // In object context, should preserve the Variable
      expect(isVariable(result)).toBe(true);
      expect(result).toBe(textVar);
    });
    
    it('should extract values for command context', async () => {
      const cmdVar = createSimpleTextVariable('cmd', 'echo', mockSource);
      const argVar = createSimpleTextVariable('arg', 'hello', mockSource);
      env.setVariable('cmd', cmdVar);
      env.setVariable('arg', argVar);
      
      const nodes = [
        { type: 'VariableReference', identifier: 'cmd' },
        { type: 'Text', content: ' ' },
        { type: 'VariableReference', identifier: 'arg' }
      ];
      
      const result = await interpolateEnhanced(nodes, env, 'command');
      
      // In command context, should extract to string
      expect(typeof result).toBe('string');
      expect(result).toBe('echo hello');
    });
  });
  
  describe('Default behavior (no context)', () => {
    it('should fall back to string interpolation without context', async () => {
      const var1 = createSimpleTextVariable('test', 'value', mockSource);
      env.setVariable('test', var1);
      
      const nodes = [
        { type: 'Text', content: 'Test: ' },
        { type: 'VariableReference', identifier: 'test' }
      ];
      
      // No context hint provided
      const result = await interpolateEnhanced(nodes, env);
      
      // Should default to string
      expect(typeof result).toBe('string');
      expect(result).toBe('Test: value');
    });
  });
});