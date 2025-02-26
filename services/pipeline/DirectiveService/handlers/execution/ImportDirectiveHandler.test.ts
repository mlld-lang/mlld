import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ImportDirectiveHandler } from './ImportDirectiveHandler.js';
import { createImportDirective, createLocation } from '@tests/utils/testFactories.js';
import type { IValidationService } from '@services/resolution/ValidationService/IValidationService.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
import type { IParserService } from '@services/pipeline/ParserService/IParserService.js';
import type { IInterpreterService } from '@services/pipeline/InterpreterService/IInterpreterService.js';
import type { ICircularityService } from '@services/resolution/CircularityService/ICircularityService.js';
import type { DirectiveNode } from 'meld-spec';
import { DirectiveError, DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import { MeldFileNotFoundError } from '@core/errors/MeldFileNotFoundError.js';
import { MeldResolutionError, ResolutionErrorDetails } from '@core/errors/MeldResolutionError.js';
import { ErrorSeverity } from '@core/errors/MeldError.js';
import { 
  expectThrowsWithSeverity, 
  expectThrowsInStrictButWarnsInPermissive,
  expectDirectiveErrorWithCode,
  ErrorCollector
} from '@tests/utils';

describe('ImportDirectiveHandler', () => {
  let handler: ImportDirectiveHandler;
  let validationService: IValidationService;
  let stateService: IStateService;
  let resolutionService: IResolutionService;
  let fileSystemService: IFileSystemService;
  let parserService: IParserService;
  let interpreterService: IInterpreterService;
  let circularityService: ICircularityService;
  let clonedState: IStateService;
  let childState: IStateService;

  beforeEach(() => {
    validationService = {
      validate: vi.fn()
    } as unknown as IValidationService;

    childState = {
      setTextVar: vi.fn(),
      setDataVar: vi.fn(),
      setPathVar: vi.fn(),
      setCommand: vi.fn(),
      getTextVar: vi.fn(),
      getDataVar: vi.fn(),
      getPathVar: vi.fn(),
      getCommand: vi.fn(),
      getAllTextVars: vi.fn().mockReturnValue(new Map()),
      getAllDataVars: vi.fn().mockReturnValue(new Map()),
      getAllPathVars: vi.fn().mockReturnValue(new Map()),
      getAllCommands: vi.fn().mockReturnValue(new Map()),
      clone: vi.fn(),
      mergeChildState: vi.fn()
    } as unknown as IStateService;

    clonedState = {
      setTextVar: vi.fn(),
      setDataVar: vi.fn(),
      setPathVar: vi.fn(),
      setCommand: vi.fn(),
      createChildState: vi.fn().mockReturnValue(childState),
      mergeChildState: vi.fn(),
      clone: vi.fn()
    } as unknown as IStateService;

    stateService = {
      setTextVar: vi.fn(),
      setDataVar: vi.fn(),
      setPathVar: vi.fn(),
      setCommand: vi.fn(),
      clone: vi.fn().mockReturnValue(clonedState),
      createChildState: vi.fn().mockReturnValue(childState)
    } as unknown as IStateService;

    resolutionService = {
      resolveInContext: vi.fn()
    } as unknown as IResolutionService;

    fileSystemService = {
      exists: vi.fn(),
      readFile: vi.fn(),
      dirname: vi.fn().mockReturnValue('/workspace'),
      join: vi.fn().mockImplementation((...args) => args.join('/')),
      normalize: vi.fn().mockImplementation(path => path)
    } as unknown as IFileSystemService;

    parserService = {
      parse: vi.fn()
    } as unknown as IParserService;

    interpreterService = {
      interpret: vi.fn().mockResolvedValue(childState)
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

  describe('special path variables', () => {
    beforeEach(() => {
      // Mock path resolution for special variables
      resolutionService.resolveInContext = vi.fn().mockImplementation(async (path) => {
        if (path.includes('$.') || path.includes('$PROJECTPATH')) {
          return '/project/path/test.meld';
        }
        if (path.includes('$~') || path.includes('$HOMEPATH')) {
          return '/home/user/test.meld';
        }
        return path;
      });
      
      // Mock file system for resolved paths
      fileSystemService.exists.mockResolvedValue(true);
      fileSystemService.readFile.mockResolvedValue('mock content');
      parserService.parse.mockReturnValue([]);
      interpreterService.interpret.mockResolvedValue(childState);
    });

    it('should handle $. alias for project path', async () => {
      const node = createImportDirective('*', createLocation(1, 1));
      node.directive.path = '$./test.meld';
      node.directive.importList = '*';
      const context = { filePath: '/some/path', state: stateService };

      await handler.execute(node, context);

      expect(resolutionService.resolveInContext).toHaveBeenCalledWith(
        '$./test.meld',
        expect.any(Object)
      );
      expect(fileSystemService.exists).toHaveBeenCalledWith('/project/path/test.meld');
    });

    it('should handle $PROJECTPATH for project path', async () => {
      const node = createImportDirective('*', createLocation(1, 1));
      node.directive.path = '$PROJECTPATH/test.meld';
      node.directive.importList = '*';
      const context = { filePath: '/some/path', state: stateService };

      await handler.execute(node, context);

      expect(resolutionService.resolveInContext).toHaveBeenCalledWith(
        '$PROJECTPATH/test.meld',
        expect.any(Object)
      );
      expect(fileSystemService.exists).toHaveBeenCalledWith('/project/path/test.meld');
    });

    it('should handle $~ alias for home path', async () => {
      const node = createImportDirective('*', createLocation(1, 1));
      node.directive.path = '$~/test.meld';
      node.directive.importList = '*';
      const context = { filePath: '/some/path', state: stateService };

      await handler.execute(node, context);

      expect(resolutionService.resolveInContext).toHaveBeenCalledWith(
        '$~/test.meld',
        expect.any(Object)
      );
      expect(fileSystemService.exists).toHaveBeenCalledWith('/home/user/test.meld');
    });

    it('should handle $HOMEPATH for home path', async () => {
      const node = createImportDirective('*', createLocation(1, 1));
      node.directive.path = '$HOMEPATH/test.meld';
      node.directive.importList = '*';
      const context = { filePath: '/some/path', state: stateService };

      await handler.execute(node, context);

      expect(resolutionService.resolveInContext).toHaveBeenCalledWith(
        '$HOMEPATH/test.meld',
        expect.any(Object)
      );
      expect(fileSystemService.exists).toHaveBeenCalledWith('/home/user/test.meld');
    });

    it('should throw error if resolved path does not exist', async () => {
      fileSystemService.exists.mockResolvedValue(false);
      const node = createImportDirective('*', createLocation(1, 1));
      node.directive.path = '$./nonexistent.meld';
      node.directive.importList = '*';
      const context = { filePath: '/some/path', state: stateService };

      await expect(handler.execute(node, context))
        .rejects
        .toThrow('Import file not found');
    });
  });

  describe('basic importing', () => {
    it('should import all variables with *', async () => {
      const node = createImportDirective('vars.meld', createLocation(1, 1));
      node.directive.path = 'vars.meld';
      node.directive.importList = '*';
      const context = { currentFilePath: 'test.meld', state: stateService };

      vi.mocked(resolutionService.resolveInContext).mockResolvedValueOnce('vars.meld');
      vi.mocked(fileSystemService.exists).mockResolvedValueOnce(true);
      vi.mocked(fileSystemService.readFile).mockResolvedValueOnce('# Variables');
      vi.mocked(parserService.parse)
        .mockResolvedValueOnce([]) // For file content
        .mockResolvedValueOnce([]); // For import list parsing

      vi.mocked(interpreterService.interpret).mockResolvedValueOnce(childState);

      // Mock some variables in the child state
      vi.mocked(childState.getAllTextVars).mockReturnValue(new Map([['text1', 'value1']]));
      vi.mocked(childState.getAllDataVars).mockReturnValue(new Map([['data1', { key: 'value' }]]));
      vi.mocked(childState.getAllPathVars).mockReturnValue(new Map([['path1', '/path/to/file']]));
      vi.mocked(childState.getAllCommands).mockReturnValue(new Map([['cmd1', { command: 'echo test' }]]));

      const result = await handler.execute(node, context);

      expect(validationService.validate).toHaveBeenCalledWith(node);
      expect(stateService.clone).toHaveBeenCalled();
      expect(clonedState.setTextVar).toHaveBeenCalledWith('text1', 'value1');
      expect(clonedState.setDataVar).toHaveBeenCalledWith('data1', { key: 'value' });
      expect(clonedState.setPathVar).toHaveBeenCalledWith('path1', '/path/to/file');
      expect(clonedState.setCommand).toHaveBeenCalledWith('cmd1', { command: 'echo test' });
      expect(result).toBe(clonedState);
    });

    it('should import specific variables', async () => {
      const node = createImportDirective('vars.meld', createLocation(1, 1));
      node.directive.path = 'vars.meld';
      node.directive.importList = 'var1, var2 as alias2';
      const context = { currentFilePath: 'test.meld', state: stateService };

      vi.mocked(resolutionService.resolveInContext).mockResolvedValueOnce('vars.meld');
      vi.mocked(fileSystemService.exists).mockResolvedValueOnce(true);
      vi.mocked(fileSystemService.readFile).mockResolvedValueOnce('# Variables');
      
      // Mock parsing the import list
      vi.mocked(parserService.parse)
        .mockResolvedValueOnce([]) // For file content
        .mockResolvedValueOnce([{
          type: 'Directive',
          directive: {
            kind: 'import',
            imports: [
              { name: 'var1' },
              { name: 'var2', alias: 'alias2' }
            ]
          }
        }]); // For import list parsing

      vi.mocked(interpreterService.interpret).mockResolvedValueOnce(childState);

      // Mock variables in the child state
      vi.mocked(childState.getTextVar).mockReturnValueOnce('value1');
      vi.mocked(childState.getTextVar).mockReturnValueOnce('value2');

      const result = await handler.execute(node, context);

      expect(stateService.clone).toHaveBeenCalled();
      expect(clonedState.setTextVar).toHaveBeenCalledWith('var1', 'value1');
      expect(clonedState.setTextVar).toHaveBeenCalledWith('alias2', 'value2');
      expect(result).toBe(clonedState);
    });

    it('should handle invalid import list syntax', async () => {
      const node = createImportDirective('vars.meld', createLocation(1, 1));
      node.directive.path = 'vars.meld';
      node.directive.importList = 'invalid syntax';
      const context = { currentFilePath: 'test.meld', state: stateService };

      vi.mocked(resolutionService.resolveInContext).mockResolvedValueOnce('vars.meld');
      vi.mocked(fileSystemService.exists).mockResolvedValueOnce(true);
      vi.mocked(fileSystemService.readFile).mockResolvedValueOnce('# Variables');
      vi.mocked(parserService.parse)
        .mockResolvedValueOnce([]) // For file content
        .mockRejectedValueOnce(new Error('Parse error')); // For import list parsing

      await expect(handler.execute(node, context)).rejects.toThrow(DirectiveError);
      expect(circularityService.endImport).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should handle validation errors', async () => {
      const node = createImportDirective('', createLocation(1, 1));
      const context = { currentFilePath: 'test.meld', state: stateService };

      vi.mocked(validationService.validate).mockImplementationOnce(() => {
        throw new DirectiveError('Invalid import', 'import');
      });

      await expect(handler.execute(node, context)).rejects.toThrow(DirectiveError);
    });

    it('should handle variable not found appropriately', async () => {
      // Arrange
      const node = createImportDirective('{{nonexistent}}');
      const context = { filePath: '/some/path', state: stateService };
      
      // Mock resolution service to throw a resolution error
      vi.mocked(resolutionService.resolveInContext).mockRejectedValueOnce(
        new MeldResolutionError('Variable not found: nonexistent', {
          severity: ErrorSeverity.Recoverable,
          details: {
            variableName: 'nonexistent',
            variableType: 'text'
          }
        })
      );

      // Act & Assert - Should throw in strict mode
      await expect(
        handler.execute(node, { ...context, strict: true })
      ).rejects.toThrow(DirectiveError);
    });

    it('should handle file not found appropriately', async () => {
      // Arrange
      const node = createImportDirective('missing.meld');
      const context = { filePath: '/some/path', state: stateService };
      
      // Mock resolution service to return the file path
      vi.mocked(resolutionService.resolveInContext).mockResolvedValueOnce('missing.meld');
      
      // Mock file system service to return false for exists check
      vi.mocked(fileSystemService.exists).mockResolvedValueOnce(false);

      // Act & Assert - Should throw in strict mode
      await expect(
        handler.execute(node, { ...context, strict: true })
      ).rejects.toThrow(DirectiveError);
    });

    it('should handle circular imports', async () => {
      const node = createImportDirective('[circular.meld]', createLocation(1, 1));
      const context = {
        currentFilePath: 'test.meld',
        state: stateService,
        parentState: undefined
      };

      vi.mocked(circularityService.beginImport).mockImplementation(() => {
        throw new DirectiveError('Circular import detected', 'import', DirectiveErrorCode.CIRCULAR_REFERENCE);
      });

      await expect(handler.execute(node, context)).rejects.toThrow(DirectiveError);
    });

    it('should handle parse errors', async () => {
      const node = createImportDirective('[invalid.meld]', createLocation(1, 1));
      const context = {
        currentFilePath: 'test.meld',
        state: stateService,
        parentState: undefined
      };

      vi.mocked(fileSystemService.readFile).mockResolvedValue('invalid content');
      vi.mocked(parserService.parse).mockRejectedValue(new Error('Parse error'));

      await expect(handler.execute(node, context)).rejects.toThrow(DirectiveError);
    });

    it('should handle interpretation errors', async () => {
      const node = createImportDirective('[error.meld]', createLocation(1, 1));
      const context = {
        currentFilePath: 'test.meld',
        state: stateService,
        parentState: undefined
      };

      vi.mocked(fileSystemService.readFile).mockResolvedValue('content');
      vi.mocked(parserService.parse).mockResolvedValue([]);
      vi.mocked(interpreterService.interpret).mockRejectedValue(new Error('Interpretation error'));

      await expect(handler.execute(node, context)).rejects.toThrow(DirectiveError);
    });
  });

  describe('cleanup', () => {
    it('should always end import tracking', async () => {
      const node = createImportDirective('error.meld', createLocation(1, 1));
      node.directive.path = 'error.meld';
      const context = { currentFilePath: 'test.meld', state: stateService };

      vi.mocked(resolutionService.resolveInContext).mockResolvedValueOnce('error.meld');
      vi.mocked(fileSystemService.exists).mockResolvedValueOnce(true);
      vi.mocked(fileSystemService.readFile).mockRejectedValueOnce(
        new Error('Read error')
      );

      await expect(handler.execute(node, context)).rejects.toThrow(DirectiveError);
      expect(circularityService.endImport).toHaveBeenCalledWith('error.meld');
    });
  });
}); 