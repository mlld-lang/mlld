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
import { RunDirectiveHandler } from '@services/pipeline/DirectiveService/handlers/execution/RunDirectiveHandler.js';
import { DirectiveNode } from '@core/syntax/types.js';
import { TestContextDI } from '@tests/utils/di/TestContextDI.js';
import {
  createValidationServiceMock,
  createStateServiceMock,
  createResolutionServiceMock,
  createFileSystemServiceMock
} from '@tests/utils/mocks/serviceMocks.js';

// Helper to create a run directive node
const createRunDirectiveNode = (command: string, outputVar?: string): DirectiveNode => {
  return {
    type: 'Directive',
    directive: {
      kind: 'run',
      command,
      output: outputVar
    },
    location: { line: 1, column: 1 }
  } as DirectiveNode;
};

describe('RunDirectiveHandler with command references', () => {
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
      getCommand: vi.fn()
    };

    // Configure state service
    stateService.clone.mockReturnValue(clonedState);
    stateService.isTransformationEnabled.mockReturnValue(false);
    
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
  });
  
  afterEach(async () => {
    await context?.cleanup();
  });
  
  it('should properly parse quoted parameters', async () => {
    // Define a command in state
    const commandDef = {
      parameters: ['x', 'y'],
      command: '@run [echo {{x}} {{y}}]'
    };
    stateService.getCommand.mockReturnValue(commandDef);
    
    // Create a directive node with quoted parameters
    const node = createRunDirectiveNode('$testCommand("hello","world")');
    
    // Mock validation and resolution
    validationService.validate.mockResolvedValue(undefined);
    
    // Mock resolution service to properly return each thing it's called with
    resolutionService.resolveInContext.mockImplementation((input, context) => {
      // When called with command arguments
      if (input === '"hello","world"') {
        return Promise.resolve('"hello","world"');
      }
      // For the original command
      else if (input === '$testCommand("hello","world")') {
        return Promise.resolve('echo hello world');
      }
      // Default fallback
      return Promise.resolve(input);
    });
    
    // Execute the directive
    await handler.execute(node, {
      state: stateService,
      workingDirectory: '/workspace',
      fileDirectory: '/workspace'
    });
    
    // Verify the parameters were correctly parsed
    expect(fileSystemService.executeCommand).toHaveBeenCalledWith(
      'echo hello world',
      expect.objectContaining({ cwd: '/workspace' })
    );
  });
  
  it('should properly handle variable references in parameters', async () => {
    // Define a command in state
    const commandDef = {
      parameters: ['x', 'y'],
      command: '@run [echo {{x}} {{y}}]'
    };
    stateService.getCommand.mockReturnValue(commandDef);
    
    // Create a directive node with variable references
    const node = createRunDirectiveNode('$testCommand({{hello}}, {{world}})');
    
    // Mock validation and resolution
    validationService.validate.mockResolvedValue(undefined);
    
    // Mock resolution service to properly return each thing it's called with
    resolutionService.resolveInContext.mockImplementation((input, context) => {
      // When called with command arguments
      if (input === '{{hello}}, {{world}}') {
        return Promise.resolve('howdy, planet');
      }
      // For the original command 
      else if (input === '$testCommand({{hello}}, {{world}})') {
        return Promise.resolve('echo howdy planet');
      }
      // Default fallback
      return Promise.resolve(input);
    });
    
    // Execute the directive
    await handler.execute(node, {
      state: stateService,
      workingDirectory: '/workspace',
      fileDirectory: '/workspace'
    });
    
    // Verify the parameters were correctly parsed and variables resolved
    expect(fileSystemService.executeCommand).toHaveBeenCalledWith(
      'echo howdy planet',
      expect.objectContaining({ cwd: '/workspace' })
    );
  });
  
  it('should handle parameters with commas inside them', async () => {
    // Define a command in state
    const commandDef = {
      parameters: ['x', 'y'],
      command: '@run [echo {{x}} {{y}}]'
    };
    stateService.getCommand.mockReturnValue(commandDef);
    
    // Create a directive node with parameters containing commas
    const node = createRunDirectiveNode('$testCommand("hello, friend","beautiful world")');
    
    // Mock validation and resolution
    validationService.validate.mockResolvedValue(undefined);
    
    // Mock resolution service to properly return each thing it's called with
    resolutionService.resolveInContext.mockImplementation((input, context) => {
      // When called with command arguments
      if (input === '"hello, friend","beautiful world"') {
        return Promise.resolve('"hello, friend","beautiful world"');
      }
      // For the original command
      else if (input === '$testCommand("hello, friend","beautiful world")') {
        return Promise.resolve('echo hello, friend beautiful world');
      }
      // Default fallback
      return Promise.resolve(input);
    });
    
    // Execute the directive
    await handler.execute(node, {
      state: stateService,
      workingDirectory: '/workspace',
      fileDirectory: '/workspace'
    });
    
    // Verify the parameters were correctly parsed
    expect(fileSystemService.executeCommand).toHaveBeenCalledWith(
      'echo hello, friend beautiful world',
      expect.objectContaining({ cwd: '/workspace' })
    );
  });
});