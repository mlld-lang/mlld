// Mock the logger before any imports
const mockLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn()
};

vi.mock('../../../../core/utils/logger', () => ({
  directiveLogger: mockLogger
}));

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { RunDirectiveHandler } from './RunDirectiveHandler.js';
import type { DirectiveNode, MeldNode } from 'meld-spec';
import type { IValidationService } from '@services/resolution/ValidationService/IValidationService.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
import { DirectiveError, DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import { exec } from 'child_process';
import { promisify } from 'util';
// Import the centralized syntax examples and helpers but don't use the problematic syntax-test-helpers
import { runDirectiveExamples } from '@core/syntax/index.js';
import { parse } from 'meld-ast';
import { ErrorSeverity } from '@core/errors';
import { TestContextDI } from '@tests/utils/di/TestContextDI';

// Mock child_process
vi.mock('child_process', () => ({
  exec: vi.fn()
}));

/**
 * RunDirectiveHandler Test Migration Status
 * ----------------------------------------
 * 
 * MIGRATION STATUS: Completed
 * 
 * This test file has been updated to use TestContextDI for dependency injection.
 * 
 * COMPLETED:
 * - Using TestContextDI for test environment setup
 * - Using a hybrid approach with direct handler instantiation
 * - Added proper cleanup for container management
 * - Enhanced with centralized syntax examples
 * - No longer relies on syntax-test-helpers
 */

// Direct usage of meld-ast instead of mock factories
const createRealParserService = () => {
  // Create the parse function
  const parseFunction = async (content: string): Promise<MeldNode[]> => {
    // Use the real meld-ast parser with dynamic import 
    try {
      return await parse(content, {
        trackLocations: true,
        validateNodes: true
      });
    } catch (error) {
      console.error('Parser error:', error);
      throw error;
    }
  };

  return {
    parse: parseFunction
  };
};

// Helper to create a DirectiveNode directly from example code
async function createDirectiveNode(code: string): Promise<DirectiveNode> {
  try {
    const result = await parse(code, {
      trackLocations: true,
      validateNodes: true
    });
    
    // The parse function might return an AST property
    const nodes = Array.isArray(result) ? result : (result.ast || []);
    
    if (nodes.length === 0 || nodes[0].type !== 'Directive') {
      throw new Error(`Failed to parse directive from code: ${code}`);
    }
    
    return nodes[0] as DirectiveNode;
  } catch (error) {
    console.error('Error creating directive node:', error);
    throw error;
  }
}

// Helper to create a run directive node directly without parsing
const createRunDirectiveNode = (command: string, outputVar?: string): DirectiveNode => {
  return {
    type: 'Directive',
    directive: {
      kind: 'run',
      command,
      output: outputVar
    }
  } as DirectiveNode;
};

// Helper function to create parser services for testing
function createServices() {
  const validationService = {
    validate: vi.fn()
  };

  const resolutionService = {
    resolveInContext: vi.fn()
  };

  const fileSystemService = {
    executeCommand: vi.fn(),
    getWorkspacePath: vi.fn().mockReturnValue('/workspace')
  };

  return {
    validationService,
    resolutionService,
    fileSystemService
  };
}

describe('RunDirectiveHandler', () => {
  let handler: RunDirectiveHandler;
  let validationService: any;
  let stateService: any;
  let resolutionService: any;
  let fileSystemService: any;
  let clonedState: any;
  let context: TestContextDI;

  beforeEach(() => {
    // Create context with isolated container
    context = TestContextDI.create({ isolatedContainer: true });
    
    validationService = {
      validate: vi.fn(),
      registerValidator: vi.fn(),
      removeValidator: vi.fn(),
      hasValidator: vi.fn(),
      getRegisteredDirectiveKinds: vi.fn()
    };

    clonedState = {
      setTextVar: vi.fn(),
      clone: vi.fn(),
      isTransformationEnabled: vi.fn().mockReturnValue(false),
      transformNode: vi.fn()
    };

    stateService = {
      setTextVar: vi.fn(),
      clone: vi.fn().mockReturnValue(clonedState),
      isTransformationEnabled: vi.fn().mockReturnValue(false)
    };

    resolutionService = {
      resolveInContext: vi.fn()
    };

    fileSystemService = {
      getCwd: vi.fn().mockReturnValue('/workspace'),
      executeCommand: vi.fn(),
      dirname: vi.fn().mockReturnValue('/workspace'),
      join: vi.fn().mockImplementation((...args) => args.join('/')),
      normalize: vi.fn().mockImplementation(path => path)
    };

    // Instead of using the container to resolve the handler,
    // create the handler directly with the mocks
    handler = new RunDirectiveHandler(
      validationService,
      resolutionService,
      stateService,
      fileSystemService
    );

    // Reset mocks
    vi.clearAllMocks();
  });

  afterEach(async () => {
    // Cleanup to prevent container leaks
    await context.cleanup();
  });

  describe('basic command execution', () => {
    it('should execute simple commands', async () => {
      // Create node directly without relying on the parser
      const node = createRunDirectiveNode('echo test');
      const context = { 
        currentFilePath: 'test.meld', 
        state: stateService,
        workingDirectory: '/workspace'
      };
      
      // Mock the command execution response
      vi.mocked(fileSystemService.executeCommand).mockResolvedValue({
        stdout: 'command output',
        stderr: '',
        exitCode: 0
      });

      // We need to mock this differently, string commands are handled differently
      vi.mocked(resolutionService.resolveInContext).mockResolvedValue('echo test');
      
      // Execute the directive
      await handler.execute(node, context);
      
      // Verify that the command was executed correctly
      expect(fileSystemService.executeCommand).toHaveBeenCalledWith('echo test', {
        cwd: '/workspace'
      });
    });

    it('should handle commands with variables', async () => {
      // Create a directive node directly without parsing
      const node = createRunDirectiveNode('echo {{greeting}} {{name}}');
      const context = { 
        currentFilePath: 'test.meld', 
        state: stateService,
        workingDirectory: '/workspace'
      };
      
      // Mock variable resolution - the actual handler calls resolveInContext directly with the command string
      vi.mocked(resolutionService.resolveInContext).mockResolvedValue('echo Hello World');
      
      // Mock command execution
      vi.mocked(fileSystemService.executeCommand).mockResolvedValue({
        stdout: 'Hello World',
        stderr: '',
        exitCode: 0
      });
      
      // Execute the directive
      await handler.execute(node, context);
      
      // Verify the command was executed with resolved variables
      expect(fileSystemService.executeCommand).toHaveBeenCalledWith('echo Hello World', {
        cwd: '/workspace'
      });
    });

    it('should handle custom output variable', async () => {
      // Create a node that captures output to a variable
      const node = createRunDirectiveNode('echo test', 'variable_name');
      
      const context = { 
        currentFilePath: 'test.meld', 
        state: stateService,
        workingDirectory: '/workspace'
      };
      
      // Mock variable resolution and command execution
      vi.mocked(resolutionService.resolveInContext).mockResolvedValue('echo test');
      vi.mocked(fileSystemService.executeCommand).mockResolvedValue({
        stdout: 'command output',
        stderr: '',
        exitCode: 0
      });
      
      // Execute the directive
      await handler.execute(node, context);
      
      // Verify the output was captured in the variable
      expect(clonedState.setTextVar).toHaveBeenCalledWith('variable_name', 'command output');
    });

    it('should handle commands with variables', async () => {
      // Create node directly with the correct syntax
      const node = await createDirectiveNode('@run [echo {{greeting}}, {{name}}!]');
      const context = { currentFilePath: 'test.meld', state: stateService };

      const clonedState = {
        ...stateService,
        clone: vi.fn().mockReturnThis(),
        setTextVar: vi.fn(),
        getTextVar: vi.fn(),
        isTransformationEnabled: vi.fn().mockReturnValue(false)
      };

      // Setup mocks to return values for greeting and name
      clonedState.getTextVar.mockImplementation((key) => {
        if (key === 'greeting') return 'Hello';
        if (key === 'name') return 'World';
        return undefined;
      });

      vi.mocked(stateService.clone).mockReturnValue(clonedState);
      vi.mocked(validationService.validate).mockResolvedValue(undefined);
      vi.mocked(resolutionService.resolveInContext).mockResolvedValue('echo Hello, World!');
      vi.mocked(fileSystemService.executeCommand).mockResolvedValue({
        stdout: 'test output',
        stderr: ''
      });

      const result = await handler.execute(node, context);

      // The handler should be using the cloned state, not the original context
      expect(resolutionService.resolveInContext).toHaveBeenCalled();
      
      // Just verify that the command is executed correctly
      expect(fileSystemService.executeCommand).toHaveBeenCalledWith(
        'echo Hello, World!',
        expect.objectContaining({ cwd: '/workspace' })
      );
    });

    it('should handle custom output variable', async () => {
      // Instead of using createRealRunDirective, create a node directly
      // This bypasses the createRealRunDirective function which is using problematic syntax
      const node = {
        type: 'Directive',
        directive: {
          kind: 'run',
          identifier: 'run',
          command: 'echo test',
          output: 'variable_name'
        },
        location: {
          start: { line: 1, column: 1, offset: 0 },
          end: { line: 1, column: 20, offset: 19 }
        }
      } as DirectiveNode;
      
      const context = { currentFilePath: 'test.meld', state: stateService };

      const clonedState = {
        ...stateService,
        clone: vi.fn().mockReturnThis(),
        setTextVar: vi.fn(),
        isTransformationEnabled: vi.fn().mockReturnValue(false)
      };

      vi.mocked(stateService.clone).mockReturnValue(clonedState);
      vi.mocked(validationService.validate).mockResolvedValue(undefined);
      vi.mocked(resolutionService.resolveInContext).mockResolvedValue('echo test');
      vi.mocked(fileSystemService.executeCommand).mockResolvedValue({
        stdout: 'test output',
        stderr: ''
      });

      const result = await handler.execute(node, context);

      expect(fileSystemService.executeCommand).toHaveBeenCalledWith(
        'echo test',
        expect.objectContaining({ cwd: '/workspace' })
      );
      expect(clonedState.setTextVar).toHaveBeenCalledWith('variable_name', 'test output');
      expect(result.state).toBe(clonedState);
    });
  });

  describe('error handling', () => {
    it('should handle validation errors', async () => {
      // Create an empty run command that would trigger validation errors
      const node = createRunDirectiveNode('');
      const context = { 
        currentFilePath: 'test.meld', 
        state: stateService,
        workingDirectory: '/workspace'
      };
      
      vi.mocked(validationService.validate).mockRejectedValue(
        new DirectiveError(
          'Invalid command',
          DirectiveErrorCode.InvalidCommand,
          ErrorSeverity.Error
        )
      );
      
      // Verify the error is properly thrown and handled
      await expect(handler.execute(node, context)).rejects.toThrow(DirectiveError);
    });

    it('should handle resolution errors', async () => {
      // Create a run command with an undefined variable
      const node = createRunDirectiveNode('{{undefined_var}}');
      const context = { 
        currentFilePath: 'test.meld', 
        state: stateService,
        workingDirectory: '/workspace'
      };
      
      vi.mocked(validationService.validate).mockResolvedValue(undefined);
      vi.mocked(resolutionService.resolveInContext).mockRejectedValue(
        new Error('Variable not found')
      );
      
      // Verify the error is properly thrown and handled
      await expect(handler.execute(node, context)).rejects.toThrow();
    });

    it('should handle command execution errors', async () => {
      // Create a node for a command that will fail
      const node = createRunDirectiveNode('invalid-command');
      const context = { 
        currentFilePath: 'test.meld', 
        state: stateService,
        workingDirectory: '/workspace'
      };
      
      vi.mocked(validationService.validate).mockResolvedValue(undefined);
      vi.mocked(resolutionService.resolveInContext).mockResolvedValue('invalid-command');
      vi.mocked(fileSystemService.executeCommand).mockRejectedValue(
        new Error('Command failed')
      );
      
      // Verify the error is properly thrown and handled
      await expect(handler.execute(node, context)).rejects.toThrow();
      expect(fileSystemService.executeCommand).toHaveBeenCalledWith('invalid-command', {
        cwd: '/workspace'
      });
    });
  });

  describe('output handling', () => {
    it('should handle stdout and stderr', async () => {
      const node = createRunDirectiveNode('echo error >&2');
      const context = { 
        currentFilePath: 'test.meld', 
        state: stateService,
        workingDirectory: '/workspace'
      };
      
      vi.mocked(validationService.validate).mockResolvedValue(undefined);
      vi.mocked(resolutionService.resolveInContext).mockResolvedValue('echo error >&2');
      vi.mocked(fileSystemService.executeCommand).mockResolvedValue({
        stdout: '',
        stderr: 'error message',
        exitCode: 0
      });
      
      await handler.execute(node, context);
      
      expect(clonedState.setTextVar).toHaveBeenCalledWith('stdout', '');
      expect(clonedState.setTextVar).toHaveBeenCalledWith('stderr', 'error message');
    });

    it('should handle transformation mode', async () => {
      const node = createRunDirectiveNode('echo test');
      const context = { 
        currentFilePath: 'test.meld', 
        state: stateService,
        workingDirectory: '/workspace'
      };
      
      vi.mocked(validationService.validate).mockResolvedValue(undefined);
      vi.mocked(resolutionService.resolveInContext).mockResolvedValue('echo test');
      vi.mocked(fileSystemService.executeCommand).mockResolvedValue({
        stdout: 'transformed output',
        stderr: '',
        exitCode: 0
      });
      
      // In transformation mode, the result should contain the output
      vi.mocked(stateService.isTransformationEnabled).mockReturnValue(false);
      vi.mocked(clonedState.isTransformationEnabled).mockReturnValue(true);
      
      const result = await handler.execute(node, context);
      
      expect(result.replacement).toEqual(expect.objectContaining({
        type: 'Text',
        content: 'transformed output'
      }));
    });
  });
});