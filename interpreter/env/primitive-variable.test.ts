import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Environment } from './Environment';
import { createSimpleTextVariable, createPrimitiveVariable } from '@core/types/variable/VariableFactories';
import { evaluateExecInvocation } from '../eval/exec-invocation';
import type { ExecInvocation } from '@core/types';
import type { IFileSystemService, IPathService } from '@services/index';

describe('Primitive Variable Type Handling', () => {
  let env: Environment;
  let fileSystem: IFileSystemService;
  let pathService: IPathService;
  
  beforeEach(() => {
    // Enable enhanced mode
    process.env.MLLD_ENHANCED_VARIABLE_PASSING = 'true';
    
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
  
  afterEach(() => {
    delete process.env.MLLD_ENHANCED_VARIABLE_PASSING;
  });
  
  const mockSource = {
    directive: 'var' as const,
    syntax: 'literal' as const,
    hasInterpolation: false,
    isMultiLine: false
  };

  it('should preserve type information for string primitives', async () => {
    // Create a string Variable
    const stringVar = createSimpleTextVariable('greeting', 'Hello, World!', false, mockSource);
    env.setVariable('greeting', stringVar);
    
    // Create an exe that checks the type
    const { createExecutableVariable } = await import('@core/types/variable/VariableFactories');
    const exeVar = createExecutableVariable(
      'checkStringType',
      'code',
      'js',
      ['text'],
      'javascript',
      mockSource,
      {
        executableDef: {
          type: 'code',
          language: 'javascript',
          paramNames: ['text'],
          codeTemplate: [{ type: 'Text', content: `
            return {
              value: text,
              type: mlld.getType(text, 'text'),
              isVariable: mlld.isVariable(text, 'text'),
              metadata: mlld.getMetadata(text, 'text')
            };
          ` }]
        }
      }
    );
    env.setVariable('checkStringType', exeVar);
    
    // Execute
    const invocation: ExecInvocation = {
      type: 'ExecInvocation',
      commandRef: {
        identifier: [{ type: 'VariableReference', identifier: 'checkStringType' }],
        args: [{ type: 'VariableReference', identifier: 'greeting' }]
      }
    };
    
    const result = await evaluateExecInvocation(invocation, env);
    const output = typeof result.value === 'string' ? JSON.parse(result.value) : result.value;
    
    expect(output.value).toBe('Hello, World!');
    expect(output.type).toBe('simple-text');
    expect(output.isVariable).toBe(true);
    // Metadata includes parameter info when passed to functions
    expect(output.metadata).toHaveProperty('isParameter', true);
  });

  it('should preserve type information for number primitives', async () => {
    // Create a number Variable
    const numberVar = createPrimitiveVariable('count', 42, mockSource);
    env.setVariable('count', numberVar);
    
    // Create an exe that checks the type
    const { createExecutableVariable } = await import('@core/types/variable/VariableFactories');
    const exeVar = createExecutableVariable(
      'checkNumberType',
      'code',
      'js',
      ['num'],
      'javascript',
      mockSource,
      {
        executableDef: {
          type: 'code',
          language: 'javascript',
          paramNames: ['num'],
          codeTemplate: [{ type: 'Text', content: `
            return {
              value: num,
              type: mlld.getType(num, 'num'),
              subtype: mlld.getSubtype(num, 'num'),
              isVariable: mlld.isVariable(num, 'num'),
              isNumber: typeof num === 'number'
            };
          ` }]
        }
      }
    );
    env.setVariable('checkNumberType', exeVar);
    
    // Execute
    const invocation: ExecInvocation = {
      type: 'ExecInvocation',
      commandRef: {
        identifier: [{ type: 'VariableReference', identifier: 'checkNumberType' }],
        args: [{ type: 'VariableReference', identifier: 'count' }]
      }
    };
    
    const result = await evaluateExecInvocation(invocation, env);
    const output = typeof result.value === 'string' ? JSON.parse(result.value) : result.value;
    
    expect(output.value).toBe(42);
    expect(output.type).toBe('primitive');
    expect(output.subtype).toBe('number');
    expect(output.isVariable).toBe(true);
    expect(output.isNumber).toBe(true);
  });

  it('should preserve type information for boolean primitives', async () => {
    // Create a boolean Variable
    const boolVar = createPrimitiveVariable('isReady', true, mockSource);
    env.setVariable('isReady', boolVar);
    
    // Create an exe that checks the type
    const { createExecutableVariable } = await import('@core/types/variable/VariableFactories');
    const exeVar = createExecutableVariable(
      'checkBoolType',
      'code',
      'js',
      ['flag'],
      'javascript',
      mockSource,
      {
        executableDef: {
          type: 'code',
          language: 'javascript',
          paramNames: ['flag'],
          codeTemplate: [{ type: 'Text', content: `
            return {
              value: flag,
              type: mlld.getType(flag, 'flag'),
              subtype: mlld.getSubtype(flag, 'flag'),
              isVariable: mlld.isVariable(flag, 'flag'),
              isBoolean: typeof flag === 'boolean'
            };
          ` }]
        }
      }
    );
    env.setVariable('checkBoolType', exeVar);
    
    // Execute
    const invocation: ExecInvocation = {
      type: 'ExecInvocation',
      commandRef: {
        identifier: [{ type: 'VariableReference', identifier: 'checkBoolType' }],
        args: [{ type: 'VariableReference', identifier: 'isReady' }]
      }
    };
    
    const result = await evaluateExecInvocation(invocation, env);
    const output = typeof result.value === 'string' ? JSON.parse(result.value) : result.value;
    
    expect(output.value).toBe(true);
    expect(output.type).toBe('primitive');
    expect(output.subtype).toBe('boolean');
    expect(output.isVariable).toBe(true);
    expect(output.isBoolean).toBe(true);
  });
});