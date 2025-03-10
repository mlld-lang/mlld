import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { PathDirectiveHandler } from './PathDirectiveHandler.js';
import { createPathDirective, createLocation } from '@tests/utils/testFactories.js';
import type { IValidationService } from '@services/resolution/ValidationService/IValidationService.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import type { DirectiveNode } from '../../../../node_modules/meld-spec/dist/types.js';
import { DirectiveError } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import { pathDirectiveExamples } from '@core/syntax/index.js';
import { createNodeFromExample } from '@core/syntax/helpers';
import { TestContextDI } from '@tests/utils/di/TestContextDI';
import { 
  createValidationServiceMock, 
  createStateServiceMock, 
  createResolutionServiceMock,
  createDirectiveErrorMock
} from '@tests/utils/mocks/serviceMocks';

/**
 * PathDirectiveHandler Test Status
 * --------------------------------
 * 
 * MIGRATION STATUS: Complete
 * 
 * This test file has been fully migrated to use centralized syntax examples and standardized mock factories.
 * 
 * COMPLETED:
 * - All "basic path handling" tests successfully migrated to use centralized examples
 * - Removed dependency on syntax-test-helpers.js
 * - Using centralized createNodeFromExample helper
 * - Updated to use standardized mock factories with vitest-mock-extended
 * 
 * NOTES:
 * - Error handling tests continue to use createPathDirective since the parser rejects 
 *   truly invalid syntax before the handler gets to process it, making it difficult
 *   to test validation error handling with actual invalid syntax examples.
 */

describe('PathDirectiveHandler', () => {
  let handler: PathDirectiveHandler;
  let validationService: ReturnType<typeof createValidationServiceMock>;
  let stateService: ReturnType<typeof createStateServiceMock>;
  let resolutionService: ReturnType<typeof createResolutionServiceMock>;
  let clonedState: any;
  let context: TestContextDI;

  beforeEach(() => {
    // Create context with isolated container
    context = TestContextDI.create({ isolatedContainer: true });
    
    // Create cloned state
    clonedState = {
      setPathVar: vi.fn(),
      clone: vi.fn()
    };

    // Create mock services using standardized factories
    validationService = createValidationServiceMock();
    stateService = createStateServiceMock();
    resolutionService = createResolutionServiceMock();
    
    // Configure mock behaviors
    stateService.clone.mockReturnValue(clonedState);
    
    // Create PathDirectiveHandler instance
    handler = new PathDirectiveHandler(
      validationService,
      stateService,
      resolutionService
    );
  });

  afterEach(async () => {
    await context.cleanup();
  });

  describe('basic path handling', () => {
    it('should process simple paths', async () => {
      // MIGRATION INSIGHTS:
      // When using centralized examples, the handler now receives a structured path object
      // instead of a simple string.
      const example = pathDirectiveExamples.atomic.projectPath;
      const node = await createNodeFromExample(example.code);
      const testContext = { currentFilePath: 'test.meld', state: stateService };

      // The path value is now a structured object
      const pathValue = "$PROJECTPATH/docs";
      vi.mocked(resolutionService.resolveInContext).mockResolvedValueOnce(pathValue);

      const result = await handler.execute(node, testContext);

      expect(validationService.validate).toHaveBeenCalledWith(node);
      expect(stateService.clone).toHaveBeenCalled();
      // Use expect.objectContaining instead of expect.any to match the structure
      expect(resolutionService.resolveInContext).toHaveBeenCalledWith(
        expect.objectContaining({
          structured: expect.objectContaining({
            base: "$PROJECTPATH",
            segments: expect.arrayContaining(["docs"])
          })
        }),
        expect.any(Object)
      );
      expect(clonedState.setPathVar).toHaveBeenCalledWith('docs', pathValue);
      expect(result).toBe(clonedState);
    });

    it('should handle paths with variables', async () => {
      // MIGRATION: Using the pathWithVariables example from combinations category
      // Note: This contains two directives - a text variable definition and a path that uses it
      const exampleSet = pathDirectiveExamples.combinations.pathWithVariables;
      // We specifically want the second line which is the path directive
      const exampleLines = exampleSet.code.split('\n');
      const pathDirectiveLine = exampleLines[1]; // Get just the path directive line
      
      const node = await createNodeFromExample(pathDirectiveLine);
      const testContext = { currentFilePath: 'test.meld', state: stateService };

      // Mock the resolution with the variable replaced
      const resolvedPath = "$PROJECTPATH/meld/docs";  
      vi.mocked(resolutionService.resolveInContext).mockResolvedValueOnce(resolvedPath);

      const result = await handler.execute(node, testContext);

      expect(stateService.clone).toHaveBeenCalled();
      expect(resolutionService.resolveInContext).toHaveBeenCalledWith(
        expect.objectContaining({
          structured: expect.objectContaining({
            base: "$PROJECTPATH",
            segments: expect.arrayContaining(["{{project}}", "docs"])
          })
        }),
        expect.any(Object)
      );
      expect(clonedState.setPathVar).toHaveBeenCalledWith('customPath', resolvedPath);
      expect(result).toBe(clonedState);
    });

    it('should handle relative paths', async () => {
      // MIGRATION: Using the relativePath example from atomic category
      const example = pathDirectiveExamples.atomic.relativePath;
      const node = await createNodeFromExample(example.code);
      const testContext = { currentFilePath: 'test.meld', state: stateService };

      const pathValue = "$./config";
      vi.mocked(resolutionService.resolveInContext).mockResolvedValueOnce(pathValue);

      const result = await handler.execute(node, testContext);

      expect(stateService.clone).toHaveBeenCalled();
      expect(resolutionService.resolveInContext).toHaveBeenCalledWith(
        expect.objectContaining({
          structured: expect.objectContaining({
            base: "$.",
            segments: expect.arrayContaining(["config"])
          })
        }),
        expect.any(Object)
      );
      expect(clonedState.setPathVar).toHaveBeenCalledWith('config', pathValue);
      expect(result).toBe(clonedState);
    });
  });

  describe('error handling', () => {
    it('should handle validation errors', async () => {
      // Using createPathDirective for invalid cases since the parser will reject
      // truly invalid paths before they reach the handler
      const node = createPathDirective('invalidPath', '', createLocation(1, 1));
      const testContext = { currentFilePath: 'test.meld', state: stateService };

      vi.mocked(validationService.validate).mockImplementationOnce(() => {
        throw new DirectiveError('Invalid path', 'path');
      });

      await expect(handler.execute(node, testContext)).rejects.toThrow(DirectiveError);
    });

    it('should handle resolution errors', async () => {
      const node = createPathDirective('errorPath', '{{undefined}}', createLocation(1, 1));
      const testContext = { currentFilePath: 'test.meld', state: stateService };

      vi.mocked(resolutionService.resolveInContext).mockRejectedValueOnce(
        new Error('Resolution error')
      );

      await expect(handler.execute(node, testContext)).rejects.toThrow(DirectiveError);
    });

    it('should handle state errors', async () => {
      const node = createPathDirective('errorPath', '/some/path', createLocation(1, 1));
      const testContext = { currentFilePath: 'test.meld', state: stateService };

      vi.mocked(resolutionService.resolveInContext).mockResolvedValue('/some/path');
      vi.mocked(stateService.clone).mockReturnValue(clonedState);
      vi.mocked(clonedState.setPathVar).mockImplementation(() => {
        throw new Error('State error');
      });

      await expect(handler.execute(node, testContext)).rejects.toThrow(DirectiveError);
    });
  });
}); 