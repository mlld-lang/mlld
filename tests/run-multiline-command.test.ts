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
const createRunDirectiveNode = (options: any): DirectiveNode => {
  return {
    type: 'Directive',
    directive: {
      kind: 'run',
      ...options
    },
    location: { line: 1, column: 1 }
  } as DirectiveNode;
};

describe('RunDirectiveHandler with multi-line commands', () => {
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
      if (name === 'message') return 'Hello world';
      return '';
    });
    
    // Mock file system service to avoid real command execution
    fileSystemService.executeCommand.mockResolvedValue({
      stdout: 'mocked command output',
      stderr: ''
    });
    fileSystemService.getCwd.mockReturnValue('/workspace');
    fileSystemService.writeFile.mockResolvedValue(undefined);
    
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
  
  it('should handle basic multi-line run directives', async () => {
    // Create a multi-line run directive node
    const content = 'echo "Line 1"\necho "Line 2"';
    const node = createRunDirectiveNode({
      command: content,
      isMultiLine: true
    });
    
    // Mock validation
    validationService.validate.mockResolvedValue(undefined);
    
    // Execute the directive
    await handler.execute(node, {
      state: stateService,
      workingDirectory: '/workspace',
      fileDirectory: '/workspace'
    });
    
    // Verify a temporary script was created and executed
    expect(fileSystemService.writeFile).toHaveBeenCalledWith(
      expect.stringMatching(/\/tmp\/meld-script-\d+\.sh/),
      expect.stringContaining('echo "Line 1"\necho "Line 2"')
    );
    
    // Verify the script was executed
    expect(fileSystemService.executeCommand).toHaveBeenCalledWith(
      expect.stringMatching(/\/tmp\/meld-script-\d+\.sh/),
      expect.objectContaining({ cwd: '/workspace' })
    );
    
    // Verify the output was stored in state variables
    expect(clonedState.setTextVar).toHaveBeenCalledWith('stdout', 'mocked command output');
  });

  it('should handle multi-line run directives with language indicator', async () => {
    // Create a multi-line run directive node with language indicator
    const content = 'console.log("Hello world");';
    const node = createRunDirectiveNode({
      command: content,
      isMultiLine: true,
      language: 'javascript'
    });
    
    // Mock validation
    validationService.validate.mockResolvedValue(undefined);
    
    // Execute the directive
    await handler.execute(node, {
      state: stateService,
      workingDirectory: '/workspace',
      fileDirectory: '/workspace'
    });
    
    // Verify a temporary JavaScript file was created
    expect(fileSystemService.writeFile).toHaveBeenCalledWith(
      expect.stringMatching(/\/tmp\/meld-script-\d+\.js/),
      expect.stringContaining('console.log("Hello world");')
    );
    
    // Verify the script was executed with the correct interpreter
    expect(fileSystemService.executeCommand).toHaveBeenCalledWith(
      expect.stringMatching(/node \/tmp\/meld-script-\d+\.js/),
      expect.objectContaining({ cwd: '/workspace' })
    );
  });

  it('should handle multi-line run directives with parameters', async () => {
    // Create a multi-line run directive node with parameters
    const content = 'echo "Passed parameter: $1"';
    const node = createRunDirectiveNode({
      command: content,
      isMultiLine: true,
      parameters: [
        {
          type: 'VariableReference',
          identifier: 'message',
          valueType: 'text',
          isVariableReference: true
        }
      ]
    });
    
    // Mock validation
    validationService.validate.mockResolvedValue(undefined);
    
    // Execute the directive
    await handler.execute(node, {
      state: stateService,
      workingDirectory: '/workspace',
      fileDirectory: '/workspace'
    });
    
    // Verify a temporary script was created
    expect(fileSystemService.writeFile).toHaveBeenCalledWith(
      expect.stringMatching(/\/tmp\/meld-script-\d+\.sh/),
      expect.stringContaining('echo "Passed parameter: $1"')
    );
    
    // Verify the script was executed with the parameter
    expect(fileSystemService.executeCommand).toHaveBeenCalledWith(
      expect.stringMatching(/\/tmp\/meld-script-\d+\.sh "Hello world"/),
      expect.objectContaining({ cwd: '/workspace' })
    );
  });

  it('should handle multi-line run directives with both language and parameters', async () => {
    // Create a multi-line run directive node with both language and parameters
    const content = 'echo "Passed parameter: $1"';
    const node = createRunDirectiveNode({
      command: content,
      isMultiLine: true,
      language: 'bash',
      parameters: [
        {
          type: 'VariableReference',
          identifier: 'message',
          valueType: 'text',
          isVariableReference: true
        }
      ]
    });
    
    // Mock validation
    validationService.validate.mockResolvedValue(undefined);
    
    // Execute the directive
    await handler.execute(node, {
      state: stateService,
      workingDirectory: '/workspace',
      fileDirectory: '/workspace'
    });
    
    // Verify a temporary script was created
    expect(fileSystemService.writeFile).toHaveBeenCalledWith(
      expect.stringMatching(/\/tmp\/meld-script-\d+\.sh/),
      expect.stringContaining('echo "Passed parameter: $1"')
    );
    
    // Verify the script was executed with the correct parameters
    expect(fileSystemService.executeCommand).toHaveBeenCalledWith(
      expect.stringMatching(/\/tmp\/meld-script-\d+\.sh "Hello world"/),
      expect.objectContaining({ cwd: '/workspace' })
    );
  });
});