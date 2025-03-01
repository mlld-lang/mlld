import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PathDirectiveHandler } from './PathDirectiveHandler.js';
import { createPathDirective, createLocation } from '@tests/utils/testFactories.js';
import type { IValidationService } from '@services/resolution/ValidationService/IValidationService.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import type { DirectiveNode } from '../../../../node_modules/meld-spec/dist/types.js';
import { DirectiveError } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import { getExample, getInvalidExample } from '@tests/utils/syntax-test-helpers.js';

/**
 * PathDirectiveHandler Test Status
 * --------------------------------
 * 
 * MIGRATION STATUS: Partially Complete
 * 
 * This test file has been partially migrated to use centralized syntax examples.
 * 
 * COMPLETED:
 * - All "basic path handling" tests successfully migrated to use centralized examples
 * 
 * NOT MIGRATED:
 * - Error handling tests continue to use createPathDirective since the parser rejects 
 *   truly invalid syntax before the handler gets to process it, making it difficult
 *   to test validation error handling with actual invalid syntax examples.
 */

/**
 * Creates a DirectiveNode from example code
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
      validateNodes: true
    } as any); // Using 'as any' to avoid type issues
    
    return result.ast[0] as DirectiveNode;
  } catch (error) {
    console.error('Error parsing with meld-ast:', error);
    throw error;
  }
};

describe('PathDirectiveHandler', () => {
  let handler: PathDirectiveHandler;
  let validationService: IValidationService;
  let stateService: IStateService;
  let resolutionService: IResolutionService;
  let clonedState: IStateService;

  beforeEach(() => {
    validationService = {
      validate: vi.fn()
    } as unknown as IValidationService;

    clonedState = {
      setPathVar: vi.fn(),
      clone: vi.fn()
    } as unknown as IStateService;

    stateService = {
      setPathVar: vi.fn(),
      clone: vi.fn().mockReturnValue(clonedState)
    } as unknown as IStateService;

    resolutionService = {
      resolveInContext: vi.fn()
    } as unknown as IResolutionService;

    handler = new PathDirectiveHandler(
      validationService,
      stateService,
      resolutionService
    );
  });

  describe('basic path handling', () => {
    it('should process simple paths', async () => {
      // MIGRATION INSIGHTS:
      // When using centralized examples, the handler now receives a structured path object
      // instead of a simple string.
      const example = getExample('path', 'atomic', 'projectPath');
      const node = await createNodeFromExample(example.code);
      const context = { currentFilePath: 'test.meld', state: stateService };

      // The path value is now a structured object
      const pathValue = "$PROJECTPATH/docs";
      vi.mocked(resolutionService.resolveInContext).mockResolvedValueOnce(pathValue);

      const result = await handler.execute(node, context);

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
      const exampleSet = getExample('path', 'combinations', 'pathWithVariables');
      // We specifically want the second line which is the path directive
      const exampleLines = exampleSet.code.split('\n');
      const pathDirectiveLine = exampleLines[1]; // Get just the path directive line
      
      const node = await createNodeFromExample(pathDirectiveLine);
      const context = { currentFilePath: 'test.meld', state: stateService };

      // Mock the resolution with the variable replaced
      const resolvedPath = "$PROJECTPATH/meld/docs";  
      vi.mocked(resolutionService.resolveInContext).mockResolvedValueOnce(resolvedPath);

      const result = await handler.execute(node, context);

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
      const example = getExample('path', 'atomic', 'relativePath');
      const node = await createNodeFromExample(example.code);
      const context = { currentFilePath: 'test.meld', state: stateService };

      const pathValue = "$./config";
      vi.mocked(resolutionService.resolveInContext).mockResolvedValueOnce(pathValue);

      const result = await handler.execute(node, context);

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
      const context = { currentFilePath: 'test.meld', state: stateService };

      vi.mocked(validationService.validate).mockImplementationOnce(() => {
        throw new DirectiveError('Invalid path', 'path');
      });

      await expect(handler.execute(node, context)).rejects.toThrow(DirectiveError);
    });

    it('should handle resolution errors', async () => {
      const node = createPathDirective('errorPath', '{{undefined}}', createLocation(1, 1));
      const context = { currentFilePath: 'test.meld', state: stateService };

      vi.mocked(resolutionService.resolveInContext).mockRejectedValueOnce(
        new Error('Resolution error')
      );

      await expect(handler.execute(node, context)).rejects.toThrow(DirectiveError);
    });

    it('should handle state errors', async () => {
      const node = createPathDirective('errorPath', '/some/path', createLocation(1, 1));
      const context = { currentFilePath: 'test.meld', state: stateService };

      vi.mocked(resolutionService.resolveInContext).mockResolvedValue('/some/path');
      vi.mocked(stateService.clone).mockReturnValue(clonedState);
      vi.mocked(clonedState.setPathVar).mockImplementation(() => {
        throw new Error('State error');
      });

      await expect(handler.execute(node, context)).rejects.toThrow(DirectiveError);
    });
  });
}); 