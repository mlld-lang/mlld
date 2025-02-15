import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { DirectiveNode, DirectiveData } from '../../../../node_modules/meld-spec/dist/types';
import { EmbedDirectiveHandler } from './EmbedDirectiveHandler';
import type { IValidationService } from '../../../ValidationService/IValidationService';
import type { IResolutionService } from '../../../ResolutionService/IResolutionService';
import type { IStateService } from '../../../StateService/IStateService';
import type { ICircularityService } from '../../../CircularityService/ICircularityService';
import type { IFileSystemService } from '../../../FileSystemService/IFileSystemService';
import type { IParserService } from '../../../ParserService/IParserService';
import type { IInterpreterService } from '../../../InterpreterService/IInterpreterService';
import { DirectiveError, DirectiveErrorCode } from '../../errors/DirectiveError';
import { createLocation, createEmbedDirective } from '../../../../tests/utils/testFactories';

// Mock the logger
vi.mock('@core/utils/logger', () => ({
  embedLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

interface EmbedDirective extends DirectiveData {
  kind: 'embed';
  path: string;
  section?: string;
  headingLevel?: number;
  underHeader?: string;
  fuzzy?: number;
  names?: string[];
  items?: string[];
}

// Create mock implementations
const createMockValidationService = (): IValidationService => ({
  validate: vi.fn(),
  registerValidator: vi.fn(),
  removeValidator: vi.fn(),
  hasValidator: vi.fn().mockReturnValue(false),
  getRegisteredDirectiveKinds: vi.fn().mockReturnValue([])
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

const createMockCircularityService = (): ICircularityService => ({
  beginImport: vi.fn(),
  endImport: vi.fn(),
  isInStack: vi.fn().mockReturnValue(false),
  getImportStack: vi.fn().mockReturnValue([]),
  reset: vi.fn()
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

const createMockParserService = (): IParserService => ({
  parse: vi.fn().mockResolvedValue([]),
  parseWithLocations: vi.fn().mockResolvedValue([])
});

const createMockInterpreterService = (): IInterpreterService => ({
  initialize: vi.fn(),
  interpret: vi.fn().mockResolvedValue({} as IStateService),
  interpretNode: vi.fn().mockResolvedValue({} as IStateService),
  createChildContext: vi.fn().mockResolvedValue({} as IStateService)
});

describe('EmbedDirectiveHandler', () => {
  let handler: EmbedDirectiveHandler;
  let mockValidationService: IValidationService;
  let mockResolutionService: IResolutionService;
  let mockStateService: IStateService;
  let mockCircularityService: ICircularityService;
  let mockFileSystemService: IFileSystemService;
  let mockParserService: IParserService;
  let mockInterpreterService: IInterpreterService;

  beforeEach(() => {
    // Create fresh instances of mocks
    mockValidationService = createMockValidationService();
    mockResolutionService = createMockResolutionService();
    mockStateService = createMockStateService();
    mockCircularityService = createMockCircularityService();
    mockFileSystemService = createMockFileSystemService();
    mockParserService = createMockParserService();
    mockInterpreterService = createMockInterpreterService();

    handler = new EmbedDirectiveHandler(
      mockValidationService,
      mockResolutionService,
      mockStateService,
      mockCircularityService,
      mockFileSystemService,
      mockParserService,
      mockInterpreterService
    );
  });

  describe('basic embed functionality', () => {
    it('should handle basic embed without modifiers', async () => {
      const node = createEmbedDirective('$PROJECTPATH/doc.md', undefined, createLocation(1, 1));

      vi.mocked(mockResolutionService.resolvePath).mockResolvedValue('/resolved/doc.md');
      vi.mocked(mockFileSystemService.exists).mockResolvedValue(true);
      vi.mocked(mockFileSystemService.readFile).mockResolvedValue('Test content');

      await handler.execute(node);

      expect(mockValidationService.validate).toHaveBeenCalledWith(node);
      expect(mockResolutionService.resolvePath).toHaveBeenCalledWith('$PROJECTPATH/doc.md', {
        allowedVariableTypes: {
          text: true,
          data: true,
          path: true,
          command: false
        },
        pathValidation: {
          requireAbsolute: true,
          allowedRoots: ['$PROJECTPATH', '$HOMEPATH']
        }
      });
      expect(mockFileSystemService.exists).toHaveBeenCalled();
      expect(mockFileSystemService.readFile).toHaveBeenCalled();
    });

    it('should handle embed with section', async () => {
      const node = createEmbedDirective('$PROJECTPATH/doc.md', 'Section 1', createLocation(1, 1));

      vi.mocked(mockResolutionService.resolvePath).mockResolvedValue('/resolved/doc.md');
      vi.mocked(mockFileSystemService.exists).mockResolvedValue(true);
      vi.mocked(mockFileSystemService.readFile).mockResolvedValue('Test content');
      vi.mocked(mockResolutionService.extractSection).mockResolvedValue('Section content');

      await handler.execute(node);

      expect(mockValidationService.validate).toHaveBeenCalledWith(node);
      expect(mockResolutionService.resolvePath).toHaveBeenCalledWith('$PROJECTPATH/doc.md', {
        allowedVariableTypes: {
          text: true,
          data: true,
          path: true,
          command: false
        },
        pathValidation: {
          requireAbsolute: true,
          allowedRoots: ['$PROJECTPATH', '$HOMEPATH']
        }
      });
      expect(mockFileSystemService.exists).toHaveBeenCalled();
      expect(mockFileSystemService.readFile).toHaveBeenCalled();
      expect(mockResolutionService.extractSection).toHaveBeenCalled();
    });

    it('should handle embed with heading level', async () => {
      const node = createEmbedDirective('$PROJECTPATH/doc.md', undefined, createLocation(1, 1), {
        headingLevel: 2
      });

      vi.mocked(mockResolutionService.resolvePath).mockResolvedValue('/resolved/doc.md');
      vi.mocked(mockFileSystemService.exists).mockResolvedValue(true);
      vi.mocked(mockFileSystemService.readFile).mockResolvedValue('Test content');

      await handler.execute(node);

      expect(mockValidationService.validate).toHaveBeenCalledWith(node);
      expect(mockResolutionService.resolvePath).toHaveBeenCalledWith('$PROJECTPATH/doc.md', {
        allowedVariableTypes: {
          text: true,
          data: true,
          path: true,
          command: false
        },
        pathValidation: {
          requireAbsolute: true,
          allowedRoots: ['$PROJECTPATH', '$HOMEPATH']
        }
      });
      expect(mockFileSystemService.exists).toHaveBeenCalled();
      expect(mockFileSystemService.readFile).toHaveBeenCalled();
    });

    it('should handle embed with under header', async () => {
      const node = createEmbedDirective('$PROJECTPATH/doc.md', undefined, createLocation(1, 1), {
        underHeader: 'My Header'
      });

      vi.mocked(mockResolutionService.resolvePath).mockResolvedValue('/resolved/doc.md');
      vi.mocked(mockFileSystemService.exists).mockResolvedValue(true);
      vi.mocked(mockFileSystemService.readFile).mockResolvedValue('Test content');

      await handler.execute(node);

      expect(mockValidationService.validate).toHaveBeenCalledWith(node);
      expect(mockResolutionService.resolvePath).toHaveBeenCalledWith('$PROJECTPATH/doc.md', {
        allowedVariableTypes: {
          text: true,
          data: true,
          path: true,
          command: false
        },
        pathValidation: {
          requireAbsolute: true,
          allowedRoots: ['$PROJECTPATH', '$HOMEPATH']
        }
      });
      expect(mockFileSystemService.exists).toHaveBeenCalled();
      expect(mockFileSystemService.readFile).toHaveBeenCalled();
    });
  });

  describe('named embeds', () => {
    it('should handle single named embed', async () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'embed',
          path: '$PROJECTPATH/doc.md',
          names: ['content']
        } as EmbedDirective,
        location: createLocation(1, 1)
      };

      vi.mocked(mockResolutionService.resolvePath).mockResolvedValue('/resolved/doc.md');
      vi.mocked(mockFileSystemService.exists).mockResolvedValue(true);
      vi.mocked(mockFileSystemService.readFile).mockResolvedValue('Test content');

      await handler.execute(node);

      expect(mockStateService.setTextVar).toHaveBeenCalledWith('content', 'Test content');
      expect(mockStateService.appendContent).not.toHaveBeenCalled();
    });

    it('should handle multiple named embeds', async () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'embed',
          path: '$PROJECTPATH/doc.md',
          names: ['content1', 'content2']
        } as EmbedDirective,
        location: createLocation(1, 1)
      };

      vi.mocked(mockResolutionService.resolvePath).mockResolvedValue('/resolved/doc.md');
      vi.mocked(mockFileSystemService.exists).mockResolvedValue(true);
      vi.mocked(mockFileSystemService.readFile).mockResolvedValue('Test content');

      await handler.execute(node);

      expect(mockStateService.setTextVar).toHaveBeenCalledWith('content1', 'Test content');
      expect(mockStateService.setTextVar).toHaveBeenCalledWith('content2', 'Test content');
      expect(mockStateService.appendContent).not.toHaveBeenCalled();
    });
  });

  describe('.meld file handling', () => {
    it('should parse and interpret .meld files', async () => {
      const node = createEmbedDirective('$PROJECTPATH/doc.meld', undefined, createLocation(1, 1));

      vi.mocked(mockResolutionService.resolvePath).mockResolvedValue('/resolved/doc.meld');
      vi.mocked(mockFileSystemService.exists).mockResolvedValue(true);
      vi.mocked(mockFileSystemService.readFile).mockResolvedValue('@text greeting = "Hello"');
      vi.mocked(mockStateService.createChildState).mockReturnValue({} as any);
      vi.mocked(mockParserService.parse).mockResolvedValue([]);

      await handler.execute(node);

      expect(mockParserService.parse).toHaveBeenCalledWith('@text greeting = "Hello"');
      expect(mockInterpreterService.interpret).toHaveBeenCalled();
      expect(mockStateService.appendContent).not.toHaveBeenCalled();
    });

    it('should handle .meld files with sections', async () => {
      const node = createEmbedDirective('$PROJECTPATH/doc.meld', 'MySection', createLocation(1, 1));

      vi.mocked(mockResolutionService.resolvePath).mockResolvedValue('/resolved/doc.meld');
      vi.mocked(mockFileSystemService.exists).mockResolvedValue(true);
      vi.mocked(mockFileSystemService.readFile).mockResolvedValue('Full content');
      vi.mocked(mockResolutionService.extractSection).mockResolvedValue('@text greeting = "Hello"');
      vi.mocked(mockStateService.createChildState).mockReturnValue({} as any);
      vi.mocked(mockParserService.parse).mockResolvedValue([]);

      await handler.execute(node);

      expect(mockResolutionService.extractSection).toHaveBeenCalledWith('Full content', 'MySection');
      expect(mockParserService.parse).toHaveBeenCalledWith('@text greeting = "Hello"');
      expect(mockInterpreterService.interpret).toHaveBeenCalled();
    });
  });

  describe('circular reference handling', () => {
    it('should detect circular references', async () => {
      const node = createEmbedDirective('$PROJECTPATH/doc.md', undefined, createLocation(1, 1));

      vi.mocked(mockResolutionService.resolvePath).mockResolvedValue('/resolved/doc.md');
      vi.mocked(mockCircularityService.beginImport).mockImplementation(() => {
        throw new DirectiveError(
          'Circular reference detected',
          'embed',
          DirectiveErrorCode.EXECUTION_FAILED
        );
      });

      await expect(handler.execute(node)).rejects.toThrow(DirectiveError);
      expect(mockCircularityService.beginImport).toHaveBeenCalledWith('/resolved/doc.md');
    });

    it('should always call endImport even on error', async () => {
      const node = createEmbedDirective('$PROJECTPATH/doc.md', undefined, createLocation(1, 1));

      vi.mocked(mockResolutionService.resolvePath).mockResolvedValue('/resolved/doc.md');
      vi.mocked(mockFileSystemService.exists).mockResolvedValue(true);
      vi.mocked(mockFileSystemService.readFile).mockRejectedValue(new Error('Read error'));

      await expect(handler.execute(node)).rejects.toThrow();
      expect(mockCircularityService.endImport).toHaveBeenCalledWith('/resolved/doc.md');
    });
  });

  describe('error handling', () => {
    it('should handle file not found', async () => {
      const node = createEmbedDirective('$PROJECTPATH/missing.md', undefined, createLocation(1, 1));

      vi.mocked(mockResolutionService.resolvePath).mockResolvedValue('/resolved/missing.md');
      vi.mocked(mockFileSystemService.exists).mockResolvedValue(false);

      await expect(handler.execute(node)).rejects.toThrow(DirectiveError);
      expect(mockCircularityService.endImport).toHaveBeenCalled();
    });

    it('should handle invalid heading level', async () => {
      const node = createEmbedDirective('$PROJECTPATH/doc.md', undefined, createLocation(1, 1), {
        headingLevel: 7
      });

      vi.mocked(mockResolutionService.resolvePath).mockResolvedValue('/resolved/doc.md');
      vi.mocked(mockFileSystemService.exists).mockResolvedValue(true);
      vi.mocked(mockFileSystemService.readFile).mockResolvedValue('Test content');

      await expect(handler.execute(node)).rejects.toThrow(DirectiveError);
      expect(mockCircularityService.endImport).toHaveBeenCalled();
    });

    it('should handle section extraction errors', async () => {
      const node = createEmbedDirective('$PROJECTPATH/doc.md', 'NonExistent', createLocation(1, 1));

      vi.mocked(mockResolutionService.resolvePath).mockResolvedValue('/resolved/doc.md');
      vi.mocked(mockFileSystemService.exists).mockResolvedValue(true);
      vi.mocked(mockFileSystemService.readFile).mockResolvedValue('Test content');
      vi.mocked(mockResolutionService.extractSection).mockRejectedValue(new Error('Section not found'));

      await expect(handler.execute(node)).rejects.toThrow(DirectiveError);
      expect(mockCircularityService.endImport).toHaveBeenCalled();
    });

    it('should handle .meld parse errors', async () => {
      const node = createEmbedDirective('$PROJECTPATH/doc.meld', undefined, createLocation(1, 1));

      vi.mocked(mockResolutionService.resolvePath).mockResolvedValue('/resolved/doc.meld');
      vi.mocked(mockFileSystemService.exists).mockResolvedValue(true);
      vi.mocked(mockFileSystemService.readFile).mockResolvedValue('Invalid meld content');
      vi.mocked(mockStateService.createChildState).mockReturnValue({} as any);
      vi.mocked(mockParserService.parse).mockRejectedValue(new Error('Parse error'));

      await expect(handler.execute(node)).rejects.toThrow(DirectiveError);
      expect(mockCircularityService.endImport).toHaveBeenCalled();
    });
  });
}); 