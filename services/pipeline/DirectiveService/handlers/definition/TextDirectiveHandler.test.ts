import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mockDeep, DeepMockProxy } from 'vitest-mock-extended';
import { container, type DependencyContainer } from 'tsyringe';
import { TextDirectiveHandler } from './TextDirectiveHandler';
import { type DirectiveProcessingContext } from '@core/types/index';
import { DirectiveError } from '@services/pipeline/DirectiveService/errors/DirectiveError';
import { ErrorSeverity, MeldResolutionError } from '@core/errors';
import { type VariableDefinition } from '@core/types/variables';
import { type DirectiveNode } from '@core/syntax/types/index';
import { type IResolutionService } from '@services/resolution/ResolutionService/IResolutionService';
import { type IStateService } from '@services/state/StateService/IStateService';
import { type IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService';
import { type IPathService } from '@services/fs/PathService/IPathService';
import { type IValidationService } from '@services/resolution/ValidationService/IValidationService';
import { type ResolutionContext, type ResolutionFlags, type FormattingContext, type ParserFlags } from '@core/types/resolution';
import { type DirectiveResult } from '@core/directives/DirectiveHandler';
import { type VariableMetadata, VariableOrigin, VariableType } from '@core/types/variables';
import { PathPurpose } from '@core/types/paths';
import type { InterpolatableValue } from '@core/syntax/types/nodes';
import { textDirectiveExamples } from '@core/syntax/index';

/**
 * TextDirectiveHandler Test Status
 * --------------------------------
 * 
 * This test file contains tests that provide unique value beyond fixture coverage.
 * Tests have been deduplicated - basic scenarios are covered by fixture tests.
 * 
 * Kept tests include:
 * - Complex error handling scenarios
 * - Specific mock behavior validation
 * - Service integration patterns
 * 
 * All tests updated to use correct AST structure (no node.directive).
 */

describe('TextDirectiveHandler', () => {
  let handler: TextDirectiveHandler;
  let testContainer: DependencyContainer;
  let mockValidationService: IValidationService;
  let mockStateService: DeepMockProxy<IStateService>;
  let mockResolutionService: DeepMockProxy<IResolutionService>;
  let mockFileSystemService: DeepMockProxy<IFileSystemService>;
  let mockPathService: DeepMockProxy<IPathService>;
  let stateService: DeepMockProxy<IStateService>;
  let resolutionService: DeepMockProxy<IResolutionService>;
  let validationService: IValidationService;
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

    // Set up initial state with required variables
    const getVariable = vi.fn().mockImplementation((identifier: string): VariableDefinition | undefined => {
      const metadata: VariableMetadata = {
        createdAt: Date.now(),
        modifiedAt: Date.now(),
        origin: VariableOrigin.DIRECT_DEFINITION
      };
      
      const variables: Record<string, VariableDefinition> = {
        greeting: { type: VariableType.TEXT, value: 'Hello', metadata },
        'test.object': { type: VariableType.DATA, value: { name: 'test' }, metadata },
        subject: { type: VariableType.TEXT, value: 'World', metadata },
        user: { type: VariableType.DATA, value: { name: 'Alice' }, metadata },
        configPath: { type: VariableType.TEXT, value: '$PROJECTPATH/docs', metadata }
      };

      if (identifier === 'undefined_var') {
        throw new MeldResolutionError(
          `Variable not found: ${identifier}`,
          { 
            code: 'E_VAR_NOT_FOUND',
            details: { variableName: identifier },
            severity: ErrorSeverity.Recoverable
          }
        );
      }

      return variables[identifier];
    });

    // Use actual resolution service
    vi.spyOn(resolutionService, 'resolveNodes').mockImplementation(async (nodes: InterpolatableValue, ctx) => {
      if (!Array.isArray(nodes)) return nodes;
      
      let result = '';
      for (const node of nodes) {
        if (node.type === 'Text') {
          result += node.content;
        } else if (node.type === 'VariableReference') {
          try {
            const variable = await stateService.getVariable(node.identifier);
            if (!variable) {
              throw new MeldResolutionError(
                `Variable not found: ${node.identifier}`,
                { code: 'E_VAR_NOT_FOUND', severity: ErrorSeverity.Recoverable }
              );
            }

            if (node.fields?.length) {
              // Handle object property access
              let current = variable.value;
              for (const field of node.fields) {
                if (typeof current === 'object' && current !== null && field.value in current) {
                  current = current[field.value as keyof typeof current];
                } else {
                  throw new MeldResolutionError(
                    `Cannot access property ${field.value} of ${typeof current}`,
                    { code: 'E_INVALID_ACCESS', severity: ErrorSeverity.Recoverable }
                  );
                }
              }
              result += String(current);
            } else {
              result += String(variable.value);
            }
          } catch (error) {
            if (error instanceof MeldResolutionError) throw error;
            throw new MeldResolutionError(
              `Failed to resolve variable: ${node.identifier}`,
              { code: 'E_RESOLUTION_FAILED', severity: ErrorSeverity.Recoverable }
            );
          }
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
      strict: false,
      depth: 0,
      allowedVariableTypes: [],
      flags: {
        isVariableEmbed: false,
        isTransformation: false,
        allowRawContentResolution: true,
        isDirectiveHandler: true,
        isImportContext: false,
        processNestedVariables: false
      } as ResolutionFlags,
      formattingContext: {
        isBlock: false,
        preserveLiteralFormatting: false,
        preserveWhitespace: false
      } as FormattingContext,
      pathContext: {
        baseDir: process.cwd(),
        allowTraversal: true,
        purpose: PathPurpose.READ
      },
      parserFlags: {
        parseInRawContent: false,
        parseInCodeBlocks: false,
        resolveVariablesDuringParsing: false,
        parseLiteralTypes: []
      },
      withIncreasedDepth: vi.fn().mockReturnThis(),
      withStrictMode: vi.fn().mockReturnThis(),
      withPathContext: vi.fn().mockReturnThis(),
      withFlags: vi.fn().mockImplementation((flags: Partial<ResolutionFlags>) => resolutionContext),
      withAllowedTypes: vi.fn().mockImplementation((types: VariableType[]) => resolutionContext),
      withFormattingContext: vi.fn().mockImplementation((formatting: Partial<FormattingContext>) => resolutionContext),
      withParserFlags: vi.fn().mockImplementation((flags: Partial<ParserFlags>) => resolutionContext)
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
        validateNodes: true
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

      expect(resolutionService.resolveNodes).toHaveBeenCalledWith(node.values.content, expect.anything());
      expect(result.stateChanges).toBeDefined();
      expect(result.stateChanges?.variables).toHaveProperty('greeting');
      const varDef = result.stateChanges?.variables?.greeting;
      expect(varDef?.type).toBe(VariableType.TEXT);
      expect(varDef?.value).toBe('Hello');
    });

    it('should handle text assignment with escaped characters', async () => {
      const source = '@text escaped = "Line 1\\nLine 2\\t\\"Quoted\\""';
      const ast = await createNodeFromExample(source);
      const expectedValue = 'Line 1\nLine 2\t"Quoted"';
      
      vi.spyOn(resolutionService, 'resolveNodes').mockResolvedValueOnce(expectedValue); 
      const setVariableSpy = vi.spyOn(stateService, 'setVariable');
      
      const result = await handler.handle(createMockProcessingContext(ast)) as DirectiveResult;
      
      expect(resolutionService.resolveNodes).toHaveBeenCalledWith(ast.values.content, expect.anything());
      expect(result.stateChanges).toBeDefined();
      expect(result.stateChanges?.variables).toHaveProperty('escaped');
      const varDef = result.stateChanges?.variables?.escaped;
      expect(varDef?.type).toBe(VariableType.TEXT);
      expect(varDef?.value).toBe(expectedValue);
    });

    it('should handle a template literal in text directive', async () => {
      const source = '@text message = `Template content`';
      const ast = await createNodeFromExample(source);
      const expectedValue = 'Template content';
      
      vi.spyOn(resolutionService, 'resolveNodes').mockResolvedValueOnce(expectedValue);
      const setVariableSpy = vi.spyOn(stateService, 'setVariable');

      const result = await handler.handle(createMockProcessingContext(ast)) as DirectiveResult;
      
      expect(resolutionService.resolveNodes).toHaveBeenCalledWith(ast.values.content, expect.anything());
      expect(result.stateChanges).toBeDefined();
      expect(result.stateChanges?.variables).toHaveProperty('message');
      const varDef = result.stateChanges?.variables?.message;
      expect(varDef?.type).toBe(VariableType.TEXT);
      expect(varDef?.value).toBe(expectedValue);
    });

    it('should handle object property interpolation in text value', async () => {
      const source = '@text greeting = `Hello {{user.name}}!`';
      const ast = await createNodeFromExample(source);
      const expectedValue = 'Hello Alice!';

      vi.spyOn(resolutionService, 'resolveNodes').mockResolvedValueOnce(expectedValue); 
      const setVariableSpy = vi.spyOn(stateService, 'setVariable');

      const result = await handler.handle(createMockProcessingContext(ast)) as DirectiveResult;
      
      expect(resolutionService.resolveNodes).toHaveBeenCalledWith(ast.values.content, expect.anything());
      expect(result.stateChanges).toBeDefined();
      expect(result.stateChanges?.variables).toHaveProperty('greeting');
      const varDef = result.stateChanges?.variables?.greeting;
      expect(varDef?.type).toBe(VariableType.TEXT);
      expect(varDef?.value).toBe(expectedValue);
    });

    it('should handle path referencing in text values', async () => {
      const source = '@text configText = "Docs are at {{configPath}}"';
      const ast = await createNodeFromExample(source);
      const expectedValue = 'Docs are at $PROJECTPATH/docs';

      vi.spyOn(resolutionService, 'resolveNodes').mockResolvedValueOnce(expectedValue);
      const setVariableSpy = vi.spyOn(stateService, 'setVariable');

      const result = await handler.handle(createMockProcessingContext(ast)) as DirectiveResult;
      
      expect(resolutionService.resolveNodes).toHaveBeenCalledWith(ast.values.content, expect.anything());
      expect(result.stateChanges).toBeDefined();
      expect(result.stateChanges?.variables).toHaveProperty('configText');
      const varDef = result.stateChanges?.variables?.configText;
      expect(varDef?.type).toBe(VariableType.TEXT);
      expect(varDef?.value).toBe(expectedValue);
    });

    it('should throw DirectiveError if text interpolation contains undefined variables', async () => {
      const source = '@text greeting = `Hello {{undefined_var}}!`';
      const ast = await createNodeFromExample(source);

      const setVariableSpy = vi.spyOn(stateService, 'setVariable');

      // Clear the existing implementation and mock to throw the expected error
      resolutionService.resolveNodes.mockReset();
      resolutionService.resolveNodes.mockRejectedValueOnce(
        new MeldResolutionError(
          'Variable not found: undefined_var',
          { code: 'E_VAR_NOT_FOUND', severity: ErrorSeverity.Recoverable }
        )
      );

      await expect(handler.handle(createMockProcessingContext(ast)))
        .rejects
        .toThrow(DirectiveError);
        
      expect(setVariableSpy).not.toHaveBeenCalled();
    });

    it('should handle basic variable interpolation', async () => {
      const source = '@text message = `Hello {{subject}}!`';
      const ast = await createNodeFromExample(source);
      const expectedValue = 'Hello World!';
      
      vi.spyOn(resolutionService, 'resolveNodes').mockResolvedValueOnce(expectedValue);
      const setVariableSpy = vi.spyOn(stateService, 'setVariable');

      const result = await handler.handle(createMockProcessingContext(ast)) as DirectiveResult;
      
      expect(resolutionService.resolveNodes).toHaveBeenCalledWith(ast.values.content, expect.anything());
      expect(result.stateChanges).toBeDefined();
      expect(result.stateChanges?.variables).toHaveProperty('message');
      const varDef = result.stateChanges?.variables?.message;
      expect(varDef?.type).toBe(VariableType.TEXT);
      expect(varDef?.value).toBe(expectedValue);
    });
  });
}); 