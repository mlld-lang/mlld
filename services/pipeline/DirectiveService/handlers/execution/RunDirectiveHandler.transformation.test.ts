import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { DirectiveNode, DirectiveContext } from '@core/syntax/types.js';
import { RunDirectiveHandler } from '@services/pipeline/DirectiveService/handlers/execution/RunDirectiveHandler.js';
import type { IValidationService } from '@services/resolution/ValidationService/IValidationService.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
import { createRunDirective, createLocation } from '@tests/utils/testFactories.js';
import { TestContextDI } from '@tests/utils/di/TestContextDI.js';
import {
  createValidationServiceMock,
  createStateServiceMock,
  createResolutionServiceMock,
  createFileSystemServiceMock,
  createDirectiveErrorMock
} from '@tests/utils/mocks/serviceMocks.js';

/**
 * RunDirectiveHandler Transformation Test Status
 * -----------------------------------------------
 * 
 * MIGRATION STATUS: Complete
 * 
 * This test file has been fully migrated to use:
 * - TestContextDI for container management
 * - Standardized mock factories with vitest-mock-extended
 * - Direct constructor injection for handler instantiation
 * - Proper cleanup to prevent container leaks
 */

describe('RunDirectiveHandler Transformation', () => {
  let handler: RunDirectiveHandler;
  let validationService: ReturnType<typeof createValidationServiceMock>;
  let stateService: ReturnType<typeof createStateServiceMock>;
  let resolutionService: ReturnType<typeof createResolutionServiceMock>;
  let fileSystemService: ReturnType<typeof createFileSystemServiceMock>;
  let clonedState: any;
  let context: TestContextDI;

  beforeEach(() => {
    // Create context with isolated container
    context = TestContextDI.create({ isolatedContainer: true });
    
    // Create mocks using standardized factories
    validationService = createValidationServiceMock();
    stateService = createStateServiceMock();
    resolutionService = createResolutionServiceMock();
    fileSystemService = createFileSystemServiceMock();

    clonedState = {
      setTextVar: vi.fn(),
      clone: vi.fn().mockReturnThis(),
      isTransformationEnabled: vi.fn().mockReturnValue(true),
      transformNode: vi.fn()
    };

    // Configure mock behaviors
    stateService.clone.mockReturnValue(clonedState);
    stateService.isTransformationEnabled.mockReturnValue(true);
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

  describe('transformation behavior', () => {
    it('should return replacement node with command output when transformation enabled', async () => {
      const node = createRunDirective('echo test', createLocation(1, 1));
      const context = { currentFilePath: 'test.meld', state: stateService };

      validationService.validate.mockResolvedValue(undefined);
      resolutionService.resolveInContext.mockResolvedValue('echo test');
      fileSystemService.executeCommand.mockResolvedValue({
        stdout: 'test output',
        stderr: ''
      });

      const result = await handler.execute(node, context);

      expect(result.replacement).toBeDefined();
      expect(result.replacement).toMatchObject({
        type: 'Text',
        content: 'test output',
        location: node.location,
        formattingMetadata: {
          isFromDirective: true,
          originalNodeType: 'Directive',
          preserveFormatting: true,
          isOutputLiteral: true,
          transformationMode: true
        }
      });
      expect(result.state).toBe(clonedState);
    });

    it('should handle variable interpolation in command during transformation', async () => {
      const node = createRunDirective('echo {{message}}', createLocation(1, 1));
      const context = { currentFilePath: 'test.meld', state: stateService };

      validationService.validate.mockResolvedValue(undefined);
      resolutionService.resolveInContext.mockResolvedValue('echo Hello World');
      fileSystemService.executeCommand.mockResolvedValue({
        stdout: 'Hello World',
        stderr: ''
      });

      const result = await handler.execute(node, context);

      expect(result.replacement).toBeDefined();
      expect(result.replacement).toMatchObject({
        type: 'Text',
        content: 'Hello World',
        location: node.location,
        formattingMetadata: {
          isFromDirective: true,
          originalNodeType: 'Directive',
          preserveFormatting: true,
          isOutputLiteral: true,
          transformationMode: true
        }
      });
      expect(result.state).toBe(clonedState);
    });

    it('should handle stderr output in transformation', async () => {
      const node = createRunDirective('echo error >&2', createLocation(1, 1));
      const context = { currentFilePath: 'test.meld', state: stateService };

      validationService.validate.mockResolvedValue(undefined);
      resolutionService.resolveInContext.mockResolvedValue('echo error >&2');
      fileSystemService.executeCommand.mockResolvedValue({
        stdout: '',
        stderr: 'error output'
      });

      const result = await handler.execute(node, context);

      expect(result.replacement).toBeDefined();
      expect(result.replacement).toMatchObject({
        type: 'Text',
        content: 'error output',
        location: node.location,
        formattingMetadata: {
          isFromDirective: true,
          originalNodeType: 'Directive',
          preserveFormatting: true,
          isOutputLiteral: true,
          transformationMode: true
        }
      });
      expect(result.state).toBe(clonedState);
    });

    it('should handle both stdout and stderr in transformation', async () => {
      const node = createRunDirective('echo test && echo error >&2', createLocation(1, 1));
      const context = { currentFilePath: 'test.meld', state: stateService };

      validationService.validate.mockResolvedValue(undefined);
      resolutionService.resolveInContext.mockResolvedValue('echo test && echo error >&2');
      fileSystemService.executeCommand.mockResolvedValue({
        stdout: 'test output',
        stderr: 'error output'
      });

      const result = await handler.execute(node, context);

      expect(result.replacement).toBeDefined();
      expect(result.replacement).toMatchObject({
        type: 'Text',
        content: 'test output\nerror output',
        location: node.location,
        formattingMetadata: {
          isFromDirective: true,
          originalNodeType: 'Directive',
          preserveFormatting: true,
          isOutputLiteral: true,
          transformationMode: true
        }
      });
      expect(result.state).toBe(clonedState);
    });

    it('should preserve error handling during transformation', async () => {
      const node = createRunDirective('invalid-command', createLocation(1, 1));
      const context = { currentFilePath: 'test.meld', state: stateService };

      validationService.validate.mockResolvedValue(undefined);
      resolutionService.resolveInContext.mockResolvedValue('invalid-command');
      fileSystemService.executeCommand.mockRejectedValue(new Error('Command failed'));

      await expect(handler.execute(node, context)).rejects.toThrow('Failed to execute command: Command failed');
    });
  });
}); 