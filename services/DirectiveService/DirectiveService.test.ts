import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { DirectiveService } from './DirectiveService';
import {
  createTextDirective,
  createDataDirective,
  createImportDirective,
  createEmbedDirective,
  createLocation,
  createDirectiveNode
} from '../../tests/utils/testFactories';
import { MeldDirectiveError } from '../../core/errors/MeldDirectiveError';
import { MeldImportError } from '../../core/errors/MeldImportError';
import type { IValidationService } from '../ValidationService/IValidationService';
import type { IStateService } from '../StateService/IStateService';
import type { IPathService } from '../PathService/IPathService';
import type { IFileSystemService } from '../FileSystemService/IFileSystemService';
import type { IParserService } from '../ParserService/IParserService';
import type { IInterpreterService } from '../InterpreterService/IInterpreterService';
import type { ICircularityService } from '../CircularityService/ICircularityService';
import type { IResolutionService } from '../ResolutionService/IResolutionService';
import type { DirectiveNode, MeldNode } from '../../tests/mocks/meld-spec';
import type { PathOptions } from '../PathService/IPathService';
import type { InterpreterOptions } from '../InterpreterService/IInterpreterService';
import type { ResolutionContext } from '../ResolutionService/IResolutionService';
import type { IDirectiveService } from '../DirectiveService/IDirectiveService';
import { DirectiveError, DirectiveErrorCode } from './errors/DirectiveError';

// Create mock implementations
const createMockParserService = (): IParserService => ({
  parse: vi.fn().mockResolvedValue([]),
  parseWithLocations: vi.fn().mockResolvedValue([])
});

const createMockInterpreterService = (): IInterpreterService => ({
  interpret: vi.fn().mockResolvedValue({} as IStateService),
  initialize: vi.fn(),
  interpretNode: vi.fn().mockResolvedValue({} as IStateService),
  createChildContext: vi.fn().mockResolvedValue({} as IStateService)
});

const createMockCircularityService = (): ICircularityService => ({
  beginImport: vi.fn(),
  endImport: vi.fn(),
  isInStack: vi.fn().mockReturnValue(false),
  getImportStack: vi.fn().mockReturnValue([]),
  reset: vi.fn()
});

const createMockResolutionService = (): IResolutionService => ({
  resolveInContext: vi.fn().mockResolvedValue(''),
  resolvePath: vi.fn().mockResolvedValue('/resolved/path'),
  resolveText: vi.fn().mockResolvedValue(''),
  resolveData: vi.fn().mockResolvedValue({}),
  resolveCommand: vi.fn().mockResolvedValue(''),
  resolveContent: vi.fn().mockResolvedValue(''),
  extractSection: vi.fn().mockResolvedValue(''),
  validateResolution: vi.fn().mockResolvedValue(undefined),
  detectCircularReferences: vi.fn().mockResolvedValue(undefined)
});

const createMockValidationService = (): IValidationService => ({
  validate: vi.fn(),
  registerValidator: vi.fn(),
  removeValidator: vi.fn(),
  hasValidator: vi.fn().mockReturnValue(false),
  getRegisteredDirectiveKinds: vi.fn().mockReturnValue([])
});

const createMockStateService = (): IStateService => ({
  setTextVar: vi.fn(),
  getTextVar: vi.fn(),
  setDataVar: vi.fn(),
  getDataVar: vi.fn(),
  addNode: vi.fn(),
  createChildState: vi.fn().mockReturnValue({} as IStateService),
  getNodes: vi.fn().mockReturnValue([]),
  getAllTextVars: vi.fn().mockReturnValue(new Map()),
  getLocalTextVars: vi.fn().mockReturnValue(new Map()),
  getAllDataVars: vi.fn().mockReturnValue(new Map()),
  getLocalDataVars: vi.fn().mockReturnValue(new Map()),
  getPathVar: vi.fn(),
  setPathVar: vi.fn(),
  getAllPathVars: vi.fn().mockReturnValue(new Map()),
  getCommand: vi.fn(),
  setCommand: vi.fn(),
  addImport: vi.fn(),
  removeImport: vi.fn(),
  hasImport: vi.fn().mockReturnValue(false),
  getImports: vi.fn().mockReturnValue(new Set()),
  getCurrentFilePath: vi.fn().mockReturnValue(''),
  setCurrentFilePath: vi.fn(),
  hasLocalChanges: vi.fn().mockReturnValue(false),
  getLocalChanges: vi.fn().mockReturnValue([]),
  setImmutable: vi.fn(),
  isImmutable: false,
  mergeChildState: vi.fn(),
  clone: vi.fn().mockReturnValue({} as IStateService),
  appendContent: vi.fn()
});

const createMockPathService = (): IPathService => ({
  validatePath: vi.fn().mockResolvedValue(''),
  normalizePath: vi.fn().mockReturnValue(''),
  resolvePath: vi.fn().mockReturnValue(''),
  initialize: vi.fn(),
  enableTestMode: vi.fn(),
  disableTestMode: vi.fn(),
  isTestMode: vi.fn().mockReturnValue(false),
  join: vi.fn().mockReturnValue(''),
  dirname: vi.fn().mockReturnValue(''),
  basename: vi.fn().mockReturnValue('')
});

const createMockFileSystemService = (): IFileSystemService => ({
  readFile: vi.fn().mockResolvedValue(''),
  writeFile: vi.fn().mockResolvedValue(undefined),
  exists: vi.fn().mockResolvedValue(true),
  isDirectory: vi.fn().mockResolvedValue(false),
  isFile: vi.fn().mockResolvedValue(true),
  stat: vi.fn().mockResolvedValue({} as any),
  readDir: vi.fn().mockResolvedValue([]),
  ensureDir: vi.fn().mockResolvedValue(undefined),
  join: vi.fn().mockReturnValue(''),
  dirname: vi.fn().mockReturnValue(''),
  basename: vi.fn().mockReturnValue(''),
  normalize: vi.fn().mockReturnValue(''),
  resolve: vi.fn().mockReturnValue(''),
  enableTestMode: vi.fn(),
  disableTestMode: vi.fn(),
  isTestMode: vi.fn().mockReturnValue(false),
  mockFile: vi.fn(),
  mockDir: vi.fn(),
  clearMocks: vi.fn()
});

describe('DirectiveService', () => {
  let service: DirectiveService;
  let validationService: IValidationService;
  let stateService: IStateService;
  let pathService: IPathService;
  let fileSystemService: IFileSystemService;
  let parserService: IParserService;
  let interpreterService: IInterpreterService;
  let circularityService: ICircularityService;
  let resolutionService: IResolutionService;
  let parseMock: Mock;

  beforeEach(() => {
    // Create fresh instances of mocks
    validationService = createMockValidationService();
    stateService = createMockStateService();
    pathService = createMockPathService();
    fileSystemService = createMockFileSystemService();
    
    // Create parser service with specific mock for parse
    parseMock = vi.fn();
    const mockParseImpl = async (content: string): Promise<MeldNode[]> => [];
    parseMock.mockImplementation(mockParseImpl);
    
    parserService = {
      parse: parseMock,
      parseWithLocations: vi.fn().mockImplementation(async (content: string, filePath?: string) => [])
    };
    
    interpreterService = createMockInterpreterService();
    circularityService = createMockCircularityService();
    resolutionService = createMockResolutionService();

    service = new DirectiveService();
    service.initialize(
      validationService,
      stateService,
      pathService,
      fileSystemService,
      parserService,
      interpreterService,
      circularityService,
      resolutionService
    );
  });

  describe('Service initialization', () => {
    it('should initialize with all required services', () => {
      expect(() => service.getSupportedDirectives()).not.toThrow();
    });

    it('should support all default directive types', () => {
      const supported = service.getSupportedDirectives();
      expect(supported).toContain('text');
      expect(supported).toContain('data');
      expect(supported).toContain('import');
      expect(supported).toContain('embed');
      expect(supported).toContain('run');
    });

    it('should throw if used before initialization', () => {
      const uninitializedService = new DirectiveService();
      expect(() => uninitializedService.getSupportedDirectives()).toThrow();
    });
  });

  describe('Handler registration', () => {
    it('should allow registering custom handlers', () => {
      const customHandler = {
        kind: 'custom',
        execute: vi.fn()
      };
      service.registerHandler(customHandler);
      expect(service.hasHandler('custom')).toBe(true);
    });

    it('should override existing handlers', () => {
      const customTextHandler = {
        kind: 'text',
        execute: vi.fn()
      };
      service.registerHandler(customTextHandler);
      expect(service.hasHandler('text')).toBe(true);
    });
  });

  describe('Service-level validation', () => {
    it('should validate directive type', async () => {
      const invalidNode = {
        type: 'Text', // Should be 'Directive'
        directive: {
          kind: 'text',
          name: 'test',
          value: 'value'
        }
      } as unknown as DirectiveNode;

      await expect(service.processDirective(invalidNode)).rejects.toThrow(DirectiveError);
    });

    it('should validate handler exists', async () => {
      const unknownDirective = {
        type: 'Directive',
        directive: {
          kind: 'unknown'
        }
      } as unknown as DirectiveNode;

      await expect(service.processDirective(unknownDirective)).rejects.toThrow(DirectiveError);
    });
  });

  describe('Cross-handler interactions', () => {
    it('should process nested directives', async () => {
      // Create a text directive that contains an @embed
      const textNode = createTextDirective('content', '@embed [file.md]', createLocation(1, 1));
      const embedContent = 'Embedded content';
      
      vi.mocked(fileSystemService.exists).mockResolvedValue(true);
      vi.mocked(fileSystemService.readFile).mockResolvedValue(embedContent);
      vi.mocked(parserService.parse).mockResolvedValue([
        { type: 'Text', content: embedContent } as MeldNode
      ]);

      await service.processDirective(textNode);

      // Verify the text directive was processed
      expect(validationService.validate).toHaveBeenCalledWith(textNode);
      expect(stateService.setTextVar).toHaveBeenCalledWith('content', '@embed [file.md]');
    });

    it('should handle circular imports', async () => {
      const importNode = createImportDirective('circular.md', createLocation(1, 1));
      
      vi.mocked(circularityService.beginImport).mockImplementationOnce(() => {
        throw new Error('Circular import detected');
      });

      await expect(service.processDirective(importNode)).rejects.toThrow();
      expect(circularityService.beginImport).toHaveBeenCalled();
    });
  });

  describe('Error propagation', () => {
    it('should wrap handler errors in DirectiveError', async () => {
      const textNode = createTextDirective('test', 'value', createLocation(1, 1));
      
      vi.mocked(validationService.validate).mockImplementationOnce(() => {
        throw new Error('Internal error');
      });

      const error = await service.processDirective(textNode).catch(e => e);
      expect(error).toBeInstanceOf(DirectiveError);
      expect(error.code).toBe(DirectiveErrorCode.EXECUTION_FAILED);
    });

    it('should preserve original error details', async () => {
      const textNode = createTextDirective('test', 'value', createLocation(1, 1));
      const originalError = new Error('Original error');
      
      vi.mocked(validationService.validate).mockImplementationOnce(() => {
        throw originalError;
      });

      const error = await service.processDirective(textNode).catch(e => e);
      expect(error.details.cause).toBe(originalError);
    });
  });

  describe('Context management', () => {
    it('should create child contexts with correct properties', () => {
      const parentContext = {
        currentFilePath: 'parent.md'
      };
      
      const childContext = service.createChildContext(parentContext, 'child.md');
      
      expect(childContext.currentFilePath).toBe('child.md');
    });

    it('should pass context to handlers', async () => {
      const textNode = createTextDirective('test', 'value', createLocation(1, 1));
      const context = { currentFilePath: 'test.md' };

      await service.handleDirective(textNode, context);

      // Verify context was passed through
      expect(validationService.validate).toHaveBeenCalledWith(textNode);
    });
  });

  describe('Text directive handling', () => {
    it('should process a valid text directive', async () => {
      const node = createTextDirective('greeting', 'Hello', createLocation(1, 1));
      await service.processDirective(node);
      expect(validationService.validate).toHaveBeenCalledWith(node);
      expect(stateService.setTextVar).toHaveBeenCalledWith('greeting', 'Hello');
    });

    it('should handle validation errors', async () => {
      const node = createTextDirective('greeting', 'Hello', createLocation(1, 1));

      vi.mocked(validationService.validate).mockImplementationOnce(() => {
        throw new MeldDirectiveError('Invalid text directive', 'text');
      });

      await expect(service.processDirective(node)).rejects.toThrow(MeldDirectiveError);
    });
  });

  describe('Data directive handling', () => {
    it('should process a valid data directive with string value', async () => {
      const node = createDataDirective('config', '{"key": "value"}', createLocation(1, 1));

      await service.processDirective(node);

      expect(validationService.validate).toHaveBeenCalledWith(node);
      expect(stateService.setDataVar).toHaveBeenCalledWith('config', { key: 'value' });
    });

    it('should process a valid data directive with object value', async () => {
      const node = createDataDirective('config', { key: 'value' }, createLocation(1, 1));

      await service.processDirective(node);

      expect(validationService.validate).toHaveBeenCalledWith(node);
      expect(stateService.setDataVar).toHaveBeenCalledWith('config', { key: 'value' });
    });
  });

  describe('Import directive handling', () => {
    it('should process a valid import directive', async () => {
      const node = createImportDirective('test.md', createLocation(1, 1));
      const mockContent = 'Test content';
      const mockParsedNodes = [{ type: 'Text', content: 'Test content' }] as MeldNode[];
      const mockChildState = {} as IStateService;

      vi.mocked(fileSystemService.exists).mockResolvedValue(true);
      vi.mocked(fileSystemService.readFile).mockResolvedValue(mockContent);
      vi.mocked(parserService.parse).mockResolvedValue(mockParsedNodes);
      vi.mocked(stateService.createChildState).mockReturnValue(mockChildState);

      await service.processDirective(node);

      expect(validationService.validate).toHaveBeenCalledWith(node);
      expect(fileSystemService.exists).toHaveBeenCalled();
      expect(fileSystemService.readFile).toHaveBeenCalled();
      expect(parserService.parse).toHaveBeenCalledWith(mockContent);
    });

    it('should handle missing import files', async () => {
      const node = createImportDirective('missing.md', createLocation(1, 1));

      vi.mocked(pathService.resolvePath).mockResolvedValueOnce('/resolved/missing.md');
      vi.mocked(fileSystemService.exists).mockResolvedValueOnce(false);

      await expect(service.processDirective(node)).rejects.toThrow(MeldDirectiveError);
    });
  });

  describe('Embed directive handling', () => {
    it('should process a valid embed directive', async () => {
      const node = createEmbedDirective('test.md', undefined, createLocation(1, 1));
      const mockContent = 'Test content';
      const mockParsedNodes = [{ type: 'Text', content: 'Test content' }] as MeldNode[];
      const mockChildState = {} as IStateService;

      vi.mocked(pathService.resolvePath).mockResolvedValueOnce('/resolved/test.md');
      vi.mocked(fileSystemService.exists).mockResolvedValueOnce(true);
      vi.mocked(fileSystemService.readFile).mockResolvedValueOnce(mockContent);
      vi.mocked(stateService.createChildState).mockReturnValueOnce(mockChildState);
      vi.mocked(parserService.parse).mockReturnValueOnce(mockParsedNodes);
      vi.mocked(interpreterService.interpret).mockResolvedValueOnce(mockChildState);

      await service.processDirective(node);

      expect(validationService.validate).toHaveBeenCalledWith(node);
      expect(pathService.resolvePath).toHaveBeenCalledWith('test.md');
      expect(fileSystemService.exists).toHaveBeenCalledWith('/resolved/test.md');
      expect(fileSystemService.readFile).toHaveBeenCalledWith('/resolved/test.md', 'utf8');
      expect(stateService.createChildState).toHaveBeenCalled();
      expect(parserService.parse).toHaveBeenCalledWith(mockContent);
      expect(interpreterService.interpret).toHaveBeenCalledWith(
        mockParsedNodes,
        expect.objectContaining({
          initialState: mockChildState,
          filePath: '/resolved/test.md',
          mergeState: true
        })
      );
    });

    it('should handle missing embed files', async () => {
      const node = createEmbedDirective('missing.md', undefined, createLocation(1, 1));

      vi.mocked(pathService.resolvePath).mockResolvedValueOnce('/resolved/missing.md');
      vi.mocked(fileSystemService.exists).mockResolvedValueOnce(false);

      await expect(service.processDirective(node)).rejects.toThrow(MeldDirectiveError);
    });

    it('should throw with helpful message for non-existent sections', async () => {
      const content = `# Title
## Section One
Content`;

      const node = createEmbedDirective(
        'test.md',
        'Nonexistent Section',
        createLocation(1, 1)
      );

      vi.mocked(pathService.resolvePath).mockResolvedValue('/test.md');
      vi.mocked(fileSystemService.exists).mockResolvedValue(true);
      vi.mocked(fileSystemService.readFile).mockResolvedValue(content);

      await expect(service.processDirective(node))
        .rejects
        .toThrow(MeldDirectiveError);

      // The error should contain the closest match suggestion
      await expect(service.processDirective(node))
        .rejects
        .toMatchObject({
          message: expect.stringContaining('Section One')
        });
    });

    it('should adjust heading levels when using "as ###" syntax', async () => {
      const content = `# Title
## Section One
Content in section one
### Subsection
Nested content
## Section Two
Other content`;

      const node = createEmbedDirective(
        'test.md',
        'Section One',
        createLocation(1, 1),
        { headingLevel: 3 }
      );

      vi.mocked(pathService.resolvePath).mockResolvedValue('/test.md');
      vi.mocked(fileSystemService.exists).mockResolvedValue(true);
      vi.mocked(fileSystemService.readFile).mockResolvedValue(content);
      vi.mocked(parserService.parse).mockReturnValue([]);

      await service.processDirective(node);

      const parsedContent = parserService.parse.mock.calls[0][0];
      expect(parsedContent).toContain('### Section One');
      expect(parsedContent).toContain('#### Subsection');
      expect(parsedContent).not.toContain('## Section One');
      expect(parsedContent).not.toContain('### Subsection');
    });

    it('should embed under specified header text', async () => {
      const content = `# Title
## Section One
Content in section one
### Subsection
Nested content
## Section Two
Other content`;

      const node = createEmbedDirective(
        'test.md',
        'Section One',
        createLocation(1, 1),
        { underHeader: 'My Header' }
      );

      vi.mocked(pathService.resolvePath).mockResolvedValue('/test.md');
      vi.mocked(fileSystemService.exists).mockResolvedValue(true);
      vi.mocked(fileSystemService.readFile).mockResolvedValue(content);
      vi.mocked(parserService.parse).mockReturnValue([]);

      await service.processDirective(node);

      const parsedContent = parserService.parse.mock.calls[0][0];
      expect(parsedContent).toContain('## My Header');
      expect(parsedContent).toContain('### Section One');
      expect(parsedContent).toContain('#### Subsection');
    });

    it('should handle both "as ###" and "under header_text" together', async () => {
      const content = `# Title
## Section One
Content in section one
### Subsection
Nested content
## Section Two
Other content`;

      const node = createEmbedDirective(
        'test.md',
        'Section One',
        createLocation(1, 1),
        { 
          headingLevel: 4,
          underHeader: 'My Header'
        }
      );

      vi.mocked(pathService.resolvePath).mockResolvedValue('/test.md');
      vi.mocked(fileSystemService.exists).mockResolvedValue(true);
      vi.mocked(fileSystemService.readFile).mockResolvedValue(content);
      vi.mocked(parserService.parse).mockReturnValue([]);

      await service.processDirective(node);

      const parsedContent = parserService.parse.mock.calls[0][0];
      expect(parsedContent).toContain('## My Header');
      expect(parsedContent).toContain('#### Section One');
      expect(parsedContent).toContain('##### Subsection');
    });

    it('should throw error for missing file', async () => {
      const node = createEmbedDirective(
        'missing.md',
        undefined,
        createLocation(1, 1)
      );

      vi.mocked(pathService.resolvePath).mockResolvedValue('/missing.md');
      vi.mocked(fileSystemService.exists).mockResolvedValue(false);

      await expect(service.processDirective(node)).rejects.toThrow(
        'File not found: /missing.md'
      );
    });

    it('should throw error for missing section', async () => {
      const content = `# Title
## Section One
Content`;

      const node = createEmbedDirective(
        'test.md',
        'Missing Section',
        createLocation(1, 1)
      );

      vi.mocked(pathService.resolvePath).mockResolvedValue('/test.md');
      vi.mocked(fileSystemService.exists).mockResolvedValue(true);
      vi.mocked(fileSystemService.readFile).mockResolvedValue(content);

      await expect(service.processDirective(node)).rejects.toThrow(
        'Section not found: Missing Section'
      );
    });

    it('should throw error for unknown directive kind', async () => {
      await expect(
        service.processDirective(
          createDirectiveNode('unknown', { foo: 'bar' }, createLocation(1, 1))
        )
      ).rejects.toThrow('Unknown directive kind: unknown');
    });
  });

  describe('Multiple directives processing', () => {
    it('should process multiple directives in sequence', async () => {
      const nodes = [
        createTextDirective('greeting', 'Hello', createLocation(1, 1)),
        createDataDirective('config', { key: 'value' }, createLocation(2, 1))
      ];

      await service.processDirectives(nodes);

      expect(validationService.validate).toHaveBeenCalledTimes(2);
      expect(stateService.setTextVar).toHaveBeenCalledWith('greeting', 'Hello');
      expect(stateService.setDataVar).toHaveBeenCalledWith('config', { key: 'value' });
    });

    it('should stop processing on first error', async () => {
      const nodes = [
        createTextDirective('greeting', 'Hello', createLocation(1, 1)),
        createDirectiveNode('unknown', {}, createLocation(2, 1))
      ];

      await expect(service.processDirectives(nodes)).rejects.toThrow(MeldDirectiveError);
      expect(stateService.setTextVar).toHaveBeenCalledTimes(1);
    });
  });

  describe('Section extraction', () => {
    it('should extract exact section matches', async () => {
      const content = `# Title
## Section One
Content in section one
## Section Two
Content in section two`;

      const node = createEmbedDirective(
        'test.md',
        'Section One',
        createLocation(1, 1)
      );

      vi.mocked(pathService.resolvePath).mockResolvedValueOnce('/test.md');
      vi.mocked(fileSystemService.exists).mockResolvedValueOnce(true);
      vi.mocked(fileSystemService.readFile).mockResolvedValueOnce(content);
      parseMock.mockResolvedValueOnce([]);

      await service.processDirective(node);

      const parsedContent = parseMock.mock.calls[0][0];
      expect(parsedContent).toContain('## Section One');
      expect(parsedContent).toContain('Content in section one');
      expect(parsedContent).not.toContain('Section Two');
    });

    it('should extract sections with fuzzy matching', async () => {
      const content = `# Title
## Getting Started Guide
Content in guide
## Other Section
Other content`;

      const node = createEmbedDirective(
        'test.md',
        'Getting Started',
        createLocation(1, 1),
        { fuzzy: 0.7 }
      );

      vi.mocked(pathService.resolvePath).mockResolvedValue('/test.md');
      vi.mocked(fileSystemService.exists).mockResolvedValue(true);
      vi.mocked(fileSystemService.readFile).mockResolvedValue(content);
      parseMock.mockResolvedValue([]);

      await service.processDirective(node);

      const parsedContent = parseMock.mock.calls[0][0];
      expect(parsedContent).toContain('## Getting Started Guide');
      expect(parsedContent).toContain('Content in guide');
      expect(parsedContent).not.toContain('Other Section');
    });

    it('should include nested sections', async () => {
      const content = `# Title
## Section One
Content in section one
### Subsection
Nested content
## Section Two
Other content`;

      const node = createEmbedDirective(
        'test.md',
        'Section One',
        createLocation(1, 1)
      );

      vi.mocked(pathService.resolvePath).mockResolvedValue('/test.md');
      vi.mocked(fileSystemService.exists).mockResolvedValue(true);
      vi.mocked(fileSystemService.readFile).mockResolvedValue(content);
      parseMock.mockResolvedValue([]);

      await service.processDirective(node);

      const parsedContent = parseMock.mock.calls[0][0];
      expect(parsedContent).toContain('## Section One');
      expect(parsedContent).toContain('### Subsection');
      expect(parsedContent).toContain('Nested content');
      expect(parsedContent).not.toContain('Section Two');
    });
  });

  describe('Content formatting', () => {
    it('should format code blocks with language', async () => {
      const content = 'const x = 1;';
      const node = createEmbedDirective(
        'test.ts',
        undefined,
        createLocation(1, 1),
        { format: 'typescript' }
      );

      vi.mocked(pathService.resolvePath).mockResolvedValue('/test.ts');
      vi.mocked(fileSystemService.exists).mockResolvedValue(true);
      vi.mocked(fileSystemService.readFile).mockResolvedValue(content);
      parseMock.mockResolvedValue([]);

      await service.processDirective(node);

      const parsedContent = parseMock.mock.calls[0][0];
      expect(parsedContent).toBe('```typescript\nconst x = 1;\n```');
    });

    it('should format quotes with > prefix', async () => {
      const content = 'Line 1\nLine 2';
      const node = createEmbedDirective(
        'quote.txt',
        undefined,
        createLocation(1, 1),
        { format: 'quote' }
      );

      vi.mocked(pathService.resolvePath).mockResolvedValue('/quote.txt');
      vi.mocked(fileSystemService.exists).mockResolvedValue(true);
      vi.mocked(fileSystemService.readFile).mockResolvedValue(content);
      parseMock.mockResolvedValue([]);

      await service.processDirective(node);

      const parsedContent = parseMock.mock.calls[0][0];
      expect(parsedContent).toBe('> Line 1\n> Line 2');
    });

    it('should auto-detect format from file extension', async () => {
      const content = 'const x = 1;';
      const node = createEmbedDirective(
        'test.ts',
        undefined,
        createLocation(1, 1)
      );

      vi.mocked(pathService.resolvePath).mockResolvedValue('/test.ts');
      vi.mocked(fileSystemService.exists).mockResolvedValue(true);
      vi.mocked(fileSystemService.readFile).mockResolvedValue(content);
      parseMock.mockResolvedValue([]);

      await service.processDirective(node);

      const parsedContent = parseMock.mock.calls[0][0];
      expect(parsedContent).toBe('```typescript\nconst x = 1;\n```');
    });

    it('should preserve markdown content as-is', async () => {
      const content = '# Title\n## Section';
      const node = createEmbedDirective(
        'test.md',
        undefined,
        createLocation(1, 1),
        { format: 'markdown' }
      );

      vi.mocked(pathService.resolvePath).mockResolvedValue('/test.md');
      vi.mocked(fileSystemService.exists).mockResolvedValue(true);
      vi.mocked(fileSystemService.readFile).mockResolvedValue(content);
      parseMock.mockResolvedValue([]);

      await service.processDirective(node);

      const parsedContent = parseMock.mock.calls[0][0];
      expect(parsedContent).toBe(content);
    });

    it('should handle unknown formats as plain text', async () => {
      const content = 'Some content';
      const node = createEmbedDirective(
        'test.xyz',
        undefined,
        createLocation(1, 1),
        { format: 'unknown' }
      );

      vi.mocked(pathService.resolvePath).mockResolvedValue('/test.xyz');
      vi.mocked(fileSystemService.exists).mockResolvedValue(true);
      vi.mocked(fileSystemService.readFile).mockResolvedValue(content);
      parseMock.mockResolvedValue([]);

      await service.processDirective(node);

      const parsedContent = parseMock.mock.calls[0][0];
      expect(parsedContent).toBe(content);
    });
  });

  it('processes imported content correctly', async () => {
    const mockContent = '@text greeting = "Hello"';
    parseMock.mockResolvedValueOnce([{
      type: 'Directive',
      directive: {
        kind: 'text',
        name: 'greeting',
        value: 'Hello'
      }
    }]);
    // ... test implementation
  });
}); 