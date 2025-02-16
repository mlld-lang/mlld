import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ImportDirectiveHandler } from './ImportDirectiveHandler.js';
import { createImportDirective, createLocation } from '@tests/utils/testFactories.js';
import type { IValidationService } from '@services/ValidationService/IValidationService.js';
import type { IStateService } from '@services/StateService/IStateService.js';
import type { IResolutionService } from '@services/ResolutionService/IResolutionService.js';
import type { IFileSystemService } from '@services/FileSystemService/IFileSystemService.js';
import type { IParserService } from '@services/ParserService/IParserService.js';
import type { IInterpreterService } from '@services/InterpreterService/IInterpreterService.js';
import type { ICircularityService } from '@services/CircularityService/ICircularityService.js';
import type { DirectiveNode, MeldNode } from 'meld-spec';
import { DirectiveError, DirectiveErrorCode } from '@services/DirectiveService/errors/DirectiveError.js';

describe('ImportDirectiveHandler', () => {
  let handler: ImportDirectiveHandler;
  let validationService: IValidationService;
  let stateService: IStateService;
  let resolutionService: IResolutionService;
  let fileSystemService: IFileSystemService;
  let parserService: IParserService;
  let interpreterService: IInterpreterService;
  let circularityService: ICircularityService;
  let mockChildState: IStateService;

  beforeEach(() => {
    validationService = {
      validate: vi.fn()
    } as unknown as IValidationService;

    // Create a properly mocked child state
    mockChildState = {
      getTextVar: vi.fn(),
      setTextVar: vi.fn(),
      getDataVar: vi.fn(),
      setDataVar: vi.fn(),
      getPathVar: vi.fn(),
      setPathVar: vi.fn(),
      mergeChildState: vi.fn()
    } as unknown as IStateService;

    stateService = {
      createChildState: vi.fn().mockReturnValue(mockChildState),
      mergeChildState: vi.fn(),
      getTextVar: vi.fn(),
      setTextVar: vi.fn(),
      getDataVar: vi.fn(),
      setDataVar: vi.fn(),
      getPathVar: vi.fn(),
      setPathVar: vi.fn()
    } as unknown as IStateService;

    resolutionService = {
      resolvePath: vi.fn()
    } as unknown as IResolutionService;

    fileSystemService = {
      exists: vi.fn(),
      readFile: vi.fn()
    } as unknown as IFileSystemService;

    parserService = {
      parse: vi.fn(),
      parseWithLocations: vi.fn()
    } as unknown as IParserService;

    interpreterService = {
      interpret: vi.fn()
    } as unknown as IInterpreterService;

    circularityService = {
      beginImport: vi.fn(),
      endImport: vi.fn()
    } as unknown as ICircularityService;

    handler = new ImportDirectiveHandler(
      validationService,
      resolutionService,
      stateService,
      fileSystemService,
      parserService,
      interpreterService,
      circularityService
    );
  });

  describe('basic import handling', () => {
    it('should process a basic import directive', async () => {
      // Setup
      const node = createImportDirective('test.meld', createLocation(1, 1));
      const mockContent = 'Test content';
      const mockParsedNodes = [{
        type: 'Text',
        content: 'Test content',
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 12 }
        }
      }] as unknown as MeldNode[];

      vi.mocked(resolutionService.resolvePath).mockResolvedValue('/resolved/test.meld');
      vi.mocked(fileSystemService.exists).mockResolvedValue(true);
      vi.mocked(fileSystemService.readFile).mockResolvedValue(mockContent);
      vi.mocked(parserService.parseWithLocations).mockResolvedValue(mockParsedNodes);

      // Execute
      await handler.execute(node, { currentFilePath: 'source.meld' });

      // Verify
      expect(validationService.validate).toHaveBeenCalledWith(node);
      expect(resolutionService.resolvePath).toHaveBeenCalledWith(
        'test.meld',
        expect.objectContaining({
          allowedVariableTypes: {
            text: true,
            data: true,
            path: true,
            command: false
          }
        })
      );
      expect(fileSystemService.exists).toHaveBeenCalledWith('/resolved/test.meld');
      expect(fileSystemService.readFile).toHaveBeenCalledWith('/resolved/test.meld');
      expect(parserService.parseWithLocations).toHaveBeenCalledWith(mockContent, '/resolved/test.meld');
      expect(interpreterService.interpret).toHaveBeenCalledWith(
        mockParsedNodes,
        expect.objectContaining({
          initialState: mockChildState,
          filePath: '/resolved/test.meld',
          mergeState: true
        })
      );
    });
  });

  describe('import syntax variations', () => {
    it('should handle explicit imports with from syntax', async () => {
      const node = createImportDirective('x,y,z', createLocation(1, 1), 'source.meld');
      const mockContent = 'Test content';
      const mockParsedNodes = [{
        type: 'Text',
        content: 'Test content',
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 12 }
        }
      }] as unknown as MeldNode[];

      vi.mocked(resolutionService.resolvePath).mockResolvedValue('/resolved/source.meld');
      vi.mocked(fileSystemService.exists).mockResolvedValue(true);
      vi.mocked(fileSystemService.readFile).mockResolvedValue(mockContent);
      vi.mocked(parserService.parseWithLocations).mockResolvedValue(mockParsedNodes);
      vi.mocked(interpreterService.interpret).mockResolvedValue(mockChildState);
      vi.mocked(mockChildState.getTextVar).mockReturnValue('value');
      vi.mocked(mockChildState.getDataVar).mockReturnValue(undefined);
      vi.mocked(mockChildState.getPathVar).mockReturnValue(undefined);

      await handler.execute(node, {});

      expect(mockChildState.getTextVar).toHaveBeenCalledWith('x');
      expect(mockChildState.getTextVar).toHaveBeenCalledWith('y');
      expect(mockChildState.getTextVar).toHaveBeenCalledWith('z');
    });

    it('should handle aliased imports', async () => {
      const node = createImportDirective('x as y', createLocation(1, 1), 'source.meld');
      const mockContent = 'Test content';
      const mockParsedNodes = [{
        type: 'Text',
        content: 'Test content',
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 12 }
        }
      }] as unknown as MeldNode[];
      const mockValue = { data: 'test' };

      vi.mocked(resolutionService.resolvePath).mockResolvedValue('/resolved/source.meld');
      vi.mocked(fileSystemService.exists).mockResolvedValue(true);
      vi.mocked(fileSystemService.readFile).mockResolvedValue(mockContent);
      vi.mocked(parserService.parseWithLocations).mockResolvedValue(mockParsedNodes);
      vi.mocked(interpreterService.interpret).mockResolvedValue(mockChildState);
      vi.mocked(mockChildState.getTextVar).mockReturnValue(undefined);
      vi.mocked(mockChildState.getDataVar).mockReturnValue(mockValue);
      vi.mocked(mockChildState.getPathVar).mockReturnValue(undefined);

      await handler.execute(node, {});

      expect(mockChildState.getDataVar).toHaveBeenCalledWith('x');
      expect(mockChildState.setDataVar).toHaveBeenCalledWith('y', mockValue);
    });

    it('should handle wildcard imports', async () => {
      const node = createImportDirective('*', createLocation(1, 1), 'source.meld');
      const mockContent = 'Test content';
      const mockParsedNodes = [{
        type: 'Text',
        content: 'Test content',
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 12 }
        }
      }] as unknown as MeldNode[];

      vi.mocked(resolutionService.resolvePath).mockResolvedValue('/resolved/source.meld');
      vi.mocked(fileSystemService.exists).mockResolvedValue(true);
      vi.mocked(fileSystemService.readFile).mockResolvedValue(mockContent);
      vi.mocked(parserService.parseWithLocations).mockResolvedValue(mockParsedNodes);
      vi.mocked(interpreterService.interpret).mockResolvedValue(mockChildState);

      await handler.execute(node, {});

      expect(interpreterService.interpret).toHaveBeenCalledWith(
        mockParsedNodes,
        expect.objectContaining({
          initialState: mockChildState,
          filePath: '/resolved/source.meld',
          mergeState: true,
          importFilter: undefined
        })
      );
    });

    it('should handle missing imported variables', async () => {
      const node = createImportDirective('x,y', createLocation(1, 1), 'source.meld');
      const mockContent = 'Test content';
      const mockParsedNodes = [{
        type: 'Text',
        content: 'Test content',
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 12 }
        }
      }] as unknown as MeldNode[];

      vi.mocked(resolutionService.resolvePath).mockResolvedValue('/resolved/source.meld');
      vi.mocked(fileSystemService.exists).mockResolvedValue(true);
      vi.mocked(fileSystemService.readFile).mockResolvedValue(mockContent);
      vi.mocked(parserService.parseWithLocations).mockResolvedValue(mockParsedNodes);
      vi.mocked(interpreterService.interpret).mockResolvedValue(mockChildState);
      vi.mocked(mockChildState.getTextVar).mockReturnValue(undefined);
      vi.mocked(mockChildState.getDataVar).mockReturnValue(undefined);
      vi.mocked(mockChildState.getPathVar).mockReturnValue(undefined);

      await expect(handler.execute(node, {})).rejects.toThrow(
        expect.objectContaining({
          message: expect.stringContaining('Imported variable not found: x'),
          code: DirectiveErrorCode.VARIABLE_NOT_FOUND
        })
      );
    });
  });

  describe('error handling', () => {
    it('should handle validation errors', async () => {
      const node = createImportDirective('test.meld', createLocation(1, 1));

      vi.mocked(validationService.validate).mockRejectedValue(
        new DirectiveError('Invalid directive', 'import', DirectiveErrorCode.VALIDATION_FAILED)
      );

      await expect(handler.execute(node, {})).rejects.toThrow(DirectiveError);
    });

    it('should handle file not found errors', async () => {
      const node = createImportDirective('test.meld', createLocation(1, 1));

      vi.mocked(resolutionService.resolvePath).mockResolvedValue('/resolved/test.meld');
      vi.mocked(fileSystemService.exists).mockResolvedValue(false);

      await expect(handler.execute(node, {})).rejects.toThrow(
        expect.objectContaining({
          code: DirectiveErrorCode.FILE_NOT_FOUND
        })
      );
    });

    it('should handle circular imports', async () => {
      const node = createImportDirective('test.meld', createLocation(1, 1));

      vi.mocked(resolutionService.resolvePath).mockResolvedValue('/resolved/test.meld');
      vi.mocked(fileSystemService.exists).mockResolvedValue(true);
      vi.mocked(circularityService.beginImport).mockRejectedValue(
        new DirectiveError('Circular import', 'import', DirectiveErrorCode.CIRCULAR_REFERENCE)
      );

      await expect(handler.execute(node, {})).rejects.toThrow(
        expect.objectContaining({
          code: DirectiveErrorCode.CIRCULAR_REFERENCE
        })
      );
    });

    it('should handle parse errors', async () => {
      const node = createImportDirective('test.meld', createLocation(1, 1));

      vi.mocked(resolutionService.resolvePath).mockResolvedValue('/resolved/test.meld');
      vi.mocked(fileSystemService.exists).mockResolvedValue(true);
      vi.mocked(fileSystemService.readFile).mockResolvedValue('content');
      vi.mocked(parserService.parseWithLocations).mockRejectedValue(new Error('Parse error'));

      await expect(handler.execute(node, {})).rejects.toThrow(DirectiveError);
    });
  });

  describe('cleanup and state management', () => {
    it('should always call endImport even on error', async () => {
      const node = createImportDirective('test.meld', createLocation(1, 1));

      vi.mocked(resolutionService.resolvePath).mockResolvedValue('/resolved/test.meld');
      vi.mocked(fileSystemService.exists).mockResolvedValue(true);
      vi.mocked(fileSystemService.readFile).mockRejectedValue(new Error('Read error'));

      await expect(handler.execute(node, {})).rejects.toThrow();
      expect(circularityService.endImport).toHaveBeenCalledWith('/resolved/test.meld');
    });

    it('should merge states after successful import', async () => {
      const node = createImportDirective('test.meld', createLocation(1, 1));
      const mockContent = 'Test content';
      const mockParsedNodes = [{
        type: 'Text',
        content: 'Test content',
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 12 }
        }
      }] as unknown as MeldNode[];

      vi.mocked(resolutionService.resolvePath).mockResolvedValue('/resolved/test.meld');
      vi.mocked(fileSystemService.exists).mockResolvedValue(true);
      vi.mocked(fileSystemService.readFile).mockResolvedValue(mockContent);
      vi.mocked(parserService.parseWithLocations).mockResolvedValue(mockParsedNodes);
      vi.mocked(interpreterService.interpret).mockResolvedValue(mockChildState);

      await handler.execute(node, {});

      expect(stateService.mergeChildState).toHaveBeenCalledWith(mockChildState);
    });
  });
}); 