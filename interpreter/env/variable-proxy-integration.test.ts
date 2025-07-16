import { describe, it, expect, beforeEach } from 'vitest';
import { Environment } from './Environment';
import { createArrayVariable, createObjectVariable, createSimpleTextVariable } from '@core/types/variable/VariableFactories';
import { evaluateExecInvocation } from '../eval/exec-invocation';
import type { ExecInvocation } from '@core/types';
import type { IFileSystemService, IPathService } from '@services/index';

describe('Variable Proxy Integration', () => {
  let env: Environment;
  let fileSystem: IFileSystemService;
  let pathService: IPathService;
  
  beforeEach(() => {
    // Create mock services
    fileSystem = {
      readFile: async () => '',
      writeFile: async () => {},
      exists: async () => true,
      mkdir: async () => {},
      readdir: async () => [],
      stat: async () => ({ isDirectory: () => false, isFile: () => true }),
      realpath: async (path: string) => path,
      createVirtualFS: () => ({ readFile: async () => '', writeFile: async () => {} })
    } as any;
    
    pathService = {
      resolve: (...paths: string[]) => paths.join('/'),
      dirname: (path: string) => path.split('/').slice(0, -1).join('/'),
      basename: (path: string) => path.split('/').pop() || '',
      extname: (path: string) => {
        const parts = path.split('.');
        return parts.length > 1 ? `.${parts.pop()}` : '';
      },
      join: (...paths: string[]) => paths.join('/'),
      isAbsolute: (path: string) => path.startsWith('/'),
      relative: (from: string, to: string) => to,
      normalize: (path: string) => path
    };
    
    env = new Environment(fileSystem, pathService, '/test/project');
  });
  
  const mockSource = {
    directive: 'var' as const,
    syntax: 'literal' as const,
    hasInterpolation: false,
    isMultiLine: false
  };
  
  describe('Shadow Environment Variable Passing', () => {
    beforeEach(() => {
    });
    
    afterEach(() => {
    });
    
    it('should pass Variables as proxies to JavaScript shadow environments', async () => {
      // Create a variable with metadata
      const arrayVar = createArrayVariable('testData', ['a', 'b', 'c'], false, mockSource, {
        arrayType: 'load-content',
        customToString: () => 'a|b|c'
      });
      env.setVariable('testData', arrayVar);
      
      // Create an exe that introspects the Variable
      const { createExecutableVariable } = await import('@core/types/variable/VariableFactories');
      const exeVar = createExecutableVariable(
        'inspectType',
        'code',
        'js',
        ['data'],
        'javascript',
        mockSource,
        {
          executableDef: {
            type: 'code',
            language: 'javascript',
            paramNames: ['data'],
            codeTemplate: [{ type: 'Text', content: `
              // Check if mlld helpers are available
              if (typeof mlld !== 'undefined') {
                return {
                  hasHelpers: true,
                  isVariable: mlld.isVariable(data),
                  type: mlld.getType(data),
                  metadata: mlld.getMetadata(data),
                  // Direct property access
                  directType: data[mlld.TYPE],
                  // Array operations still work
                  length: data.length,
                  firstItem: data[0],
                  joined: data.join(',')
                };
              }
              return { hasHelpers: false };
            ` }]
          }
        }
      );
      env.setVariable('inspectType', exeVar);
      
      // Create invocation node
      const invocation: ExecInvocation = {
        type: 'ExecInvocation',
        commandRef: {
          identifier: [{ type: 'VariableReference', identifier: 'inspectType' }],
          args: [{ type: 'VariableReference', identifier: 'testData' }]
        }
      };
      
      // Execute
      const result = await evaluateExecInvocation(invocation, env);
      
      // Get result - it's already an object
      const output = typeof result.value === 'string' ? JSON.parse(result.value) : result.value;
      
      // Verify Variable introspection works
      expect(output.hasHelpers).toBe(true);
      expect(output.isVariable).toBe(true);
      expect(output.type).toBe('array');
      expect(output.metadata).toEqual({
        arrayType: 'load-content',
        isSystem: true,
        isParameter: true
      });
      expect(output.directType).toBe('array');
      
      // Verify normal array operations still work
      expect(output.length).toBe(3);
      expect(output.firstItem).toBe('a');
      expect(output.joined).toBe('a,b,c');
    });
    
    it('should handle objects with Variable proxies', async () => {
      // Create an object variable
      const objVar = createObjectVariable(
        'user',
        { name: 'Alice', age: 30, active: true },
        false,
        mockSource,
        { source: 'api' }
      );
      env.setVariable('user', objVar);
      
      // Create an exe that uses the object
      const { createExecutableVariable } = await import('@core/types/variable/VariableFactories');
      const exeVar = createExecutableVariable(
        'processUser',
        'code',
        'js',
        ['user'],
        'javascript',
        mockSource,
        {
          executableDef: {
            type: 'code',
            language: 'javascript',
            paramNames: ['user'],
            codeTemplate: [{ type: 'Text', content: `
              return {
                // Normal access works
                name: user.name,
                age: user.age,
                active: user.active,
                // Type introspection
                type: user.__mlld_type,
                metadata: user.__mlld_metadata,
                // Object operations
                keys: Object.keys(user),
                hasName: 'name' in user,
                json: JSON.stringify(user)
              };
            ` }]
          }
        }
      );
      env.setVariable('processUser', exeVar);
      
      // Execute
      const invocation: ExecInvocation = {
        type: 'ExecInvocation',
        commandRef: {
          identifier: [{ type: 'VariableReference', identifier: 'processUser' }],
          args: [{ type: 'VariableReference', identifier: 'user' }]
        }
      };
      
      const result = await evaluateExecInvocation(invocation, env);
      const output = typeof result.value === 'string' ? JSON.parse(result.value) : result.value;
      
      // Verify
      expect(output.name).toBe('Alice');
      expect(output.age).toBe(30);
      expect(output.active).toBe(true);
      expect(output.type).toBe('object');
      expect(output.metadata).toEqual({ 
        source: 'api',
        isSystem: true,
        isParameter: true
      });
      expect(output.keys).toEqual(['name', 'age', 'active']);
      expect(output.hasName).toBe(true);
      expect(output.json).toBe('{"name":"Alice","age":30,"active":true}');
    });
    
    it('should handle primitives without proxies', async () => {
      // Create primitive variables
      const stringVar = createSimpleTextVariable('message', 'Hello World', mockSource);
      env.setVariable('message', stringVar);
      
      // Create an exe
      const { createExecutableVariable } = await import('@core/types/variable/VariableFactories');
      const exeVar = createExecutableVariable(
        'checkPrimitive',
        'code',
        'js',
        ['msg'],
        'javascript',
        mockSource,
        {
          executableDef: {
            type: 'code',
            language: 'javascript',
            paramNames: ['msg'],
            codeTemplate: [{ type: 'Text', content: `
              return {
                value: msg,
                type: typeof msg,
                hasType: msg.__mlld_type || null,
                isVariable: mlld ? mlld.isVariable(msg) : null
              };
            ` }]
          }
        }
      );
      env.setVariable('checkPrimitive', exeVar);
      
      // Execute
      const invocation: ExecInvocation = {
        type: 'ExecInvocation',
        commandRef: {
          identifier: [{ type: 'VariableReference', identifier: 'checkPrimitive' }],
          args: [{ type: 'VariableReference', identifier: 'message' }]
        }
      };
      
      const result = await evaluateExecInvocation(invocation, env);
      const output = typeof result.value === 'string' ? JSON.parse(result.value) : result.value;
      
      // Primitives can't be proxied, so no type info
      expect(output.value).toBe('Hello World');
      expect(output.type).toBe('string');
      expect(output.hasType).toBe(null);
      expect(output.isVariable).toBe(false);
    });
    
    it('should preserve custom toString in proxies', async () => {
      // Create array with custom toString
      const arrayVar = createArrayVariable('paths', ['/home', '/usr', '/var'], false, mockSource, {
        customToString: function() { return this.join(':'); }
      });
      env.setVariable('paths', arrayVar);
      
      // Create exe that uses toString
      const { createExecutableVariable } = await import('@core/types/variable/VariableFactories');
      const exeVar = createExecutableVariable(
        'testToString',
        'code',
        'js',
        ['paths'],
        'javascript',
        mockSource,
        {
          executableDef: {
            type: 'code',
            language: 'javascript',
            paramNames: ['paths'],
            codeTemplate: [{ type: 'Text', content: `
              return {
                toString: paths.toString(),
                joined: paths.join(':'),
                isVariable: mlld.isVariable(paths)
              };
            ` }]
          }
        }
      );
      env.setVariable('testToString', exeVar);
      
      // Execute
      const invocation: ExecInvocation = {
        type: 'ExecInvocation',
        commandRef: {
          identifier: [{ type: 'VariableReference', identifier: 'testToString' }],
          args: [{ type: 'VariableReference', identifier: 'paths' }]
        }
      };
      
      const result = await evaluateExecInvocation(invocation, env);
      const output = typeof result.value === 'string' ? JSON.parse(result.value) : result.value;
      
      // Custom toString should be used
      expect(output.toString).toBe('/home:/usr:/var');
      expect(output.joined).toBe('/home:/usr:/var');
      expect(output.isVariable).toBe(true);
    });
    
    it('should pass Variables with proper metadata', async () => {
      
      // Create a variable
      const arrayVar = createArrayVariable('data', [1, 2, 3], false, mockSource, {
        arrayType: 'special'
      });
      env.setVariable('data', arrayVar);
      
      // Create exe
      const { createExecutableVariable } = await import('@core/types/variable/VariableFactories');
      const exeVar = createExecutableVariable(
        'checkMode',
        'code',
        'js',
        ['data'],
        'javascript',
        mockSource,
        {
          executableDef: {
            type: 'code',
            language: 'javascript',
            paramNames: ['data'],
            codeTemplate: [{ type: 'Text', content: `
              return {
                isArray: Array.isArray(data),
                hasType: data.__mlld_type || false,
                hasMlld: typeof mlld !== 'undefined'
              };
            ` }]
          }
        }
      );
      env.setVariable('checkMode', exeVar);
      
      // Execute
      const invocation: ExecInvocation = {
        type: 'ExecInvocation',
        commandRef: {
          identifier: [{ type: 'VariableReference', identifier: 'checkMode' }],
          args: [{ type: 'VariableReference', identifier: 'data' }]
        }
      };
      
      const result = await evaluateExecInvocation(invocation, env);
      const output = typeof result.value === 'string' ? JSON.parse(result.value) : result.value;
      
      // Enhanced mode is now always on
      expect(output.isArray).toBe(true);
      expect(output.hasType).toBe('array');
      expect(output.hasMlld).toBe(true); // mlld helpers always available
    });
  });
});