// Mock the logger before any imports
const mockLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn()
};

vi.mock('@core/utils/logger', () => ({
  directiveLogger: mockLogger
}));

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RunDirectiveHandler } from '@services/pipeline/DirectiveService/handlers/execution/RunDirectiveHandler';
import { DirectiveNode } from '@core/syntax/types';
import { TestContextDI } from '@tests/utils/di/TestContextDI';
import {
  createValidationServiceMock,
  createStateServiceMock,
  createResolutionServiceMock,
  createFileSystemServiceMock
} from '@tests/utils/mocks/serviceMocks';

// Helper to create a run directive node
const createRunDirectiveNode = (options: any): DirectiveNode => {
  return {
    type: 'Directive',
    directive: {
      kind: 'run',
      ...options
    },
    location: { 
      start: { line: 1, column: 1 },
      end: { line: 1, column: 20 }
    }
  } as DirectiveNode;
};

describe('RunDirectiveHandler with command references (AST-based)', () => {
  let handler: RunDirectiveHandler;
  let validationService: ReturnType<typeof createValidationServiceMock>;
  let stateService: ReturnType<typeof createStateServiceMock>;
  let resolutionService: ReturnType<typeof createResolutionServiceMock>;
  let fileSystemService: ReturnType<typeof createFileSystemServiceMock>;
  let clonedState: any;
  let context: TestContextDI;
  
  beforeEach(async () => {
    // Create context with isolated container
    context = TestContextDI.createIsolated();
    await context.initialize();
    
    // Create mocks using standardized factories
    validationService = createValidationServiceMock();
    stateService = createStateServiceMock();
    resolutionService = createResolutionServiceMock();
    fileSystemService = createFileSystemServiceMock();
    
    clonedState = {
      setTextVar: vi.fn(),
      clone: vi.fn(),
      isTransformationEnabled: vi.fn().mockReturnValue(false),
      transformNode: vi.fn(),
      getCommand: vi.fn(),
      getTextVar: vi.fn()
    };

    // Configure state service
    stateService.clone.mockReturnValue(clonedState);
    stateService.isTransformationEnabled.mockReturnValue(false);
    stateService.getTextVar = vi.fn().mockImplementation((name) => {
      if (name === 'hello') return 'howdy';
      if (name === 'world') return 'planet';
      return '';
    });
    
    // Mock file system service to avoid real command execution
    fileSystemService.executeCommand.mockResolvedValue({
      stdout: 'mocked command output',
      stderr: ''
    });
    fileSystemService.getCwd.mockReturnValue('/workspace');
    
    // Create handler directly with the mocks
    handler = new RunDirectiveHandler(
      validationService,
      resolutionService,
      stateService,
      fileSystemService
    );

    // Mock process.env to simulate non-test environment
    vi.stubEnv('NODE_ENV', 'development');
  });
  
  afterEach(async () => {
    await context?.cleanup();
    vi.unstubAllEnvs();
  });
  
  it('should handle command references with string arguments (AST-based)', async () => {
    // Define a command in state
    const commandDef = {
      parameters: ['x', 'y'],
      command: '@run [echo {{x}} {{y}}]'
    };
    stateService.getCommand.mockReturnValue(commandDef);
    clonedState.getCommand.mockReturnValue(commandDef);
    
    // Create a directive node with the AST-based command reference structure
    const node = createRunDirectiveNode({
      command: {
        name: 'testCommand',
        args: [
          { type: 'string', value: 'hello' },
          { type: 'string', value: 'world' }
        ],
        raw: '$testCommand("hello", "world")'
      },
      isReference: true
    });
    
    // Mock validation
    validationService.validate.mockResolvedValue(undefined);
    
    // Execute the directive
    await handler.execute(node, {
      state: stateService,
      workingDirectory: '/workspace',
      fileDirectory: '/workspace'
    });
    
    // Verify the correct command was executed with the arguments
    expect(fileSystemService.executeCommand).toHaveBeenCalledWith(
      'echo hello world',
      expect.objectContaining({ cwd: '/workspace' })
    );
  });

  it('should handle command references with variable arguments (AST-based)', async () => {
    // Define a command in state
    const commandDef = {
      parameters: ['x', 'y'],
      command: '@run [echo {{x}} {{y}}]'
    };
    stateService.getCommand.mockReturnValue(commandDef);
    clonedState.getCommand.mockReturnValue(commandDef);
    
    // Create mock variable references
    const helloVarRef = {
      type: 'VariableReference',
      valueType: 'text',
      identifier: 'hello',
      isVariableReference: true,
      raw: '{{hello}}'
    };
    
    const worldVarRef = {
      type: 'VariableReference',
      valueType: 'text',
      identifier: 'world',
      isVariableReference: true,
      raw: '{{world}}'
    };
    
    // Create a directive node with the AST-based command reference structure
    const node = createRunDirectiveNode({
      command: {
        name: 'testCommand',
        args: [
          { type: 'variable', value: helloVarRef },
          { type: 'variable', value: worldVarRef }
        ],
        raw: '$testCommand({{hello}}, {{world}})'
      },
      isReference: true
    });
    
    // Mock validation
    validationService.validate.mockResolvedValue(undefined);
    
    // Mock resolution service to resolve variable references
    resolutionService.resolveInContext.mockImplementation((input, context) => {
      if (input === '{{hello}}') return Promise.resolve('howdy');
      if (input === '{{world}}') return Promise.resolve('planet');
      return Promise.resolve(input);
    });
    
    // Execute the directive
    await handler.execute(node, {
      state: stateService,
      workingDirectory: '/workspace',
      fileDirectory: '/workspace'
    });
    
    // Verify the correct command was executed with the resolved variables
    expect(fileSystemService.executeCommand).toHaveBeenCalledWith(
      'echo howdy planet',
      expect.objectContaining({ cwd: '/workspace' })
    );
  });

  it('should handle command references with arguments containing commas (AST-based)', async () => {
    // Define a command in state
    const commandDef = {
      parameters: ['x', 'y'],
      command: '@run [echo {{x}} {{y}}]'
    };
    stateService.getCommand.mockReturnValue(commandDef);
    clonedState.getCommand.mockReturnValue(commandDef);
    
    // Create a directive node with the AST-based command reference structure
    const node = createRunDirectiveNode({
      command: {
        name: 'testCommand',
        args: [
          { type: 'string', value: 'hello, friend' },
          { type: 'string', value: 'beautiful world' }
        ],
        raw: '$testCommand("hello, friend", "beautiful world")'
      },
      isReference: true
    });
    
    // Mock validation
    validationService.validate.mockResolvedValue(undefined);
    
    // Execute the directive
    await handler.execute(node, {
      state: stateService,
      workingDirectory: '/workspace',
      fileDirectory: '/workspace'
    });
    
    // Verify the correct command was executed with properly handled comma arguments
    expect(fileSystemService.executeCommand).toHaveBeenCalledWith(
      'echo hello, friend beautiful world',
      expect.objectContaining({ cwd: '/workspace' })
    );
  });

  it('should handle command references with a mix of string and variable arguments (AST-based)', async () => {
    // Define a command in state
    const commandDef = {
      parameters: ['x', 'y'],
      command: '@run [echo {{x}} {{y}}]'
    };
    stateService.getCommand.mockReturnValue(commandDef);
    clonedState.getCommand.mockReturnValue(commandDef);
    
    // Create mock variable reference
    const worldVarRef = {
      type: 'VariableReference',
      valueType: 'text',
      identifier: 'world',
      isVariableReference: true,
      raw: '{{world}}'
    };
    
    // Create a directive node with the AST-based command reference structure
    const node = createRunDirectiveNode({
      command: {
        name: 'testCommand',
        args: [
          { type: 'string', value: 'hello' },
          { type: 'variable', value: worldVarRef }
        ],
        raw: '$testCommand("hello", {{world}})'
      },
      isReference: true
    });
    
    // Mock validation
    validationService.validate.mockResolvedValue(undefined);
    
    // Mock resolution service to resolve variable references
    resolutionService.resolveInContext.mockImplementation((input, context) => {
      if (input === '{{world}}') return Promise.resolve('planet');
      return Promise.resolve(input);
    });
    
    // Execute the directive
    await handler.execute(node, {
      state: stateService,
      workingDirectory: '/workspace',
      fileDirectory: '/workspace'
    });
    
    // Verify the correct command was executed with mixed arguments
    expect(fileSystemService.executeCommand).toHaveBeenCalledWith(
      'echo hello planet',
      expect.objectContaining({ cwd: '/workspace' })
    );
  });

  it('should discover parameters in the command template if not explicitly defined', async () => {
    // Define a command in state that doesn't specify parameters explicitly
    const commandDef = {
      command: '@run [echo {{message}} {{greeting}}]'
      // No parameters array defined
    };
    stateService.getCommand.mockReturnValue(commandDef);
    clonedState.getCommand.mockReturnValue(commandDef);
    
    // Create a directive node with the AST-based command reference structure
    const node = createRunDirectiveNode({
      command: {
        name: 'testCommand',
        args: [
          { type: 'string', value: 'hello there' },
          { type: 'string', value: 'good day' }
        ],
        raw: '$testCommand("hello there", "good day")'
      },
      isReference: true
    });
    
    // Mock validation
    validationService.validate.mockResolvedValue(undefined);
    
    // Execute the directive
    await handler.execute(node, {
      state: stateService,
      workingDirectory: '/workspace',
      fileDirectory: '/workspace'
    });
    
    // Verify the correct command was executed with parameters discovered from the template
    expect(fileSystemService.executeCommand).toHaveBeenCalledWith(
      'echo hello there good day',
      expect.objectContaining({ cwd: '/workspace' })
    );
  });
});