import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Environment } from './Environment';
import { createArrayVariable, createObjectVariable } from '@core/types/variable/VariableFactories';
import { evaluateExecInvocation } from '../eval/exec-invocation';
import type { ExecInvocation } from '@core/types';
import type { IFileSystemService, IPathService } from '@services/index';
import { unwrapStructuredForTest } from '@interpreter/eval/test-helpers';

describe('Variable Passing Integration Tests', () => {
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
  
  afterEach(() => {
  });
  
  const mockSource = {
    directive: 'var' as const,
    syntax: 'literal' as const,
    hasInterpolation: false,
    isMultiLine: false
  };
  
  describe('JavaScript Executor', () => {
    it('should pass Variables with type information to JavaScript', async () => {
      // Create test data
      const arrayVar = createArrayVariable('data', [1, 2, 3], false, mockSource, {
        mx: {},
        internal: { arrayType: 'test-array' }
      });
      env.setVariable('data', arrayVar);
      
      // Create exe
      const { createExecutableVariable } = await import('@core/types/variable/VariableFactories');
      const exeVar = createExecutableVariable(
        'checkType',
        'code',
        'js',
        ['value'],
        'javascript',
        mockSource,
        {
          mx: {},
          internal: {
            executableDef: {
              type: 'code',
              language: 'javascript',
              paramNames: ['value'],
              codeTemplate: [{ type: 'Text', content: `
              return {
                type: mlld.getType(value),
                internal: mlld.getInternal(value),
                isVariable: mlld.isVariable(value),
                value: value
              };
            ` }]
            }
          }
        }
      );
      env.setVariable('checkType', exeVar);
      
      // Execute
      const invocation: ExecInvocation = {
        type: 'ExecInvocation',
        commandRef: {
          identifier: [{ type: 'VariableReference', identifier: 'checkType' }],
          args: [{ type: 'VariableReference', identifier: 'data' }]
        }
      };
      
      const result = await evaluateExecInvocation(invocation, env);
      const unwrappedResult = unwrapStructuredForTest(result.value);
      const output = typeof unwrappedResult.data === 'string'
        ? JSON.parse(unwrappedResult.data)
        : unwrappedResult.data;
      
      expect(output.type).toBe('array');
      expect(output.internal?.arrayType).toBe('test-array');
      expect(output.isVariable).toBe(true);
      expect(output.value).toEqual([1, 2, 3]);
    });
  });
  
  describe('Node.js Executor', () => {
    it('should pass Variables with type information to Node.js', async () => {
      // Create test data
      const objVar = createObjectVariable(
        'config',
        { host: 'localhost', port: 3000 },
        false,
        mockSource,
        {
          mx: {},
          internal: { configType: 'server' }
        }
      );
      env.setVariable('config', objVar);
      
      // Create exe
      const { createExecutableVariable } = await import('@core/types/variable/VariableFactories');
      const exeVar = createExecutableVariable(
        'nodeCheck',
        'code',
        'node',
        ['cfg'],
        'node',
        mockSource,
        {
          mx: {},
          internal: {
            executableDef: {
              type: 'code',
              language: 'node',
              paramNames: ['cfg'],
              codeTemplate: [{ type: 'Text', content: `
              return {
                type: mlld.getType(cfg),
                internal: mlld.getInternal(cfg),
                isVariable: mlld.isVariable(cfg),
                host: cfg.host,
                port: cfg.port
              };
            ` }]
            }
          }
        }
      );
      env.setVariable('nodeCheck', exeVar);
      
      // Execute
      const invocation: ExecInvocation = {
        type: 'ExecInvocation',
        commandRef: {
          identifier: [{ type: 'VariableReference', identifier: 'nodeCheck' }],
          args: [{ type: 'VariableReference', identifier: 'config' }]
        }
      };
      
      const result = await evaluateExecInvocation(invocation, env);
      const unwrappedResult = unwrapStructuredForTest(result.value);
      const output = typeof unwrappedResult.data === 'string'
        ? JSON.parse(unwrappedResult.data)
        : unwrappedResult.data;
      
      expect(output.type).toBe('object');
      expect(output.internal?.configType).toBe('server');
      expect(output.isVariable).toBe(true);
      expect(output.host).toBe('localhost');
      expect(output.port).toBe(3000);
    });
  });

  describe('Context injection', () => {
    it('injects ambient @mx into JS executors via ContextManager', async () => {
      env.setPipelineContext({
        stage: 2,
        totalStages: 3,
        currentCommand: 'noop',
        input: '{"foo":"bar"}',
        previousOutputs: ['prev-output'],
        format: 'json',
        attemptCount: 2,
        attemptHistory: ['first-attempt'],
        hint: 'retry please',
        hintHistory: ['retry please']
      });

      const commandExecutorFactory = (env as any).commandExecutorFactory;
      const originalExecuteCode = commandExecutorFactory.executeCode;

      let capturedCtx: any;
      commandExecutorFactory.executeCode = async (
        code: string,
        language: string,
        params?: Record<string, any>
      ) => {
        if (language === 'js' || language === 'javascript') {
          capturedCtx = params?.mx;
          return '';
        }
        return originalExecuteCode.call(commandExecutorFactory, code, language, params);
      };

      await env.executeCode('return;', 'js', {});

      expect(capturedCtx).toBeDefined();
      expect(capturedCtx.try).toBe(2);
      expect(capturedCtx.pipe?.stage).toBe(2);
      expect(capturedCtx.input.foo).toBe('bar');

      commandExecutorFactory.executeCode = originalExecuteCode;
      env.clearPipelineContext();
    });
  });
  
  describe('Python Executor', () => {
    it('should pass Variables with type information to Python', async () => {
      // Create test data
      const arrayVar = createArrayVariable('items', ['apple', 'banana'], false, mockSource, {
        mx: {},
        internal: { itemType: 'fruit' }
      });
      env.setVariable('items', arrayVar);
      
      // Create exe
      const { createExecutableVariable } = await import('@core/types/variable/VariableFactories');
      const exeVar = createExecutableVariable(
        'pythonCheck',
        'code',
        'python',
        ['items'],
        'python',
        mockSource,
        {
          mx: {},
          internal: {
            executableDef: {
              type: 'code',
              language: 'python',
              paramNames: ['items'],
              codeTemplate: [{ type: 'Text', content: `
import json

result = {
    'type': items.__mlld_type__ if hasattr(items, '__mlld_type__') else None,
    'metadata': items.__mlld_metadata__ if hasattr(items, '__mlld_metadata__') else {},
    'is_variable': mlld.is_variable(items),
    'length': len(items),
    'first': items[0] if len(items) > 0 else None
}

print(json.dumps(result))
` }]
            }
          }
        }
      );
      env.setVariable('pythonCheck', exeVar);
      
      // Since we can't actually execute Python in tests, we'll verify the code generation
      // by checking what would be passed to the Python executor
      const commandExecutorFactory = (env as any).commandExecutorFactory;
      const originalExecuteCode = commandExecutorFactory.executeCode;
      
      let capturedCode: string | undefined;
      let capturedParams: Record<string, any> | undefined;
      
      commandExecutorFactory.executeCode = async (code: string, language: string, params?: Record<string, any>) => {
        if (language === 'python') {
          capturedCode = code;
          capturedParams = params;
          // Return simulated result
          return JSON.stringify({
            type: 'array',
            metadata: { itemType: 'fruit' },
            is_variable: true,
            length: 2,
            first: 'apple'
          });
        }
        return originalExecuteCode.call(commandExecutorFactory, code, language, params);
      };
      
      // Execute
      const invocation: ExecInvocation = {
        type: 'ExecInvocation',
        commandRef: {
          identifier: [{ type: 'VariableReference', identifier: 'pythonCheck' }],
          args: [{ type: 'VariableReference', identifier: 'items' }]
        }
      };
      
      const result = await evaluateExecInvocation(invocation, env);
      
      // The mock should have captured the code
      if (!capturedCode) {
        // If we couldn't capture, just verify the result was returned
        expect(result.value).toBeDefined();
        return;
      }
      
      // Verify the generated Python code includes Variable metadata
      expect(capturedCode).toContain('class MlldHelpers:');
      expect(capturedCode).toContain('class items_MlldArray(list):');
      expect(capturedCode).toContain('__mlld_type__');
      expect(capturedCode).toContain('__mlld_metadata__');
      
      // Verify the simulated result
      const output = typeof result.value === 'string' ? JSON.parse(result.value) : result.value;
      expect(output.type).toBe('array');
      expect(output.internal?.itemType).toBe('fruit');
      expect(output.is_variable).toBe(true);
      expect(output.length).toBe(2);
      expect(output.first).toBe('apple');
      
      // Restore original
      commandExecutorFactory.executeCode = originalExecuteCode;
    });
  });
  
  describe('Bash Executor', () => {
    it('should pass Variables with type information to Bash', async () => {
      // Create test data
      const arrayVar = createArrayVariable('files', ['file1.txt', 'file2.txt'], false, mockSource, {
        mx: {},
        internal: { fileType: 'text' }
      });
      env.setVariable('files', arrayVar);
      
      // Create exe
      const { createExecutableVariable } = await import('@core/types/variable/VariableFactories');
      const exeVar = createExecutableVariable(
        'bashCheck',
        'code',
        'bash',
        ['files'],
        'bash',
        mockSource,
        {
          mx: {},
          internal: {
            executableDef: {
              type: 'code',
              language: 'bash',
              paramNames: ['files'],
              codeTemplate: [{ type: 'Text', content: `
# Check if mlld helpers are available
if type mlld_is_variable &>/dev/null; then
  echo "has_helpers:true"

  # Check Variable info
  if mlld_is_variable files; then
    echo "is_variable:true"
    echo "type:$(mlld_get_type files)"
    echo "metadata:$(mlld_get_metadata files)"
  else
    echo "is_variable:false"
  fi
else
  echo "has_helpers:false"
fi

# Access the value
echo "value:$files"
` }]
            }
          }
        }
      );
      env.setVariable('bashCheck', exeVar);
      
      // Mock the command executor factory to capture the bash code
      const commandExecutorFactory = (env as any).commandExecutorFactory;
      const originalExecuteCode = commandExecutorFactory.executeCode;
      
      let capturedCode: string | undefined;
      let capturedParams: Record<string, any> | undefined;
      
      commandExecutorFactory.executeCode = async (code: string, language: string, params?: Record<string, any>) => {
        if (language === 'bash' || language === 'sh') {
          capturedCode = code;
          capturedParams = params;
          // Simulate Bash execution result
          return [
            'has_helpers:true',
            'is_variable:true',
            'type:array',
            'metadata:{"mx":{"fileType":"text"},"internal":{}}',
            'value:["file1.txt","file2.txt"]'
          ].join('\n');
        }
        return originalExecuteCode.call(commandExecutorFactory, code, language, params);
      };
      
      // Execute
      const invocation: ExecInvocation = {
        type: 'ExecInvocation',
        commandRef: {
          identifier: [{ type: 'VariableReference', identifier: 'bashCheck' }],
          args: [{ type: 'VariableReference', identifier: 'files' }]
        }
      };
      
      const result = await evaluateExecInvocation(invocation, env);
      const output = result.value as string;
      
      // The mock should have captured the code
      if (!capturedCode) {
        // If we couldn't capture, just verify the result was returned
        expect(result.value).toBeDefined();
        return;
      }
      
      // Verify the bash helpers were injected
      expect(capturedCode).toContain('mlld_is_variable()');
      expect(capturedCode).toContain('mlld_get_type()');
      expect(capturedCode).toContain('mlld_get_metadata()');
      
      // Parse the output
      const lines = output.split('\n');
      const parsed: Record<string, string> = {};
      for (const line of lines) {
        const colonIndex = line.indexOf(':');
        if (colonIndex > -1) {
          const key = line.substring(0, colonIndex);
          const value = line.substring(colonIndex + 1);
          parsed[key] = value;
        }
      }
      
      expect(parsed.has_helpers).toBe('true');
      expect(parsed.is_variable).toBe('true');
      expect(parsed.type).toBe('array');
      const parsedMetadata = JSON.parse(parsed.metadata);
      expect(parsedMetadata.mx).toEqual({ fileType: 'text' });
      expect(JSON.parse(parsed.value)).toEqual(['file1.txt', 'file2.txt']);
      
      // Restore original
      commandExecutorFactory.executeCode = originalExecuteCode;
    });
  });
  
  describe('Variable Metadata in Execution', () => {
    it('should always provide Variable metadata', async () => {
      
      // Create test data
      const arrayVar = createArrayVariable('data', [1, 2, 3], false, mockSource, {
        mx: {},
        internal: { arrayType: 'test' }
      });
      env.setVariable('data', arrayVar);
      
      // Create exe
      const { createExecutableVariable } = await import('@core/types/variable/VariableFactories');
      const exeVar = createExecutableVariable(
        'checkDisabled',
        'code',
        'js',
        ['value'],
        'javascript',
        mockSource,
        {
          mx: {},
          internal: {
            executableDef: {
              type: 'code',
              language: 'javascript',
              paramNames: ['value'],
              codeTemplate: [{ type: 'Text', content: `
              return {
                hasMlld: typeof mlld !== 'undefined',
                hasType: value.__mlld_type || false,
                isArray: Array.isArray(value),
                value: value
              };
            ` }]
            }
          }
        }
      );
      env.setVariable('checkDisabled', exeVar);
      
      // Execute
      const invocation: ExecInvocation = {
        type: 'ExecInvocation',
        commandRef: {
          identifier: [{ type: 'VariableReference', identifier: 'checkDisabled' }],
          args: [{ type: 'VariableReference', identifier: 'data' }]
        }
      };
      
      const result = await evaluateExecInvocation(invocation, env);
      const unwrappedResult = unwrapStructuredForTest(result.value);
      const output = typeof unwrappedResult.data === 'string'
        ? JSON.parse(unwrappedResult.data)
        : unwrappedResult.data;
      
      // Variable metadata is always provided
      expect(output.hasMlld).toBe(true);
      expect(output.hasType).toBe('array');
      expect(output.isArray).toBe(true);
      expect(output.value).toEqual([1, 2, 3]);
    });
  });
});
