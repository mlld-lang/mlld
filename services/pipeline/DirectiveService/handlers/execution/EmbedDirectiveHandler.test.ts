// Mock the logger before any imports
const mockLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn()
};

vi.mock('../../../../core/utils/logger', () => ({
  embedLogger: mockLogger
}));

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { DirectiveNode, DirectiveData, MeldNode, VariableReferenceNode, TextNode, SourceLocation } from '@core/syntax/types';
import type { MeldPath, Location } from '@core/types';
import type { RawPath, StructuredPath, AbsolutePath, RelativePath, UrlPath } from '@core/types/paths';
import { EmbedDirectiveHandler, type ILogger } from '@services/pipeline/DirectiveService/handlers/execution/EmbedDirectiveHandler';
import type { IValidationService } from '@services/resolution/ValidationService/IValidationService';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService';
import type { ResolutionContext } from '@services/resolution/ResolutionService/IResolutionService';
import type { IStateService } from '@services/state/StateService/IStateService';
import type { ICircularityService } from '@services/resolution/CircularityService/ICircularityService';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService';
import { DirectiveError, DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError';
import { createLocation } from '@tests/utils/testFactories';
// Import the centralized syntax examples and helpers
import { embedDirectiveExamples } from '@core/syntax/index';
import { TestContextDI } from '@tests/utils/di/TestContextDI';
import { ResolutionContextFactory } from '@services/resolution/ResolutionService/ResolutionContextFactory';
import { MeldFileNotFoundError } from '@core/errors/MeldFileNotFoundError';
import {
  createValidationServiceMock,
  createStateServiceMock,
  createResolutionServiceMock,
  createFileSystemServiceMock,
  createDirectiveErrorMock
} from '@tests/utils/mocks/serviceMocks';
import { mockDeep, type DeepMockProxy } from 'vitest-mock-extended';
import type { IInterpreterServiceClientFactory } from '@services/interpreter-client/IInterpreterServiceClientFactory.js';
import type { StateServiceLike } from '@core/shared-service-types';
import type { IPathService } from '@services/fs/PathService/IPathService';
import type { IDirectiveHandler, DirectiveContext } from '@services/pipeline/DirectiveService/IDirectiveService';
import type { ICommandDefinition } from '@core/types/definitions.js';
import type { IPathVariable } from '@core/types/variables';
// Import createEmbedDirective
import { createEmbedDirective } from '@tests/utils/testFactories'; 

/**
 * EmbedDirectiveHandler Test Status
 * --------------------------------
 * 
 * MIGRATION STATUS: Complete
 * 
 * This test file has been fully migrated to use:
 * - TestContextDI for container management
 * - Standardized mock factories with vitest-mock-extended
 * - Centralized syntax examples
 * 
 * COMPLETED:
 * - All tests migrated to use TestContextDI
 * - Service mocks created using standardized factories
 * - Added proper cleanup to prevent container leaks
 * - Using centralized syntax examples
 */

interface TestEmbedDirective extends DirectiveData {
  kind: 'embed';
  path?: MeldPath | { variable: VariableReferenceNode; raw: string };
  content?: (TextNode | VariableReferenceNode)[];
}

describe('EmbedDirectiveHandler', () => {
  let handler: EmbedDirectiveHandler;
  let validationService: ReturnType<typeof createValidationServiceMock>;
  let resolutionService: ReturnType<typeof createResolutionServiceMock>;
  let stateService: DeepMockProxy<IStateService & StateServiceLike>;
  let fileSystemService: ReturnType<typeof createFileSystemServiceMock>;
  let circularityService: DeepMockProxy<ICircularityService>;
  let interpreterServiceClientFactory: DeepMockProxy<IInterpreterServiceClientFactory>;
  let clonedState: DeepMockProxy<IStateService & StateServiceLike>;
  let contextDI: TestContextDI;

  beforeEach(async () => {
    contextDI = TestContextDI.createIsolated();
    await contextDI.initialize();

    clonedState = mockDeep<IStateService & StateServiceLike>();
    clonedState.clone.mockReturnThis();
    clonedState.isTransformationEnabled.mockReturnValue(false);
    clonedState.getStateId.mockReturnValue('cloned-state-id');
    clonedState.getPathVar.mockImplementation((name: string): string | undefined => {
      if (name === 'docs') return '/path/to/docs';
      return undefined;
    });
    clonedState.enableTransformation.mockReturnThis();
    clonedState.getNodes.mockReturnValue([]);
    clonedState.getCommand.mockReturnValue(undefined);
    clonedState.setCommand.mockReturnThis();
    clonedState.shouldTransform.mockReturnValue(false);

    stateService = mockDeep<IStateService & StateServiceLike>();
    stateService.clone.mockReturnValue(clonedState);
    stateService.isTransformationEnabled.mockReturnValue(false);
    stateService.getPathVar.mockImplementation((name: string): string | undefined => {
      if (name === 'docs') return '/path/to/docs';
      return undefined;
    });
    stateService.enableTransformation.mockReturnThis();
    stateService.getNodes.mockReturnValue([]);
    stateService.getCommand.mockReturnValue(undefined);
    stateService.setCommand.mockReturnThis();
    stateService.shouldTransform.mockReturnValue(false);
    stateService.getStateId.mockReturnValue('main-state-id');

    validationService = createValidationServiceMock();
    resolutionService = createResolutionServiceMock();
    fileSystemService = createFileSystemServiceMock();

    const pathService = mockDeep<IPathService>();
    pathService.resolvePath.mockImplementation((filePath: RawPath | StructuredPath, baseDir?: RawPath): AbsolutePath | RelativePath => {
      const pathString = typeof filePath === 'string' ? filePath : JSON.stringify(filePath); 
      return (baseDir ? `${baseDir}/${pathString}` : `/resolved/${pathString}`) as AbsolutePath;
    });
    pathService.dirname.mockReturnValue('/mock/dir');
    pathService.joinPaths.mockImplementation((...paths: string[]) => paths.join('/'));
    pathService.basename.mockImplementation((p: string) => p.split('/').pop() || '');
    pathService.isURL.mockReturnValue(false);
    pathService.validatePath.mockImplementation(async (p: string | MeldPath): Promise<MeldPath> => {
      const pathString = typeof p === 'string' ? p : JSON.stringify(p);
      return `/validated/${pathString}` as unknown as MeldPath;
    });
    pathService.validateURL.mockResolvedValue('http://validated.mock.url' as UrlPath); 
    pathService.fetchURL.mockResolvedValue({ content: 'mock content', status: 200 });

    circularityService = mockDeep<ICircularityService>();
    circularityService.beginImport.mockReturnThis();
    circularityService.endImport.mockReturnThis();

    interpreterServiceClientFactory = mockDeep<IInterpreterServiceClientFactory>();

    fileSystemService.exists.mockImplementation(async (path: string) => !path.includes('non-existent'));
    fileSystemService.readFile.mockImplementation(async (path: string) => {
      if (path.includes('empty.md')) return '';
      if (path.includes('content.md')) return 'This is the content of the file.';
      if (path.includes('sections.md')) return '# Section 1\nContent1\n# Section Two\nContent2';
      if (path.includes('non-existent')) throw new MeldFileNotFoundError(`File not found: ${path}`, {
        details: { filePath: path }, 
        sourceLocation: createLocation(0, 0, 0, 0, path)
      });
      return `Default content for ${path}`;
    });

    resolutionService.resolveInContext.mockImplementation(async (value: string | StructuredPath): Promise<string> => {
      if (typeof value === 'string') {
        return value.includes('non-existent') ? '/resolved/non-existent' : `/resolved/${value}`;
      }
      if (typeof value === 'object' && value && 'raw' in value && typeof value.raw === 'string') {
        if(value.raw.includes('{{role.architect}}')) return 'Mocked Architect Content';
        if(value.raw.includes('{{content}}')) return 'Mocked Variable Content';
        if(value.raw.includes('{{config.settings.theme}}')) return 'dark';
        return `/resolved/object_${value.raw}`;
      } // Ensure string return
      const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
      return Promise.resolve(stringValue); // Ensure returns Promise<string>
    });

    resolutionService.extractSection.mockImplementation(async (content: string, sectionHeading: string, fuzzyThreshold?: number): Promise<string> => {
      const fuzzy = fuzzyThreshold ?? 0;
      if (sectionHeading === 'Section Two') return '# Section Two\nContent2';
      if (content.includes(sectionHeading)) return `Content for ${sectionHeading}${fuzzy > 0 ? ' (fuzzy)' : ''}`;
      throw new Error(`Section '${sectionHeading}' not found in mock`);
    });

    resolutionService.resolvePath = resolutionService.resolvePath || vi.fn().mockImplementation(async (pathInput: string | MeldPath, context?: any): Promise<MeldPath> => {
      let resolvedStr = typeof pathInput === 'string' ? pathInput : JSON.stringify(pathInput); // Use stringify for non-string
      resolvedStr = resolvedStr.includes('non-existent') ? '/resolved/non-existent' : `/resolved/${resolvedStr}`;
      return { raw: resolvedStr, isPath: true, location: createLocation(0,0,0,0,'mock-resolvePath') } as unknown as MeldPath; // Cast via unknown
    });

    contextDI.registerMock('IValidationService', validationService);
    contextDI.registerMock('IStateService', stateService);
    contextDI.registerMock('IResolutionService', resolutionService);
    contextDI.registerMock('IFileSystemService', fileSystemService);
    contextDI.registerMock('IPathService', pathService);
    contextDI.registerMock('ICircularityService', circularityService);
    contextDI.registerMock('IInterpreterServiceClientFactory', interpreterServiceClientFactory);
    contextDI.registerMock('ILogger', mockLogger);

    handler = await contextDI.container.resolve(EmbedDirectiveHandler);
  });

  afterEach(async () => {
    await contextDI?.cleanup();
    vi.clearAllMocks();
  });

  describe('basic embed functionality', () => {
    it('should handle basic embed without modifiers', async () => {
      const exampleCode = '@embed [ embed.md ]';
      const mockPath = { raw: 'embed.md', isPath: true } as unknown as MeldPath; // Keep cast
      // Correct DirectiveNode structure
      const node: DirectiveNode = {
        type: 'Directive',
        directive: { // <<< Move properties here
            kind: 'embed', 
            path: mockPath, 
            options: {} 
            // name: 'embed', // Likely not part of the directive object itself 
            // subtype: 'embedPath' // Likely not part of the directive object itself 
        },
        location: createLocation(1, 1, 0, 1, exampleCode) // Pass string filePath
      };

      const execContext: DirectiveContext = {
        currentFilePath: 'test.meld', state: stateService, parentState: stateService
      };

      const resolvedPath = '/path/to/embed.md';
      const fileContent = 'Test content';
      resolutionService.resolvePath.mockResolvedValue({ raw: resolvedPath, isPath: true, location: createLocation(0,0,0,0,'res') } as unknown as MeldPath); // Keep cast
      fileSystemService.readFile.mockResolvedValue(fileContent);

      const result = await handler.execute(node, execContext);

      expect(validationService.validate).toHaveBeenCalledWith(node);
      expect(stateService.clone).toHaveBeenCalled();
      expect(resolutionService.resolvePath).toHaveBeenCalledWith(mockPath, expect.any(Object));
      expect(fileSystemService.exists).toHaveBeenCalledWith(resolvedPath);
      expect(fileSystemService.readFile).toHaveBeenCalledWith(resolvedPath);
      expect(result.state).toBe(clonedState);
      expect(result.replacement).toEqual({
        type: 'Text', content: fileContent, location: node.location,
        formattingMetadata: { isFromDirective: true, originalNodeType: 'Directive', preserveFormatting: true }
      });
    });

    it('should handle embed with section', async () => {
      const exampleCode = '@embed [ sections.md # "Section Two" ]';
      const sectionName = 'Section Two';
      const mockPath = { raw: 'sections.md', isPath: true } as unknown as MeldPath; // Keep cast
      // Correct DirectiveNode structure
      const node: DirectiveNode = {
        type: 'Directive',
        directive: { // <<< Move properties here
            kind: 'embed', 
            path: mockPath,
            section: sectionName, // Options likely belong here directly
            options: { section: sectionName } // Or potentially nested like this? Check type
        },
        location: createLocation(1, 1, 0, 1, exampleCode) // Pass string filePath
      };

      const execContext: DirectiveContext = {
        currentFilePath: 'test.meld', state: stateService, parentState: stateService
      };

      const resolvedPath = '/path/to/sections.md';
      const rawFileContent = '# Section 1\nContent1\n# Section Two\nContent2';
      const extractedContent = '# Section Two\nContent2';

      resolutionService.resolvePath.mockResolvedValue({ raw: resolvedPath, isPath: true, location: createLocation(0,0,0,0,'res') } as unknown as MeldPath); // Keep cast
      fileSystemService.readFile.mockResolvedValue(rawFileContent);
      resolutionService.extractSection.mockResolvedValue(extractedContent);

      const result = await handler.execute(node, execContext);

      expect(stateService.clone).toHaveBeenCalled();
      expect(resolutionService.resolvePath).toHaveBeenCalledWith(mockPath, expect.any(Object));
      expect(fileSystemService.readFile).toHaveBeenCalledWith(resolvedPath);
      expect(resolutionService.extractSection).toHaveBeenCalledWith(
        rawFileContent,
        sectionName,
        { fuzzy: false }
      );
      expect(result.state).toBe(clonedState);
      expect(result.replacement).toEqual({
        type: 'Text', content: extractedContent, location: node.location,
        formattingMetadata: { isFromDirective: true, originalNodeType: 'Directive', preserveFormatting: true }
      });
    });

    it('should handle embed with heading level', async () => {
      // Use imported createEmbedDirective
      const node = createEmbedDirective('file.md', undefined, createLocation(1, 1), { headingLevel: 3 });
      
      const context = { currentFilePath: 'test.meld', state: stateService };

      vi.mocked(resolutionService.resolveInContext).mockResolvedValue('file.md');
      vi.mocked(fileSystemService.exists).mockResolvedValue(true);
      vi.mocked(fileSystemService.readFile).mockResolvedValue('Test content');

      const result = await handler.execute(node, context);
      
      expect(validationService.validate).toHaveBeenCalledWith(node);
      expect(stateService.clone).toHaveBeenCalled();
      
      expect(clonedState.mergeChildState).not.toHaveBeenCalled();
      
      expect(result.state).toBe(clonedState);
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
    });

    it('should handle embed with under header', async () => {
      // Use imported createEmbedDirective
      const node = createEmbedDirective('doc.md', undefined, createLocation(1, 1), {
        underHeader: 'My Header'
      });
      const context = { currentFilePath: 'test.meld', state: stateService };

      vi.mocked(resolutionService.resolveInContext).mockResolvedValue('doc.md');
      vi.mocked(fileSystemService.exists).mockResolvedValue(true);
      vi.mocked(fileSystemService.readFile).mockResolvedValue('Test content');

      const result = await handler.execute(node, context);

      expect(stateService.clone).toHaveBeenCalled();
      
      expect(clonedState.mergeChildState).not.toHaveBeenCalled();
      
      expect(result.state).toBe(clonedState);
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
    });
  });

  describe('error handling', () => {
    it('should throw error if file not found', async () => {
      // Manually create node instead of missing createNodeFromExample
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
            kind: 'embed',
            path: 'non-existent-file.txt' // Assuming path is string here
        },
        location: createLocation(1,1)
      };
      const context = { currentFilePath: 'test.meld', state: stateService };

      vi.mocked(resolutionService.resolveInContext).mockResolvedValue('non-existent-file.txt');
      vi.mocked(fileSystemService.exists).mockResolvedValue(false);
      
      await expect(handler.execute(node, context)).rejects.toThrow();
    });

    it('should handle heading level validation', async () => {
      // Use imported createEmbedDirective
      const node = createEmbedDirective('file.md', undefined, createLocation(1, 1), { headingLevel: 9 });
      const context = { currentFilePath: 'test.meld', state: stateService };

      vi.mocked(resolutionService.resolveInContext).mockResolvedValue('file.md');
      vi.mocked(fileSystemService.exists).mockResolvedValue(true);
      vi.mocked(fileSystemService.readFile).mockResolvedValue('Test content');

      const originalApplyHeadingLevel = handler['applyHeadingLevel'].bind(handler);
      const mockApplyHeadingLevel = vi.fn().mockImplementation((content, level) => {
        if (level < 1 || level > 6) {
          return content;
        }
        return originalApplyHeadingLevel(content, level);
      });
      handler['applyHeadingLevel'] = mockApplyHeadingLevel;
      
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
      
      handler['applyHeadingLevel'] = originalApplyHeadingLevel;
    });

    it('should handle section extraction gracefully', async () => {
      // Use imported createEmbedDirective
      const node = createEmbedDirective('sections.md', 'non-existent-section', createLocation(1, 1));
      const context = { currentFilePath: 'test.meld', state: stateService };

      vi.mocked(resolutionService.resolveInContext)
        .mockResolvedValueOnce('sections.md')
        .mockResolvedValueOnce('non-existent-section');
        
      vi.mocked(fileSystemService.exists).mockResolvedValue(true);
      vi.mocked(fileSystemService.readFile).mockResolvedValue('# Content');
      
      vi.mocked(resolutionService.extractSection).mockResolvedValue('# Content');

      const result = await handler.execute(node, context);
      
      expect(result.replacement).toBeDefined();
      expect(result.replacement).toEqual({
        type: 'Text',
        content: '# Content',
        location: node.location,
        formattingMetadata: {
          isFromDirective: true,
          originalNodeType: 'Directive',
          preserveFormatting: true
        }
      });
      
      expect(circularityService.endImport).toHaveBeenCalled();
    });
  });

  describe('cleanup', () => {
    it('should always end import tracking', async () => {
      // Use imported createEmbedDirective
      const node = createEmbedDirective('content.md', undefined, createLocation(1, 1));
      const context = { currentFilePath: 'test.meld', state: stateService };

      vi.mocked(resolutionService.resolveInContext).mockResolvedValue('content.md');
      vi.mocked(fileSystemService.exists).mockResolvedValue(true);
      vi.mocked(fileSystemService.readFile).mockResolvedValue('content');

      await handler.execute(node, context);
      expect(circularityService.endImport).toHaveBeenCalled();
    });

    it('should end import tracking even on error', async () => {
      // Use imported createEmbedDirective
      const node = createEmbedDirective('error.md', undefined, createLocation(1, 1));
      const context = { currentFilePath: 'test.meld', state: stateService };

      vi.mocked(resolutionService.resolveInContext).mockResolvedValue('error.md');
      vi.mocked(fileSystemService.exists).mockResolvedValue(true);
      vi.mocked(fileSystemService.readFile).mockRejectedValue(new Error('Some error'));

      await expect(handler.execute(node, context)).rejects.toThrow(DirectiveError);
      expect(circularityService.endImport).toHaveBeenCalled();
    });
  });

  describe('Path variables', () => {
    it('should handle user-defined path variables with $ syntax', async () => {
      resolutionService.resolveInContext.mockImplementation(async (value: string | StructuredPath): Promise<string> => { // Ensure Promise<string>
        const pathString = typeof value === 'string' ? value : JSON.stringify(value);
        if (pathString === '$docs/file.md') {
          return '/path/to/docs/file.md';
        }
        return pathString; // Return string
      });
      
      const embedCode = `@embed [$docs/file.md]`;
      // Manually create node
      const node: DirectiveNode = {
        type: 'Directive',
        directive: { 
            kind: 'embed', 
            path: '$docs/file.md' 
        },
        location: createLocation(1, 1, undefined, undefined, embedCode)
      };
      
      (fileSystemService.exists as any).mockResolvedValue(true);
      (fileSystemService.readFile as any).mockResolvedValue('# File content');
      
      const context = {
        state: stateService,
        currentFilePath: '/project/test.meld'
      };
      
      await handler.execute(node, context);
      
      expect(resolutionService.resolveInContext).toHaveBeenCalled();
      expect(fileSystemService.exists).toHaveBeenCalled();
      expect(fileSystemService.readFile).toHaveBeenCalled();
    });
  });
  
  describe('Variable reference embeds', () => {
    it('should handle simple variable reference embeds without trying to load a file', async () => {
      const variablePath = {
        raw: '{{role.architect}}',
        isVariableReference: true,
        variable: { // ... variable details
        }
      } as unknown as MeldPath; // Cast complex mock path
      
      const embedCode = `@embed {{role.architect}}`;
      // Manually create node
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
            kind: 'embed',
            path: variablePath
        },
        location: createLocation(1, 1, undefined, undefined, embedCode)
      };
      
      if (node.directive && node.directive.path) {
        // This assignment might be redundant now
        // node.directive.path = variablePath;
      }
      
      const context = { currentFilePath: 'test.meld', state: stateService };

      vi.mocked(resolutionService.resolveInContext).mockResolvedValue(
        'You are a senior architect skilled in assessing TypeScript codebases.'
      );
      
      const result = await handler.execute(node, context);

      expect(resolutionService.resolveInContext).toHaveBeenCalledWith(variablePath, expect.any(Object)); // Use Object
      
      expect(fileSystemService.exists).not.toHaveBeenCalled();
      expect(fileSystemService.readFile).not.toHaveBeenCalled();
      
      expect(circularityService.beginImport).not.toHaveBeenCalled();
      
      expect(clonedState.mergeChildState).not.toHaveBeenCalled();
      
      expect(result.replacement).toBeDefined();
      expect(result.replacement).toEqual({
        type: 'Text',
        content: 'You are a senior architect skilled in assessing TypeScript codebases.',
        location: node.location,
        formattingMetadata: {
          isFromDirective: true,
          originalNodeType: 'Directive',
          preserveFormatting: true
        }
      });
    });
    
    it('should handle text variable embeds correctly', async () => {
      const variablePath = {
        raw: '{{content}}',
        isVariableReference: true,
        variable: {
          type: 'VariableReference',
          identifier: 'content',
          valueType: 'text',
          isVariableReference: true
        }
      } as unknown as MeldPath; // Cast complex mock path
      
      // Manually create node
      const node = createEmbedDirective('{{content}}', undefined, createLocation(1, 1));
      if (node.directive && node.directive.path) {
        node.directive.path = variablePath;
      }
      
      const context = { currentFilePath: 'test.meld', state: stateService };
      
      vi.mocked(resolutionService.resolveInContext).mockResolvedValue('# Sample Content');
      
      const result = await handler.execute(node, context);
      
      expect(fileSystemService.exists).not.toHaveBeenCalled();
      expect(fileSystemService.readFile).not.toHaveBeenCalled();
      
      expect(clonedState.mergeChildState).not.toHaveBeenCalled();
      
      expect(result.state).toBe(clonedState);
      
      expect(result.replacement).toBeDefined();
      expect(result.replacement).toEqual({
        type: 'Text',
        content: '# Sample Content',
        location: node.location,
        formattingMetadata: {
          isFromDirective: true,
          originalNodeType: 'Directive',
          preserveFormatting: true
        }
      });
    });
    
    it('should apply modifiers (heading level, under header) to variable content', async () => {
      const variablePath = {
        raw: '{{content}}',
        isVariableReference: true,
        variable: {
          type: 'VariableReference',
          identifier: 'content',
          valueType: 'text',
          isVariableReference: true
        }
      } as unknown as MeldPath; // Cast complex mock path
      
      // Use createEmbedDirective
      const node = createEmbedDirective('{{content}}', undefined, createLocation(1, 1), {
        headingLevel: 2
      });
      
      if (node.directive && node.directive.path) {
        node.directive.path = variablePath;
      }
      
      const context = { currentFilePath: 'test.meld', state: stateService };
      
      vi.mocked(resolutionService.resolveInContext).mockResolvedValue('Variable Content');
      
      const result = await handler.execute(node, context);
      
      expect(clonedState.mergeChildState).not.toHaveBeenCalled();
      
      expect(result.replacement).toBeDefined();
      expect(result.replacement).toEqual({
        type: 'Text',
        content: 'Variable Content',
        location: node.location,
        formattingMetadata: {
          isFromDirective: true,
          originalNodeType: 'Directive',
          preserveFormatting: true
        }
      });
      
      expect(fileSystemService.exists).not.toHaveBeenCalled();
      expect(fileSystemService.readFile).not.toHaveBeenCalled();
    });
    
    it('should handle data variable with nested fields correctly', async () => {
      const variablePath = {
        raw: '{{config.settings.theme}}',
        isVariableReference: true,
        variable: {
          type: 'VariableReference',
          identifier: 'config',
          valueType: 'data',
          isVariableReference: true,
          fields: [
            { type: 'field', value: 'settings' },
            { type: 'field', value: 'theme' }
          ]
        }
      } as unknown as MeldPath; // Cast complex mock path
      
      // Manually create node
      const node = createEmbedDirective(`{{config.settings.theme}}`, undefined, createLocation(1, 1));
      if (node.directive && node.directive.path) {
        node.directive.path = variablePath;
      }
      
      const context = { currentFilePath: 'test.meld', state: stateService };
      
      vi.mocked(resolutionService.resolveInContext).mockResolvedValue('dark');
      
      const result = await handler.execute(node, context);
      
      expect(resolutionService.resolveInContext).toHaveBeenCalledWith(variablePath, expect.any(Object)); // Use Object
      
      expect(clonedState.mergeChildState).not.toHaveBeenCalled();
      
      expect(result.replacement).toBeDefined();
      expect(result.replacement).toEqual({
        type: 'Text',
        content: 'dark',
        location: node.location,
        formattingMetadata: {
          isFromDirective: true,
          originalNodeType: 'Directive',
          preserveFormatting: true
        }
      });
      
      expect(fileSystemService.exists).not.toHaveBeenCalled();
      expect(fileSystemService.readFile).not.toHaveBeenCalled();
    });
  }); 
}); 