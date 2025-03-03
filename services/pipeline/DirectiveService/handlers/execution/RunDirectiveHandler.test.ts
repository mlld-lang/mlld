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
// Import the centralized syntax examples and helpers
import { runDirectiveExamples } from '@core/constants/syntax';
import { parse } from 'meld-ast';
import { ErrorSeverity } from '@core/errors';

// Mock child_process
vi.mock('child_process', () => ({
  exec: vi.fn()
}));

/**
 * RunDirectiveHandler Test Migration Status
 * ----------------------------------------
 * 
 * MIGRATION STATUS: In Progress
 * 
 * This test file is being migrated to use centralized syntax examples.
 * We'll migrate one test at a time to ensure everything continues to work.
 * 
 * See _issues/_active/test-syntax-centralization.md for migration details.
 */

// Direct usage of meld-ast instead of mock factories
const createRealParserService = () => {
  // Create the parse function
  const parseFunction = async (content: string): Promise<MeldNode[]> => {
    // Use the real meld-ast parser with dynamic import 
    try {
      const { parse } = await import('meld-ast');
      const result = await parse(content, {
        trackLocations: true,
        validateNodes: true,
        // @ts-expect-error - structuredPaths is used but may be missing from typings
        structuredPaths: true
      });
      return result.ast || [];
    } catch (error) {
      console.error('Error parsing with meld-ast:', error);
      throw error;
    }
  };
  
  // Create a spy for the parse function
  const parseSpy = vi.fn(parseFunction);
  
  return {
    parse: parseSpy,
    parseWithLocations: vi.fn(parseFunction)
  };
};

/**
 * Helper function to create a DirectiveNode from a syntax example code
 * This is needed for handler tests where you need a parsed node
 * 
 * @param exampleCode - Example code to parse
 * @returns Promise resolving to a DirectiveNode
 */
const createNodeFromExample = async (exampleCode: string): Promise<DirectiveNode> => {
  try {
    const { parse } = await import('meld-ast');
    
    const result = await parse(exampleCode, {
      trackLocations: true,
      validateNodes: true,
      // @ts-expect-error - structuredPaths is used but may be missing from typings
      structuredPaths: true
    });
    
    return result.ast[0] as DirectiveNode;
  } catch (error) {
    console.error('Error parsing with meld-ast:', error);
    throw error;
  }
};

// Helper function to create a directive node directly
async function createDirectiveNode(code: string): Promise<DirectiveNode> {
  const result = await parse(code, {
    trackLocations: true,
    validateNodes: true,
    structuredPaths: true
  });
  
  const nodes = result.ast || [];
  if (!nodes || nodes.length === 0) {
    throw new Error(`Failed to parse: ${code}`);
  }
  
  const directiveNode = nodes[0];
  if (directiveNode.type !== 'Directive') {
    throw new Error(`Did not produce a directive node: ${code}`);
  }
  
  return directiveNode as DirectiveNode;
}

// Helper to create a real run directive node using meld-ast
// Updated to use the correct syntax for @run directives (with brackets)
const createRealRunDirective = async (command: string, options: any = {}): Promise<DirectiveNode> => {
  // Use the correct syntax for @run directives with brackets
  const runText = options.output
    ? `@run { command = [${command}], output = "${options.output}" }`
    : `@run [${command}]`;
  
  return createDirectiveNode(runText);
};

// Migration Status: In progress - updating to use centralized syntax examples
// TODO: Convert more tests to use centralized examples

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
  let validationService: IValidationService;
  let stateService: IStateService;
  let resolutionService: IResolutionService;
  let fileSystemService: IFileSystemService;
  let clonedState: IStateService;

  beforeEach(() => {
    validationService = {
      validate: vi.fn(),
      registerValidator: vi.fn(),
      removeValidator: vi.fn(),
      hasValidator: vi.fn(),
      getRegisteredDirectiveKinds: vi.fn()
    } as unknown as IValidationService;

    clonedState = {
      setTextVar: vi.fn(),
      clone: vi.fn(),
      isTransformationEnabled: vi.fn().mockReturnValue(false)
    } as unknown as IStateService;

    stateService = {
      setTextVar: vi.fn(),
      clone: vi.fn().mockReturnValue(clonedState),
      isTransformationEnabled: vi.fn().mockReturnValue(false)
    } as unknown as IStateService;

    resolutionService = {
      resolveInContext: vi.fn()
    } as unknown as IResolutionService;

    fileSystemService = {
      getCwd: vi.fn().mockReturnValue('/workspace'),
      executeCommand: vi.fn(),
      dirname: vi.fn().mockReturnValue('/workspace'),
      join: vi.fn().mockImplementation((...args) => args.join('/')),
      normalize: vi.fn().mockImplementation(path => path)
    } as unknown as IFileSystemService;

    handler = new RunDirectiveHandler(
      validationService,
      resolutionService,
      stateService,
      fileSystemService
    );

    // Reset mocks
    vi.clearAllMocks();
  });

  describe('basic command execution', () => {
    it('should execute simple commands', async () => {
      // Create node directly with the correct syntax
      const node = await createDirectiveNode('@run [echo test]');
      const context = { currentFilePath: 'test.meld', state: stateService };

      const clonedState = {
        ...stateService,
        clone: vi.fn().mockReturnThis(),
        setTextVar: vi.fn(),
        isTransformationEnabled: vi.fn().mockReturnValue(false)
      };

      vi.mocked(stateService.clone).mockReturnValue(clonedState);
      vi.mocked(validationService.validate).mockResolvedValue(undefined);
      // Mock the resolution service to return the command
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
      expect(clonedState.setTextVar).toHaveBeenCalledWith('stdout', 'test output');
      expect(result.state).toBe(clonedState);
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
      // Create a directive with an empty command which will fail validation
      const node = await createDirectiveNode('@run []');
      const context = { currentFilePath: 'test.meld', state: stateService };

      const clonedState = {
        ...stateService,
        clone: vi.fn().mockReturnThis(),
        isTransformationEnabled: vi.fn().mockReturnValue(false)
      };

      vi.mocked(stateService.clone).mockReturnValue(clonedState);
      
      // Mock validation to throw an error
      const validationError = new DirectiveError({
        code: DirectiveErrorCode.VALIDATION_FAILED,
        message: 'Command cannot be empty',
        severity: ErrorSeverity.Fatal
      });
      vi.mocked(validationService.validate).mockRejectedValue(validationError);

      // Expect the error to be passed through
      await expect(handler.execute(node, context)).rejects.toThrow(validationError);
      
      // Expect that no command was executed
      expect(fileSystemService.executeCommand).not.toHaveBeenCalled();
    });

    it('should handle resolution errors', async () => {
      // Create a directive with an undefined variable
      const node = await createDirectiveNode('@run [{{undefined_var}}]');
      const context = { currentFilePath: 'test.meld', state: stateService };

      const clonedState = {
        ...stateService,
        clone: vi.fn().mockReturnThis(),
        isTransformationEnabled: vi.fn().mockReturnValue(false)
      };

      vi.mocked(stateService.clone).mockReturnValue(clonedState);
      vi.mocked(validationService.validate).mockResolvedValue(undefined);
      vi.mocked(resolutionService.resolveInContext).mockRejectedValue(new Error('Variable not found'));

      await expect(handler.execute(node, context)).rejects.toThrow('Variable not found');
    });

    it('should handle command execution errors', async () => {
      // Create a directive with an invalid command
      const node = await createDirectiveNode('@run [invalid-command]');
      const context = { currentFilePath: 'test.meld', state: stateService };

      const clonedState = {
        ...stateService,
        clone: vi.fn().mockReturnThis(),
        isTransformationEnabled: vi.fn().mockReturnValue(false)
      };

      vi.mocked(stateService.clone).mockReturnValue(clonedState);
      vi.mocked(validationService.validate).mockResolvedValue(undefined);
      vi.mocked(resolutionService.resolveInContext).mockResolvedValue('invalid-command');
      vi.mocked(fileSystemService.executeCommand).mockRejectedValue(new Error('Command failed'));

      await expect(handler.execute(node, context)).rejects.toThrow('Command failed');
    });
  });

  describe('output handling', () => {
    it('should handle stdout and stderr', async () => {
      // Create a directive that will generate stderr output
      const node = await createDirectiveNode('@run [echo error >&2]');
      const context = { currentFilePath: 'test.meld', state: stateService };

      const clonedState = {
        ...stateService,
        clone: vi.fn().mockReturnThis(),
        setTextVar: vi.fn(),
        isTransformationEnabled: vi.fn().mockReturnValue(false)
      };

      vi.mocked(stateService.clone).mockReturnValue(clonedState);
      vi.mocked(validationService.validate).mockResolvedValue(undefined);
      vi.mocked(resolutionService.resolveInContext).mockResolvedValue('echo error >&2');
      vi.mocked(fileSystemService.executeCommand).mockResolvedValue({
        stdout: '',
        stderr: 'error message'
      });

      const result = await handler.execute(node, context);

      expect(clonedState.setTextVar).toHaveBeenCalledWith('stdout', '');
      expect(clonedState.setTextVar).toHaveBeenCalledWith('stderr', 'error message');
    });

    it('should handle transformation mode', async () => {
      // Create a directive for transformation mode
      const node = await createDirectiveNode('@run [echo test]');
      const context = { currentFilePath: 'test.meld', state: stateService };

      const clonedState = {
        ...stateService,
        clone: vi.fn().mockReturnThis(),
        setTextVar: vi.fn(),
        transformNode: vi.fn(),
        isTransformationEnabled: vi.fn().mockReturnValue(true)
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
      expect(clonedState.setTextVar).toHaveBeenCalledWith('stdout', 'test output');
      expect(result.state).toBe(clonedState);
      expect(result.replacement).toEqual(expect.objectContaining({
        type: 'Text',
        content: 'test output'
      }));
    });
  });
});