import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ImportDirectiveHandler } from './ImportDirectiveHandler';
import { createImportDirective, createLocation } from '../../../../tests/utils/testFactories';
import type { IValidationService } from '../../../ValidationService/IValidationService';
import type { IStateService } from '../../../StateService/IStateService';
import type { IResolutionService } from '../../../ResolutionService/IResolutionService';
import type { IFileSystemService } from '../../../FileSystemService/IFileSystemService';
import type { IParserService } from '../../../ParserService/IParserService';
import type { IInterpreterService } from '../../../InterpreterService/IInterpreterService';
import type { ICircularityService } from '../../../CircularityService/ICircularityService';
import type { DirectiveNode, MeldNode } from 'meld-spec';
import { DirectiveError, DirectiveErrorCode } from '../../errors/DirectiveError';

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
      hasVariable: vi.fn(),
      getVariable: vi.fn(),
      setVariable: vi.fn(),
      removeVariable: vi.fn(),
      mergeStates: vi.fn()
    } as unknown as IStateService;

    stateService = {
      createChildState: vi.fn().mockReturnValue(mockChildState),
      mergeStates: vi.fn(),
      hasVariable: vi.fn(),
      getVariable: vi.fn(),
      setVariable: vi.fn(),
      removeVariable: vi.fn()
    } as unknown as IStateService;

    resolutionService = {
      resolvePath: vi.fn()
    } as unknown as IResolutionService;

    fileSystemService = {
      exists: vi.fn(),
      readFile: vi.fn()
    } as unknown as IFileSystemService;

    parserService = {
      parse: vi.fn()
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
      const mockParsedNodes = [{ type: 'Text', content: 'Test content' }] as MeldNode[];

      vi.mocked(resolutionService.resolvePath).mockResolvedValue('/resolved/test.meld');
      vi.mocked(fileSystemService.exists).mockResolvedValue(true);
      vi.mocked(fileSystemService.readFile).mockResolvedValue(mockContent);
      vi.mocked(parserService.parse).mockResolvedValue(mockParsedNodes);

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
      expect(parserService.parse).toHaveBeenCalledWith(mockContent, '/resolved/test.meld');
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
      const node = createImportDirective('[x,y,z]', createLocation(1, 1), 'source.meld', 'source.meld');
      const mockContent = 'Test content';
      const mockParsedNodes = [{ type: 'Text', content: 'Test content' }] as MeldNode[];

      vi.mocked(resolutionService.resolvePath).mockResolvedValue('/resolved/source.meld');
      vi.mocked(fileSystemService.exists).mockResolvedValue(true);
      vi.mocked(fileSystemService.readFile).mockResolvedValue(mockContent);
      vi.mocked(parserService.parse).mockResolvedValue(mockParsedNodes);
      vi.mocked(mockChildState.hasVariable).mockReturnValue(true);

      await handler.execute(node, {});

      expect(mockChildState.hasVariable).toHaveBeenCalledWith('x');
      expect(mockChildState.hasVariable).toHaveBeenCalledWith('y');
      expect(mockChildState.hasVariable).toHaveBeenCalledWith('z');
    });

    it('should handle aliased imports', async () => {
      const node = createImportDirective('[x as y]', createLocation(1, 1), 'source.meld', 'source.meld');
      const mockContent = 'Test content';
      const mockParsedNodes = [{ type: 'Text', content: 'Test content' }] as MeldNode[];
      const mockValue = { data: 'test' };

      vi.mocked(resolutionService.resolvePath).mockResolvedValue('/resolved/source.meld');
      vi.mocked(fileSystemService.exists).mockResolvedValue(true);
      vi.mocked(fileSystemService.readFile).mockResolvedValue(mockContent);
      vi.mocked(parserService.parse).mockResolvedValue(mockParsedNodes);
      vi.mocked(mockChildState.hasVariable).mockReturnValue(true);
      vi.mocked(mockChildState.getVariable).mockReturnValue(mockValue);

      await handler.execute(node, {});

      expect(mockChildState.getVariable).toHaveBeenCalledWith('x');
      expect(mockChildState.setVariable).toHaveBeenCalledWith('y', mockValue);
      expect(mockChildState.removeVariable).toHaveBeenCalledWith('x');
    });

    it('should handle wildcard imports', async () => {
      const node = createImportDirective('[*]', createLocation(1, 1), 'source.meld', 'source.meld');
      const mockContent = 'Test content';
      const mockParsedNodes = [{ type: 'Text', content: 'Test content' }] as MeldNode[];

      vi.mocked(resolutionService.resolvePath).mockResolvedValue('/resolved/source.meld');
      vi.mocked(fileSystemService.exists).mockResolvedValue(true);
      vi.mocked(fileSystemService.readFile).mockResolvedValue(mockContent);
      vi.mocked(parserService.parse).mockResolvedValue(mockParsedNodes);

      await handler.execute(node, {});

      expect(interpreterService.interpret).toHaveBeenCalledWith(
        mockParsedNodes,
        expect.objectContaining({
          initialState: mockChildState,
          filePath: '/resolved/source.meld',
          mergeState: true,
          importFilter: [] // Empty filter means import all
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
      vi.mocked(parserService.parse).mockRejectedValue(new Error('Parse error'));

      await expect(handler.execute(node, {})).rejects.toThrow(DirectiveError);
    });

    it('should handle missing imported variables', async () => {
      const node = createImportDirective('[x,y]', createLocation(1, 1), 'source.meld');
      const mockContent = 'Test content';
      const mockParsedNodes = [{ type: 'Text', content: 'Test content' }] as MeldNode[];

      vi.mocked(resolutionService.resolvePath).mockResolvedValue('/resolved/source.meld');
      vi.mocked(fileSystemService.exists).mockResolvedValue(true);
      vi.mocked(fileSystemService.readFile).mockResolvedValue(mockContent);
      vi.mocked(parserService.parse).mockResolvedValue(mockParsedNodes);
      vi.mocked(mockChildState.hasVariable).mockReturnValue(false);

      const error = await handler.execute(node, {}).catch(e => e);
      expect(error).toBeInstanceOf(DirectiveError);
      expect(error.code).toBe(DirectiveErrorCode.VARIABLE_NOT_FOUND);
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
      const mockParsedNodes = [{ type: 'Text', content: 'Test content' }] as MeldNode[];

      vi.mocked(resolutionService.resolvePath).mockResolvedValue('/resolved/test.meld');
      vi.mocked(fileSystemService.exists).mockResolvedValue(true);
      vi.mocked(fileSystemService.readFile).mockResolvedValue(mockContent);
      vi.mocked(parserService.parse).mockResolvedValue(mockParsedNodes);

      await handler.execute(node, {});

      expect(stateService.mergeStates).toHaveBeenCalledWith(mockChildState);
    });
  });
}); 