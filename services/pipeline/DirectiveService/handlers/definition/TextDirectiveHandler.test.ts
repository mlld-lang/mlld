import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { TextDirectiveHandler } from '@services/pipeline/DirectiveService/handlers/definition/TextDirectiveHandler.js';
import { DirectiveError, DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import type { DirectiveNode, InterpolatableValue, VariableReferenceNode, TextNode, StructuredPath } from '@core/syntax/types/nodes.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import { parse } from '@core/ast';
import { createLocation, createTextDirective, createNodeFromExample as coreCreateNodeFromExample, createDirectiveNode as coreCreateDirectiveNode, createTextNode as coreCreateTextNode, createVariableReferenceNode as coreCreateVariableReferenceNode } from '@tests/utils/testFactories.js';
import { textDirectiveExamples } from '@core/syntax/index.js';
import { ErrorSeverity, FieldAccessError, MeldResolutionError } from '@core/errors/index.js';
import { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import type { DirectiveResult } from '@core/directives/DirectiveHandler';
import type { VariableDefinition } from '@core/types/variables.js';
import { DirectiveHandler } from '@services/pipeline/DirectiveService/DirectiveHandler.js';
import { DirectiveProcessingContext } from '@services/pipeline/DirectiveService/DirectiveProcessingContext.js';
import { createMockDirectiveNode } from '@tests/utils/mocks/ASTNodeMocks.js';
import { expectToThrowMeldError } from '@tests/utils/ErrorTestUtils.js';
import { VariableType } from '@core/types/variables.js';
import {
  MeldError,
  MeldErrorCodes,
} from '@core/errors/index.js';
import { container, type DependencyContainer } from 'tsyringe';
import { mockDeep, DeepMockProxy } from 'vitest-mock-extended';
import type { IValidationService } from '@services/resolution/ValidationService/IValidationService.js';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
import type { IPathService } from '@services/fs/PathService/IPathService.js';
import type { ResolutionContext } from '@core/types/resolution.js';
import type { FormattingContext } from '@core/types/index.js';
import path from 'path';

/**
 * TextDirectiveHandler Test Status
 * --------------------------------
 * 
 * MIGRATION STATUS: In Progress (Refactoring to Manual DI)
 * 
 * This test file is being migrated to use:
 * - Manual Child Container pattern
 * - Standardized mock factories with vitest-mock-extended
 */

describe('TextDirectiveHandler', () => {
  let handler: TextDirectiveHandler;
  let testContainer: DependencyContainer;
  let mockValidationService: DeepMockProxy<IValidationService>;
  let mockStateService: DeepMockProxy<IStateService>;
  let mockResolutionService: DeepMockProxy<IResolutionService>;
  let mockFileSystemService: DeepMockProxy<IFileSystemService>;
  let mockPathService: DeepMockProxy<IPathService>;
  let stateService: DeepMockProxy<IStateService>;
  let resolutionService: DeepMockProxy<IResolutionService>;
  let validationService: DeepMockProxy<IValidationService>;
  let fileSystemService: DeepMockProxy<IFileSystemService>;
  let pathService: DeepMockProxy<IPathService>;

  beforeEach(async () => {
    testContainer = container.createChildContainer();

    mockValidationService = mockDeep<IValidationService>({ validate: vi.fn() });
    mockStateService = mockDeep<IStateService>({ 
        getCurrentFilePath: vi.fn().mockReturnValue('/test.meld'), 
        setVariable: vi.fn(),
        getStateId: vi.fn().mockReturnValue('mock-text-state') 
    });
    mockResolutionService = mockDeep<IResolutionService>({ 
        resolveNodes: vi.fn(), 
        resolveInContext: vi.fn() 
    });
    mockFileSystemService = mockDeep<IFileSystemService>();
    mockPathService = mockDeep<IPathService>();

    testContainer.registerInstance<IValidationService>('IValidationService', mockValidationService);
    testContainer.registerInstance<IStateService>('IStateService', mockStateService);
    testContainer.registerInstance<IResolutionService>('IResolutionService', mockResolutionService);
    testContainer.registerInstance<IFileSystemService>('IFileSystemService', mockFileSystemService);
    testContainer.registerInstance<IPathService>('IPathService', mockPathService);
    testContainer.registerInstance('ILogger', { debug: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn() });
    testContainer.registerInstance('DependencyContainer', testContainer);

    testContainer.register(TextDirectiveHandler, { useClass: TextDirectiveHandler });

    handler = testContainer.resolve(TextDirectiveHandler);
    validationService = mockValidationService;
    stateService = mockStateService;
    resolutionService = mockResolutionService;
    fileSystemService = mockFileSystemService;
    pathService = mockPathService;

    vi.spyOn(resolutionService, 'resolveNodes').mockImplementation(async (nodes, ctx) => {
        let result = '';
        for (const node of nodes) {
            if (node.type === 'Text') result += node.content;
            else if (node.type === 'VariableReference') {
                if (node.identifier === 'name') result += 'World';
                else if (node.identifier === 'user' && node.fields?.[0]?.value === 'name') result += 'Alice';
                else if (node.identifier === 'greeting') result += 'Hello';
                else if (node.identifier === 'subject') result += 'World';
                else if (node.identifier === 'configPath') result += '$PROJECTPATH/docs';
                else if (node.identifier === 'missing' || node.identifier === 'undefined_var') {
                    throw new MeldResolutionError(
                      `Variable not found: ${node.identifier}`,
                      { 
                        code: 'E_VAR_NOT_FOUND',
                        details: { variableName: node.identifier },
                        severity: ErrorSeverity.Recoverable
                      }
                    );
                }
                else result += `{{${node.identifier}}}`;
            }
        }
        return result;
    });
    vi.spyOn(stateService, 'getCurrentFilePath').mockReturnValue('test.meld');
    vi.spyOn(validationService, 'validate').mockResolvedValue(undefined);
  });

  afterEach(async () => {
    testContainer?.dispose();
    vi.clearAllMocks();
  });

  const createMockProcessingContext = (node: DirectiveNode): DirectiveProcessingContext => {
    const currentFilePath = stateService.getCurrentFilePath() || undefined;
    const resolutionContext: ResolutionContext = { 
        state: stateService, 
        strict: false, depth: 0, allowedVariableTypes: [], flags: {},
        formattingContext: {}, pathContext: {}, parserFlags: {},
        currentFilePath: currentFilePath,
        withIncreasedDepth: vi.fn().mockReturnThis(),
        withStrictMode: vi.fn().mockReturnThis(),
        withPathContext: vi.fn().mockReturnThis(),
        withFlags: vi.fn().mockReturnThis(),
        withAllowedTypes: vi.fn().mockReturnThis(),
        withFormattingContext: vi.fn().mockReturnThis(),
        withParserFlags: vi.fn().mockReturnThis()
    };
    return {
        state: stateService, 
        resolutionContext: resolutionContext,
        formattingContext: { isBlock: false } as FormattingContext,
        directiveNode: node,
        executionContext: { cwd: '/test/dir' },
    };
  };

  const createNodeFromExample = async (code: string): Promise<DirectiveNode> => {
    try {
      const { parse } = await import('@core/ast');
      const result = await parse(code, {
        trackLocations: true,
        validateNodes: true,
        structuredPaths: true
      });
      const nodes = result.ast || [];
      if (!nodes || nodes.length === 0 || nodes[0].type !== 'Directive') {
        throw new Error(`Failed to parse directive from code: ${code}`);
      }
      return nodes[0] as DirectiveNode;
    } catch (error) {
      console.error('Error parsing with @core/ast:', error);
      throw error;
    }
  };

  describe('execute', () => {
    it('should handle a simple text assignment with string literal', async () => {
      const example = textDirectiveExamples.atomic.simpleString;
      const node = await createNodeFromExample(example.code);
      const processingContext = createMockProcessingContext(node);
      
      vi.spyOn(resolutionService, 'resolveNodes').mockResolvedValueOnce('Hello');
      const setVariableSpy = vi.spyOn(stateService, 'setVariable');

      const result = await handler.handle(processingContext) as DirectiveResult;

      expect(resolutionService.resolveNodes).toHaveBeenCalledWith(node.directive.value, expect.anything());
      expect(result.stateChanges).toBeDefined();
      expect(result.stateChanges?.variables).toHaveProperty('greeting');
      const varDef = result.stateChanges?.variables?.greeting;
      expect(varDef?.type).toBe(VariableType.TEXT);
      expect(varDef?.value).toBe('Hello');
    });

    it('should handle text assignment with escaped characters', async () => {
      const example = textDirectiveExamples.atomic.escapedCharacters;
      const node = await createNodeFromExample(example.code);
      const expectedValue = 'Line 1\nLine 2\t"Quoted"';
      
      vi.spyOn(resolutionService, 'resolveNodes').mockResolvedValueOnce(expectedValue); 
      const setVariableSpy = vi.spyOn(stateService, 'setVariable');
      
      const result = await handler.handle(createMockProcessingContext(node)) as DirectiveResult;
      
      expect(resolutionService.resolveNodes).toHaveBeenCalledWith(node.directive.value, expect.anything());
      expect(result.stateChanges).toBeDefined();
      expect(result.stateChanges?.variables).toHaveProperty('escaped');
      const varDef = result.stateChanges?.variables?.escaped;
      expect(varDef?.type).toBe(VariableType.TEXT);
      expect(varDef?.value).toBe(expectedValue);
    });

    it('should handle a template literal in text directive', async () => {
      const example = textDirectiveExamples.atomic.templateLiteral;
      const node = await createNodeFromExample(example.code);
      const expectedValue = 'Template content';
      
      vi.spyOn(resolutionService, 'resolveNodes').mockResolvedValueOnce(expectedValue);
      const setVariableSpy = vi.spyOn(stateService, 'setVariable');

      const result = await handler.handle(createMockProcessingContext(node)) as DirectiveResult;
      
      expect(resolutionService.resolveNodes).toHaveBeenCalledWith(node.directive.value, expect.anything());
      expect(result.stateChanges).toBeDefined();
      expect(result.stateChanges?.variables).toHaveProperty('message');
      const varDef = result.stateChanges?.variables?.message;
      expect(varDef?.type).toBe(VariableType.TEXT);
      expect(varDef?.value).toBe(expectedValue);
    });

    it('should handle object property interpolation in text value', async () => {
      const example = textDirectiveExamples.combinations.objectInterpolation;
      const node = await createNodeFromExample(example.code.split('\n')[1]);
      const expectedValue = 'Hello, Alice!';

      vi.spyOn(resolutionService, 'resolveNodes').mockResolvedValueOnce(expectedValue); 
      const setVariableSpy = vi.spyOn(stateService, 'setVariable');
      
      const result = await handler.handle(createMockProcessingContext(node)) as DirectiveResult;
      
      expect(resolutionService.resolveNodes).toHaveBeenCalledWith(node.directive.value, expect.anything());
      expect(result.stateChanges).toBeDefined();
      expect(result.stateChanges?.variables).toHaveProperty('greeting');
      const varDef = result.stateChanges?.variables?.greeting;
      expect(varDef?.type).toBe(VariableType.TEXT);
      expect(varDef?.value).toBe(expectedValue);
    });

    it('should handle path referencing in text values', async () => {
      const example = textDirectiveExamples.combinations.pathReferencing;
      const node = await createNodeFromExample(example.code.split('\n')[5]);
      const expectedValue = 'Docs are at $PROJECTPATH/docs';

      vi.spyOn(resolutionService, 'resolveNodes').mockResolvedValueOnce(expectedValue);
      const setVariableSpy = vi.spyOn(stateService, 'setVariable');

      const result = await handler.handle(createMockProcessingContext(node)) as DirectiveResult;
      
      expect(resolutionService.resolveNodes).toHaveBeenCalledWith(node.directive.value, expect.anything());
      expect(result.stateChanges).toBeDefined();
      expect(result.stateChanges?.variables).toHaveProperty('configText');
      const varDef = result.stateChanges?.variables?.configText;
      expect(varDef?.type).toBe(VariableType.TEXT);
      expect(varDef?.value).toBe(expectedValue);
    });

    it('should throw DirectiveError if text interpolation contains undefined variables', async () => {
      const example = textDirectiveExamples.invalid.undefinedVariable;
      const node = await createNodeFromExample(example.code);

      vi.spyOn(stateService, 'setVariable');
      const setVariableSpy = vi.spyOn(stateService, 'setVariable');

      await expect(handler.handle(createMockProcessingContext(node)))
        .rejects
        .toThrow(DirectiveError);
      
      await expect(handler.handle(createMockProcessingContext(node)))
        .rejects
        .toHaveProperty('cause.message', 'Variable not found: undefined_var');
        
      expect(setVariableSpy).not.toHaveBeenCalled();
    });

    it('should handle basic variable interpolation', async () => {
      const example = textDirectiveExamples.combinations.basicInterpolation;
      const node = await createNodeFromExample(example.code.split('\n')[2]);
      const expectedValue = 'Hello, World!';
      
      vi.spyOn(stateService, 'setVariable');
      const setVariableSpy = vi.spyOn(stateService, 'setVariable');

      const result = await handler.handle(createMockProcessingContext(node)) as DirectiveResult;
      
      expect(resolutionService.resolveNodes).toHaveBeenCalledWith(node.directive.value, expect.anything());
      expect(result.stateChanges).toBeDefined();
      expect(result.stateChanges?.variables).toHaveProperty('message');
      const varDef = result.stateChanges?.variables?.message;
      expect(varDef?.type).toBe(VariableType.TEXT);
      expect(varDef?.value).toBe(expectedValue);
    });
  });
}); 