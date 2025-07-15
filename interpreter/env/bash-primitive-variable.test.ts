import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Environment } from './Environment';
import { createSimpleTextVariable, createPrimitiveVariable } from '@core/types/variable/VariableFactories';
import { evaluateExecInvocation } from '../eval/exec-invocation';
import type { ExecInvocation } from '@core/types';
import type { IFileSystemService, IPathService } from '@services/index';

describe('Bash Primitive Variable Type Handling', () => {
  let env: Environment;
  let fileSystem: IFileSystemService;
  let pathService: IPathService;
  
  beforeEach(() => {
    // Enable enhanced mode
    process.env.MLLD_ENHANCED_VARIABLE_PASSING = 'true';
    process.env.MOCK_BASH = 'true';
    
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
    delete process.env.MOCK_BASH;
  });
  
  const mockSource = {
    directive: 'var' as const,
    syntax: 'literal' as const,
    hasInterpolation: false,
    isMultiLine: false
  };

  it('should preserve type information for string primitives in bash', async () => {
    // Create a string Variable
    const stringVar = createSimpleTextVariable('greeting', 'Hello, World!', false, mockSource);
    env.setVariable('greeting', stringVar);
    
    if (process.env.MLLD_DEBUG === 'true') {
      console.log('Created string variable:', {
        type: stringVar.type,
        subtype: stringVar.subtype,
        value: stringVar.value
      });
    }
    
    // Create an exe that checks the type
    const { createExecutableVariable } = await import('@core/types/variable/VariableFactories');
    const exeVar = createExecutableVariable(
      'checkStringType',
      'code',
      'bash',
      ['text'],
      'bash',
      mockSource,
      {
        executableDef: {
          type: 'code',
          language: 'bash',
          paramNames: ['text'],
          codeTemplate: [{ type: 'Text', content: `
            echo "value: $text"
            echo "type: $(mlld_get_type text)"
            echo "is_variable: $(mlld_is_variable text && echo 'true' || echo 'false')"
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
    const lines = result.value.trim().split('\n');
    
    expect(lines[0]).toBe('value: Hello, World!');
    expect(lines[1]).toBe('type: simple-text');
    expect(lines[2]).toBe('is_variable: true');
  });
});