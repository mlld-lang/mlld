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

import { describe, it, expect, beforeEach, vi } from 'vitest';
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
import { getExample, getInvalidExample } from '@tests/utils/syntax-test-helpers.js';
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

// Helper to create a real run directive node using meld-ast
const createRealRunDirective = async (command: string, options: any = {}): Promise<DirectiveNode> => {
  const runText = `@run [ command = "${command}"${options.output ? `, output = "${options.output}"` : ''} ]`;
  
  const { parse } = await import('meld-ast');
  const result = await parse(runText, {
    trackLocations: true,
    validateNodes: true,
    // @ts-expect-error - structuredPaths is used but may be missing from typings
    structuredPaths: true
  });
  
  const nodes = result.ast || [];
  // The first node should be our run directive
  const directiveNode = nodes[0] as DirectiveNode;
  
  // Ensure the output property is explicitly set in the directive
  if (options.output && directiveNode.directive) {
    directiveNode.directive.output = options.output;
  }
  
  return directiveNode;
};

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
      // MIGRATION NOTE: Using centralized syntax example instead of createRealRunDirective
      // Get the simple example from centralized syntax
      const example = getExample('run', 'atomic', 'simple');
      const node = await createNodeFromExample(example.code);
      const context = { currentFilePath: 'test.meld', state: stateService };

      const clonedState = {
        ...stateService,
        clone: vi.fn().mockReturnThis(),
        setTextVar: vi.fn(),
        isTransformationEnabled: vi.fn().mockReturnValue(false)
      };

      vi.mocked(stateService.clone).mockReturnValue(clonedState);
      vi.mocked(validationService.validate).mockResolvedValue(undefined);
      // Mock the resolution service to return the command extracted from the example
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
      // MIGRATION NOTE: Using centralized syntax example instead of createRealRunDirective
      // Get the simple example from centralized syntax
      const example = getExample('run', 'atomic', 'simple');
      const node = await createNodeFromExample(example.code);
      const context = { currentFilePath: 'test.meld', state: stateService };

      const clonedState = {
        ...stateService,
        clone: vi.fn().mockReturnThis(),
        setTextVar: vi.fn(),
        getTextVar: vi.fn().mockReturnValue('Hello'),
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
      expect(clonedState.setTextVar).toHaveBeenCalledWith('stdout', 'test output');
      expect(result.state).toBe(clonedState);
    });

    it('should handle custom output variable', async () => {
      // MIGRATION NOTE: Using centralized syntax example instead of createRealRunDirective
      // Get the withOutput example from centralized syntax
      const example = getExample('run', 'atomic', 'withOutput');
      const node = await createNodeFromExample(example.code);
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
      const node = await createRealRunDirective('');
      const context = { 
        currentFilePath: 'test.meld', 
        state: stateService,
        workingDirectory: '/workspace'
      };

      vi.mocked(validationService.validate).mockRejectedValueOnce(
        new DirectiveError('Invalid command', 'run', DirectiveErrorCode.VALIDATION_FAILED)
      );

      await expect(handler.execute(node, context)).rejects.toThrow(DirectiveError);
      expect(fileSystemService.executeCommand).not.toHaveBeenCalled();
    });

    it('should handle resolution errors', async () => {
      const node = await createRealRunDirective('{{undefined_var}}');
      const context = { 
        currentFilePath: 'test.meld', 
        state: stateService,
        workingDirectory: '/workspace'
      };

      vi.mocked(resolutionService.resolveInContext).mockRejectedValueOnce(
        new Error('Variable not found')
      );

      await expect(handler.execute(node, context)).rejects.toThrow(DirectiveError);
      expect(fileSystemService.executeCommand).not.toHaveBeenCalled();
    });

    it('should handle command execution errors', async () => {
      const node = await createRealRunDirective('invalid-command');
      const context = { 
        currentFilePath: 'test.meld', 
        state: stateService,
        workingDirectory: '/workspace'
      };

      vi.mocked(resolutionService.resolveInContext).mockResolvedValueOnce('invalid-command');
      vi.mocked(fileSystemService.executeCommand).mockRejectedValueOnce(
        new Error('Command failed')
      );

      await expect(handler.execute(node, context)).rejects.toThrow(DirectiveError);
      expect(clonedState.setTextVar).not.toHaveBeenCalled();
    });
  });

  describe('output handling', () => {
    it('should handle stdout and stderr', async () => {
      const node = await createRealRunDirective('echo error >&2');
      const context = {
        currentFilePath: 'test.meld',
        state: stateService,
        parentState: undefined
      };

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
        stderr: 'error output'
      });

      const result = await handler.execute(node, context);

      expect(stateService.clone).toHaveBeenCalled();
      expect(clonedState.setTextVar).toHaveBeenCalledWith('stdout', '');
      expect(clonedState.setTextVar).toHaveBeenCalledWith('stderr', 'error output');
      expect(result.state).toBe(clonedState);
    });

    it('should handle transformation mode', async () => {
      const node = await createRealRunDirective('echo test');
      const context = {
        currentFilePath: 'test.meld',
        state: stateService,
        parentState: undefined
      };

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

      expect(clonedState.setTextVar).toHaveBeenCalledWith('stdout', 'test output');
      expect(result.replacement).toEqual(expect.objectContaining({
        type: 'Text',
        content: 'test output'
      }));
    });
  });
});