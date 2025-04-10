import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { DirectiveNode, DirectiveData, MeldNode, VariableReferenceNode, TextNode } from '@core/syntax/types/index.js';
import type { MeldPath, StructuredPath } from '@core/types/paths.js';
import { createMeldPath } from '@core/types/paths.js';
import { EmbedDirectiveHandler, type ILogger } from '@services/pipeline/DirectiveService/handlers/execution/EmbedDirectiveHandler.js';
import type { IValidationService } from '@services/resolution/ValidationService/IValidationService.js';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import type { ResolutionContext } from '@core/types/resolution.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { DataVariable } from '@core/types/variables.js';
import type { Result } from '@core/types/common.js';
import { success, failure } from '@core/types/common.js';
import type { FieldAccessError } from '@core/errors/FieldAccessError.js';
import type { ICircularityService } from '@services/resolution/CircularityService/ICircularityService.js';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
import type { IParserService } from '@services/pipeline/ParserService/IParserService.js';
import type { IInterpreterServiceClient } from '@services/pipeline/InterpreterService/interfaces/IInterpreterServiceClient.js';
import { InterpreterServiceClientFactory } from '@services/pipeline/InterpreterService/factories/InterpreterServiceClientFactory.js';
import { DirectiveError, DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import { createLocation, createEmbedDirective } from '@tests/utils/testFactories.js';
import { 
  embedDirectiveExamples
} from '@core/syntax/index.js';
import { TestContextDI } from '@tests/utils/di/TestContextDI.js';
import { mockDeep, type DeepMockProxy } from 'vitest-mock-extended';
import {
  createValidationServiceMock,
  createStateServiceMock,
  createResolutionServiceMock,
  createFileSystemServiceMock,
  createDirectiveErrorMock
} from '@tests/utils/mocks/serviceMocks.js';

/**
 * EmbedDirectiveHandler Transformation Test Status
 * -----------------------------------------------
 * 
 * MIGRATION STATUS: Complete
 * 
 * This test file has been fully migrated to use:
 * - TestContextDI for container management
 * - Standardized mock factories with vitest-mock-extended
 * - Centralized syntax examples
 * 
 * Migration details:
 * 
 * 1. Using TestContextDI for test environment setup
 * 2. Using standardized mock factories for service mocks
 * 3. Using a hybrid approach with direct handler instantiation
 * 4. Maintained use of centralized syntax examples 
 * 5. Added proper cleanup with afterEach hook
 */

const mockLogger: DeepMockProxy<ILogger> = mockDeep<ILogger>();

describe('EmbedDirectiveHandler Transformation', () => {
  let handler: EmbedDirectiveHandler;
  let validationService: DeepMockProxy<IValidationService>;
  let resolutionService: DeepMockProxy<IResolutionService>;
  let stateService: DeepMockProxy<IStateService>;
  let fileSystemService: any;
  let circularityService: DeepMockProxy<ICircularityService>;
  let parserService: DeepMockProxy<IParserService>;
  let interpreterServiceClientFactory: any;
  let interpreterServiceClient: DeepMockProxy<IInterpreterServiceClient>;
  let clonedState: any;
  let childState: any;
  let context: TestContextDI;

  beforeEach(() => {
    context = TestContextDI.create({ isolatedContainer: true });

    childState = {
      setTextVar: vi.fn(),
      setDataVar: vi.fn(),
      setPathVar: vi.fn(),
      setCommand: vi.fn(),
      clone: vi.fn(),
      mergeChildState: vi.fn(),
      isTransformationEnabled: vi.fn().mockReturnValue(true)
    };

    clonedState = {
      setTextVar: vi.fn(),
      setDataVar: vi.fn(),
      setPathVar: vi.fn(),
      setCommand: vi.fn(),
      createChildState: vi.fn().mockReturnValue(childState),
      mergeChildState: vi.fn(),
      clone: vi.fn(),
      isTransformationEnabled: vi.fn().mockReturnValue(true),
      transformNode: vi.fn()
    };

    validationService = createValidationServiceMock();
    stateService = createStateServiceMock();
    resolutionService = createResolutionServiceMock();
    fileSystemService = {
      dirname: vi.fn().mockReturnValue('/workspace'),
      join: vi.fn().mockImplementation((...args: string[]) => args.join('/')),
      normalize: vi.fn().mockImplementation((path: string) => path),
      exists: vi.fn(),
      readFile: vi.fn()
    };
    
    stateService.clone.mockReturnValue(clonedState);
    stateService.createChildState.mockReturnValue(childState);
    stateService.isTransformationEnabled.mockReturnValue(true);
    stateService.transformNode = clonedState.transformNode;

    circularityService = mockDeep<ICircularityService>();

    parserService = mockDeep<IParserService>();

    interpreterServiceClientFactory = {
      getClient: vi.fn()
    };
    interpreterServiceClient = mockDeep<IInterpreterServiceClient>();

    // Configure interpreter client factory to return the client mock
    interpreterServiceClientFactory.getClient.mockReturnValue(interpreterServiceClient);

    // Configure ResolutionService mocks
    resolutionService.resolvePath.mockImplementation(async (pathInput: string | StructuredPath, context: ResolutionContext): Promise<MeldPath> => {
      if (typeof pathInput === 'string') return createMeldPath(`/path/to/${pathInput}`);
      if (pathInput && typeof pathInput === 'object' && 'raw' in pathInput && typeof pathInput.raw === 'string') {
        return createMeldPath(`/path/to/${pathInput.raw}`);
      }
      throw new Error(`Mock resolvePath cannot handle input: ${JSON.stringify(pathInput)}`);
    });
    resolutionService.resolveInContext.mockImplementation(async (value: string | StructuredPath, context: ResolutionContext): Promise<string> => {
       if (typeof value === 'string') return `Resolved: ${value}`;
       if (value && typeof value === 'object' && 'raw' in value) return `Resolved: ${value.raw}`;
       throw new Error(`Mock resolveInContext cannot handle input: ${JSON.stringify(value)}`);
    });
    resolutionService.resolveContent.mockImplementation(async (nodes: (TextNode | VariableReferenceNode)[], context: ResolutionContext): Promise<string> => {
       return nodes.map(n => n.type === 'Text' ? n.content : `{{${n.identifier}}}`).join('');
    });
    resolutionService.extractSection.mockImplementation(async (content: string, section: string) => `Extracted: ${section} from ${content.substring(0, 10)}...`);

    // Create handler directly with the mocks
    handler = new EmbedDirectiveHandler(
      validationService,
      resolutionService,
      stateService,
      circularityService,
      fileSystemService,
      {} as any,
      interpreterServiceClientFactory,
      mockLogger
    );
  });

  afterEach(async () => {
    await context?.cleanup();
  });

  describe('transformation behavior', () => {
    it('should return replacement node with file contents when transformation enabled', async () => {
      // MIGRATION: Using centralized syntax example
      const example = embedDirectiveExamples.atomic.simpleEmbed;
      // Manually create node
      const mockPath = { raw: 'doc.md' };
      const node = {
        type: 'Directive',
        subtype: 'embedPath',
        path: mockPath,
        options: {},
        directive: { kind: 'embed' },
        location: createLocation(1, 1, 0, 1)
      } as DirectiveNode;
      const context = { currentFilePath: 'test.meld', state: stateService as any };

      const resolvedPath = createMeldPath('/path/to/doc.md');
      resolutionService.resolvePath.mockResolvedValue(resolvedPath);
      vi.mocked(fileSystemService.exists).mockResolvedValue(true);
      vi.mocked(fileSystemService.readFile).mockResolvedValue('Test content');
      vi.mocked(parserService.parse).mockResolvedValue([]);

      const result = await handler.execute(node, context);

      expect(result.replacement).toBeDefined();
      expect(result.replacement).toEqual({
        type: 'Text',
        content: 'Test content',
        location: node.location,
        formattingMetadata: {
          isFromDirective: true,
          originalNodeType: 'Directive',
          preserveFormatting: true
        }
      });
      expect(result.state).toBe(clonedState);
    });

    it('should handle section extraction in transformation', async () => {
      // MIGRATION: Using centralized syntax example with section
      const example = embedDirectiveExamples.atomic.withSection;
      const mockPath = { raw: 'sections.md' };
      const sectionName = 'Section Two';
      const node = {
        type: 'Directive',
        subtype: 'embedPath',
        path: mockPath,
        options: { section: sectionName },
        directive: { kind: 'embed' },
        location: createLocation(1, 1, 0, 1)
      } as DirectiveNode;
      const context = { currentFilePath: 'test.meld', state: stateService as any };

      const resolvedPath = createMeldPath('/path/to/sections.md');
      const rawContent = '# Content';
      const extractedContent = `Extracted: ${sectionName} from ${rawContent.substring(0, 10)}...`;
      resolutionService.resolvePath.mockResolvedValue(resolvedPath);
      vi.mocked(fileSystemService.exists).mockResolvedValue(true);
      vi.mocked(fileSystemService.readFile).mockResolvedValue(rawContent);

      const result = await handler.execute(node, context);

      expect(result.replacement).toBeDefined();
      expect(result.replacement).toEqual({
        type: 'Text',
        content: extractedContent,
        location: node.location,
        formattingMetadata: {
          isFromDirective: true,
          originalNodeType: 'Directive',
          preserveFormatting: true
        }
      });
    });

    it('should handle heading level in transformation', async () => {
      // MIGRATION: Need to continue using direct node creation for heading level test
      const mockPath = { raw: 'doc.md' };
      const node = {
        type: 'Directive',
        subtype: 'embedPath',
        path: mockPath,
        options: {
          headingLevel: 2
        },
        directive: { kind: 'embed' },
        location: createLocation(1, 1, 0, 1)
      } as DirectiveNode;
      const context = { currentFilePath: 'test.meld', state: stateService as any };

      const resolvedPath = createMeldPath('/path/to/doc.md');
      const rawContent = 'Test content';
      resolutionService.resolvePath.mockResolvedValue(resolvedPath);
      vi.mocked(fileSystemService.exists).mockResolvedValue(true);
      vi.mocked(fileSystemService.readFile).mockResolvedValue(rawContent);

      const result = await handler.execute(node, context);

      expect(result.replacement).toBeDefined();
      expect(result.replacement).toEqual({
        type: 'Text',
        content: rawContent,
        location: node.location,
        formattingMetadata: {
          isFromDirective: true,
          originalNodeType: 'Directive',
          preserveFormatting: true
        }
      });
    });

    it('should handle under header in transformation', async () => {
      // MIGRATION: Need to continue using direct node creation
      const mockPath = { raw: 'doc.md' };
      const node = {
        type: 'Directive',
        subtype: 'embedPath',
        path: mockPath,
        options: { underHeader: 'My Header' },
        directive: { kind: 'embed' },
        location: createLocation(1, 1, 0, 1)
      } as DirectiveNode;
      const context = { currentFilePath: 'test.meld', state: stateService as any };

      const resolvedPath = createMeldPath('/path/to/doc.md');
      const rawContent = 'Test content';
      resolutionService.resolvePath.mockResolvedValue(resolvedPath);
      vi.mocked(fileSystemService.exists).mockResolvedValue(true);
      vi.mocked(fileSystemService.readFile).mockResolvedValue(rawContent);

      const result = await handler.execute(node, context);

      expect(result.replacement).toBeDefined();
      expect(result.replacement).toEqual({
        type: 'Text',
        content: rawContent,
        location: node.location,
        formattingMetadata: {
          isFromDirective: true,
          originalNodeType: 'Directive',
          preserveFormatting: true
        }
      });
    });

    it('should handle variable interpolation in path during transformation', async () => {
      // MIGRATION: Need to continue using direct node creation for variable path test
      const pathString = '{{filename}}.md';
      const node = {
        type: 'Directive',
        subtype: 'embedPath',
        path: pathString,
        options: {},
        directive: { kind: 'embed' },
        location: createLocation(1, 1, 0, 1)
      } as DirectiveNode;
      const context = { currentFilePath: 'test.meld', state: stateService as any };

      const resolvedPath = createMeldPath('/path/to/resolved.md');
      const rawContent = 'Variable content';
      resolutionService.resolvePath.mockResolvedValue(resolvedPath);
      vi.mocked(fileSystemService.exists).mockResolvedValue(true);
      vi.mocked(fileSystemService.readFile).mockResolvedValue(rawContent);

      const result = await handler.execute(node, context);

      expect(result.replacement).toBeDefined();
      expect(result.replacement).toEqual({
        type: 'Text',
        content: rawContent,
        location: node.location,
        formattingMetadata: {
          isFromDirective: true,
          originalNodeType: 'Directive',
          preserveFormatting: true
        }
      });
      expect(resolutionService.resolvePath).toHaveBeenCalledWith(
        pathString,
        expect.any(Object)
      );
    });
    
    it('should handle variable reference embeds in transformation mode', async () => {
      // Create a variable reference embed
      const variablePath = {
        raw: '{{userData.user.profile.bio}}',
        isVariableReference: true,
        variable: {
          identifier: 'userData',
          valueType: 'data',
          isVariableReference: true,
          fields: [
            { type: 'field', value: 'user' },
            { type: 'field', value: 'profile' },
            { type: 'field', value: 'bio' }
          ]
        }
      };
      
      // Create the node
      const node = {
        type: 'Directive',
        subtype: 'embedVariable',
        path: variablePath,
        options: {},
        directive: { kind: 'embed' },
        location: createLocation(1, 1, 0, 1)
      } as DirectiveNode;
      
      const context = { 
        currentFilePath: 'test.meld', 
        state: stateService,
        parentState: stateService
      };
      
      // The variable resolves to text content
      const resolvedContent = 'This is a test bio.';
      vi.mocked(resolutionService.resolveInContext).mockResolvedValue(resolvedContent);
      
      const result = await handler.execute(node, context);
      
      // Should directly use variable value as content
      expect(result.replacement).toBeDefined();
      expect(result.replacement).toEqual({
        type: 'Text',
        content: resolvedContent,
        location: node.location,
        formattingMetadata: {
          isFromDirective: true,
          originalNodeType: 'Directive',
          preserveFormatting: true
        }
      });
      
      // No file operations should happen
      expect(fileSystemService.exists).not.toHaveBeenCalled();
      expect(fileSystemService.readFile).not.toHaveBeenCalled();
    });
    
    it('should handle data variable field embeds in transformation mode', async () => {
      // Create a variable reference embed directly instead of trying to parse the example
      const variablePath = {
        raw: '{{role.architect}}',
        isVariableReference: true,
        variable: {
          type: 'VariableReference',
          identifier: 'role',
          valueType: 'data',
          isVariableReference: true,
          fields: [{ type: 'field', value: 'architect' }]
        }
      };
      
      // Create the directive node with the variable reference path
      const node = {
        type: 'Directive',
        subtype: 'embedVariable',
        path: variablePath,
        options: {},
        directive: { kind: 'embed' },
        location: { start: { line: 1, column: 1 }, end: { line: 1, column: 20 } }
      } as DirectiveNode;
      
      const context = { 
        currentFilePath: 'test.meld', 
        state: stateService,
        parentState: stateService
      };
      
      // Variable resolves to the content string
      const resolvedContent = 'You are a senior architect skilled in TypeScript.';
      vi.mocked(resolutionService.resolveInContext).mockResolvedValue(resolvedContent);
      
      const result = await handler.execute(node, context);
      
      // Should use variable value directly
      expect(result.replacement).toBeDefined();
      expect(result.replacement).toEqual({
        type: 'Text',
        content: resolvedContent,
        location: node.location,
        formattingMetadata: {
          isFromDirective: true,
          originalNodeType: 'Directive',
          preserveFormatting: true
        }
      });
      
      // No file operations should happen
      expect(fileSystemService.exists).not.toHaveBeenCalled();
      expect(fileSystemService.readFile).not.toHaveBeenCalled();
    });

    it('should preserve error handling during transformation', async () => {
      // MIGRATION: Using centralized invalid example for file not found
      const node = {
        type: 'Directive',
        subtype: 'embedPath',
        path: { raw: 'missing.md' },
        options: {},
        directive: { kind: 'embed' },
        location: createLocation(1, 1, 0, 1)
      } as DirectiveNode;
      const context = { currentFilePath: 'test.meld', state: stateService as any };

      const resolvedPath = createMeldPath('/path/to/missing.md');
      resolutionService.resolvePath.mockResolvedValue(resolvedPath);
      vi.mocked(fileSystemService.exists).mockResolvedValue(false);

      await expect(handler.execute(node, context)).rejects.toThrow(DirectiveError);
      expect(circularityService.endImport).toHaveBeenCalled();
    });

    it('should handle circular imports during transformation', async () => {
      // MIGRATION: Using centralized example for simple embed in circular import scenario
      const example = embedDirectiveExamples.atomic.simpleEmbed;
      const node = {
        type: 'Directive',
        subtype: 'embedPath',
        path: { raw: 'circular.md' },
        options: {},
        directive: { kind: 'embed' },
        location: createLocation(1, 1, 0, 1)
      } as DirectiveNode;
      const context = { currentFilePath: 'test.meld', state: stateService as any, parentState: stateService as any };

      const resolvedPath = createMeldPath('/path/to/circular.md');
      resolutionService.resolvePath.mockResolvedValue(resolvedPath);
      vi.mocked(fileSystemService.exists).mockResolvedValue(true);
      vi.mocked(circularityService.beginImport).mockImplementation(() => {
        throw new DirectiveError('Circular import detected', 'embed', DirectiveErrorCode.CIRCULAR_REFERENCE);
      });

      await expect(handler.execute(node, context)).rejects.toThrow(DirectiveError);
    });

    it('should properly transform variable-based embed directive with field access', async () => {
      // Create a complex data object
      const userData = {
        user: {
          name: 'Test User',
          profile: {
            bio: 'This is a test bio.',
            contact: {
              email: 'test@example.com',
              phone: '555-1234'
            }
          },
          settings: {
            theme: 'dark',
            notifications: true
          }
        }
      };

      // Mock the state service to return the data object
      stateService.getDataVar.mockImplementation((name) => {
        if (name === 'userData') {
          return { type: 'data', name: 'userData', value: userData } as DataVariable;
        }
        return undefined;
      });
      stateService.isTransformationEnabled.mockReturnValue(true);

      // Create a variable reference embed directive with field access
      const varReference = {
        identifier: 'userData',
        content: 'userData.user.profile.bio',
        isVariableReference: true
      };

      const node = createEmbedDirective(varReference, undefined, createLocation(1, 1));
      const context = { currentFilePath: 'test.meld', state: stateService };

      // Mock the resolution service to return the field value
      resolutionService.resolveInContext.mockResolvedValue('This is a test bio.');
      resolutionService.resolveFieldAccess.mockResolvedValue('This is a test bio.');
      resolutionService.convertToFormattedString.mockResolvedValue('This is a test bio.');

      // Execute the handler
      const result = await handler.execute(node, context);

      // Verify the result
      expect(result.replacement).toBeDefined();
      expect(result.replacement).toEqual({
        type: 'Text',
        content: 'This is a test bio.',
        location: node.location,
        formattingMetadata: {
          isFromDirective: true,
          originalNodeType: 'Directive',
          preserveFormatting: true
        }
      });

      // Verify transformation was registered correctly on the cloned state
      // Not on the original stateService
      expect(clonedState.transformNode).toHaveBeenCalledWith(node, result.replacement);
    });

    it('should properly transform variable-based embed directive with object field access', async () => {
      // Create a complex data object
      const userData = {
        user: {
          name: 'Test User',
          profile: {
            bio: 'This is a test bio.',
            contact: {
              email: 'test@example.com',
              phone: '555-1234'
            }
          }
        }
      };

      // Mock the state service to return the data object
      stateService.getDataVar.mockImplementation((name) => {
        if (name === 'userData') {
          return { type: 'data', name: 'userData', value: userData } as DataVariable;
        }
        return undefined;
      });
      stateService.isTransformationEnabled.mockReturnValue(true);

      // Create a variable reference embed directive with field access to an object
      const varReference = {
        identifier: 'userData',
        content: 'userData.user.profile.contact',
        isVariableReference: true
      };

      const node = createEmbedDirective(varReference, undefined, createLocation(1, 1));
      const context = { currentFilePath: 'test.meld', state: stateService };

      // Mock the resolution service to return the field value (an object)
      const contactObject = { email: 'test@example.com', phone: '555-1234' };
      resolutionService.resolveInContext.mockResolvedValue(JSON.stringify(contactObject, null, 2));
      resolutionService.resolveFieldAccess.mockResolvedValue(contactObject);
      resolutionService.convertToFormattedString.mockResolvedValue(
        JSON.stringify(contactObject, null, 2)
      );

      // Execute the handler
      const result = await handler.execute(node, context);

      // Verify the result
      expect(result.replacement).toBeDefined();
      expect(result.replacement).toEqual({
        type: 'Text',
        content: JSON.stringify(contactObject, null, 2),
        location: node.location,
        formattingMetadata: {
          isFromDirective: true,
          originalNodeType: 'Directive',
          preserveFormatting: true
        }
      });

      // Verify transformation was registered correctly on the cloned state
      // Not on the original stateService
      expect(clonedState.transformNode).toHaveBeenCalledWith(node, result.replacement);
    });

    it('should throw INITIALIZATION_FAILED if interpreter client is not available', async () => {
      // Arrange
      const node = { type: 'Directive', subtype: 'embedPath', path: { raw: 'any.md' }, options: {}, directive: { kind: 'embed' }, location: createLocation(1, 1, 0, 1) } as DirectiveNode;
      // Use DirectiveContext type
      const execContext: DirectiveContext = { currentFilePath: 'test.meld', state: stateService as any };

      // Configure factory to return undefined
      interpreterServiceClientFactory.getClient.mockReturnValue(undefined);

      // Act & Assert
      await expect(handler.execute(node, execContext)).rejects.toThrow(
        new DirectiveError(
          'Interpreter service client is not available. Ensure InterpreterServiceClientFactory is registered or provide a mock in tests.',
          DirectiveErrorCode.INITIALIZATION_FAILED,
          { location: node.location }
        )
      );
    });
  });
}); 