import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ImportDirectiveHandler } from '../ImportDirectiveHandler';
import { createImportDirective, createLocation } from '../../../../../tests/utils/testFactories';
import type { IValidationService } from '../../../../ValidationService/IValidationService';
import type { IStateService } from '../../../../StateService/IStateService';
import type { IResolutionService } from '../../../../ResolutionService/IResolutionService';
import type { IFileSystemService } from '../../../../FileSystemService/IFileSystemService';
import type { IParserService } from '../../../../ParserService/IParserService';
import type { IInterpreterService } from '../../../../InterpreterService/IInterpreterService';
import type { ICircularityService } from '../../../../CircularityService/ICircularityService';
import type { DirectiveNode, MeldNode } from 'meld-spec';
import { DirectiveError } from '../../../errors/DirectiveError';

describe('ImportDirectiveHandler', () => {
  let handler: ImportDirectiveHandler;
  let validationService: IValidationService;
  let stateService: IStateService;
  let resolutionService: IResolutionService;
  let fileSystemService: IFileSystemService;
  let parserService: IParserService;
  let interpreterService: IInterpreterService;
  let circularityService: ICircularityService;

  beforeEach(() => {
    validationService = {
      validate: vi.fn()
    };

    stateService = {
      createChildState: vi.fn()
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
      stateService,
      resolutionService,
      fileSystemService,
      parserService,
      interpreterService,
      circularityService
    );
  });

  describe('basic import handling', () => {
    it('should process a valid import directive', async () => {
      const node = createImportDirective('test.meld', createLocation(1, 1));
      const context = { currentFilePath: 'source.meld' };
      const mockContent = 'Test content';
      const mockParsedNodes = [{ type: 'Text', content: 'Test content' }] as MeldNode[];
      const mockChildState = {} as IStateService;

      vi.mocked(resolutionService.resolvePath).mockResolvedValueOnce('/resolved/test.meld');
      vi.mocked(fileSystemService.exists).mockResolvedValueOnce(true);
      vi.mocked(fileSystemService.readFile).mockResolvedValueOnce(mockContent);
      vi.mocked(stateService.createChildState).mockReturnValueOnce(mockChildState);
      vi.mocked(parserService.parse).mockResolvedValueOnce(mockParsedNodes);
      vi.mocked(interpreterService.interpret).mockResolvedValueOnce(mockChildState);

      await handler.execute(node, context);

      expect(validationService.validate).toHaveBeenCalledWith(node);
      expect(resolutionService.resolvePath).toHaveBeenCalledWith(
        'test.meld',
        expect.any(Object)
      );
      expect(fileSystemService.exists).toHaveBeenCalledWith('/resolved/test.meld');
      expect(fileSystemService.readFile).toHaveBeenCalledWith('/resolved/test.meld');
      expect(stateService.createChildState).toHaveBeenCalled();
      expect(parserService.parse).toHaveBeenCalledWith(mockContent);
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

  describe('error handling', () => {
    it('should propagate validation errors', async () => {
      const node = createImportDirective('test.meld', createLocation(1, 1));
      const context = { currentFilePath: 'source.meld' };

      vi.mocked(validationService.validate).mockImplementationOnce(() => {
        throw new Error('Validation error');
      });

      await expect(handler.execute(node, context)).rejects.toThrow('Validation error');
    });

    it('should handle file not found errors', async () => {
      const node = createImportDirective('test.meld', createLocation(1, 1));
      const context = { currentFilePath: 'source.meld' };

      vi.mocked(resolutionService.resolvePath).mockResolvedValueOnce('/resolved/test.meld');
      vi.mocked(fileSystemService.exists).mockResolvedValueOnce(false);

      await expect(handler.execute(node, context)).rejects.toThrow(DirectiveError);
    });

    it('should handle resolution errors', async () => {
      const node = createImportDirective('test.meld', createLocation(1, 1));
      const context = { currentFilePath: 'source.meld' };

      vi.mocked(resolutionService.resolvePath).mockRejectedValueOnce(
        new Error('Resolution error')
      );

      await expect(handler.execute(node, context)).rejects.toThrow('Resolution error');
    });

    it('should handle parse errors', async () => {
      const node = createImportDirective('test.meld', createLocation(1, 1));
      const context = { currentFilePath: 'source.meld' };

      vi.mocked(resolutionService.resolvePath).mockResolvedValueOnce('/resolved/test.meld');
      vi.mocked(fileSystemService.exists).mockResolvedValueOnce(true);
      vi.mocked(fileSystemService.readFile).mockResolvedValueOnce('content');
      vi.mocked(parserService.parse).mockRejectedValueOnce(new Error('Parse error'));

      await expect(handler.execute(node, context)).rejects.toThrow('Parse error');
    });

    it('should always end import tracking even on error', async () => {
      const node = createImportDirective('test.meld', createLocation(1, 1));
      const context = { currentFilePath: 'source.meld' };

      vi.mocked(resolutionService.resolvePath).mockResolvedValueOnce('/resolved/test.meld');
      vi.mocked(fileSystemService.exists).mockResolvedValueOnce(false);

      await expect(handler.execute(node, context)).rejects.toThrow();
      expect(circularityService.endImport).toHaveBeenCalledWith('/resolved/test.meld');
    });
  });
}); 