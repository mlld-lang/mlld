import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RunDirectiveHandler } from './RunDirectiveHandler';
import { createRunDirective, createLocation } from '../../../../tests/utils/testFactories';
import type { IValidationService } from '../../../ValidationService/IValidationService';
import type { IStateService } from '../../../StateService/IStateService';
import type { IResolutionService } from '../../../ResolutionService/IResolutionService';
import type { IFileSystemService } from '../../../FileSystemService/IFileSystemService';
import type { DirectiveNode } from 'meld-spec';
import { DirectiveError, DirectiveErrorCode } from '../../errors/DirectiveError';
import { exec } from 'child_process';
import { promisify } from 'util';

// Mock child_process
vi.mock('child_process', () => ({
  exec: vi.fn()
}));

describe('RunDirectiveHandler', () => {
  let handler: RunDirectiveHandler;
  let validationService: IValidationService;
  let stateService: IStateService;
  let resolutionService: IResolutionService;
  let fileSystemService: IFileSystemService;

  beforeEach(() => {
    validationService = {
      validate: vi.fn(),
      registerValidator: vi.fn(),
      removeValidator: vi.fn(),
      hasValidator: vi.fn(),
      getRegisteredDirectiveKinds: vi.fn()
    } as unknown as IValidationService;

    stateService = {
      setTextVar: vi.fn(),
      getTextVar: vi.fn()
    } as unknown as IStateService;

    resolutionService = {
      resolveInContext: vi.fn()
    } as unknown as IResolutionService;

    fileSystemService = {
      getCwd: vi.fn().mockReturnValue('/workspace'),
      executeCommand: vi.fn()
    } as unknown as IFileSystemService;

    handler = new RunDirectiveHandler(
      validationService,
      resolutionService,
      stateService,
      fileSystemService
    );

    // Reset mocks
    vi.clearAllMocks();
  });

  describe('basic command execution', () => {
    it('should execute simple commands', async () => {
      const node = createRunDirective('echo "test"', createLocation(1, 1));
      const context = { currentFilePath: 'test.meld' };

      vi.mocked(resolutionService.resolveInContext).mockResolvedValue('echo "test"');
      vi.mocked(fileSystemService.executeCommand).mockResolvedValue({
        stdout: 'test output',
        stderr: ''
      });

      await handler.execute(node, context);

      expect(validationService.validate).toHaveBeenCalledWith(node);
      expect(resolutionService.resolveInContext).toHaveBeenCalledWith(
        'echo "test"',
        {
          allowNested: false,
          allowedVariableTypes: {
            command: true,
            data: false,
            path: true,
            text: true
          },
          currentFilePath: 'test.meld'
        }
      );
      expect(fileSystemService.executeCommand).toHaveBeenCalledWith(
        'echo "test"',
        expect.any(Object)
      );
      expect(stateService.setTextVar).toHaveBeenCalledWith('stdout', 'test output');
    });

    it('should handle commands with variables', async () => {
      const node = createRunDirective('${cmd} ${arg}', createLocation(1, 1));
      const context = { currentFilePath: 'test.meld' };

      vi.mocked(resolutionService.resolveInContext).mockResolvedValue('echo "Hello World"');
      vi.mocked(fileSystemService.executeCommand).mockResolvedValue({
        stdout: 'Hello World',
        stderr: ''
      });

      await handler.execute(node, context);

      expect(validationService.validate).toHaveBeenCalledWith(node);
      expect(resolutionService.resolveInContext).toHaveBeenCalledWith(
        '${cmd} ${arg}',
        {
          allowNested: false,
          allowedVariableTypes: {
            command: true,
            data: false,
            path: true,
            text: true
          },
          currentFilePath: 'test.meld'
        }
      );
      expect(fileSystemService.executeCommand).toHaveBeenCalledWith(
        'echo "Hello World"',
        expect.any(Object)
      );
      expect(stateService.setTextVar).toHaveBeenCalledWith('stdout', 'Hello World');
    });

    it('should handle commands with path variables', async () => {
      const node = createRunDirective('cat $PROJECTPATH/test.txt', createLocation(1, 1));
      const context = { currentFilePath: 'test.meld' };

      vi.mocked(resolutionService.resolveInContext).mockResolvedValue('cat /workspace/test.txt');
      vi.mocked(fileSystemService.executeCommand).mockResolvedValue({
        stdout: 'file contents',
        stderr: ''
      });

      await handler.execute(node, context);

      expect(validationService.validate).toHaveBeenCalledWith(node);
      expect(resolutionService.resolveInContext).toHaveBeenCalledWith(
        'cat $PROJECTPATH/test.txt',
        {
          allowNested: false,
          allowedVariableTypes: {
            command: true,
            data: false,
            path: true,
            text: true
          },
          currentFilePath: 'test.meld'
        }
      );
      expect(fileSystemService.executeCommand).toHaveBeenCalledWith(
        'cat /workspace/test.txt',
        expect.any(Object)
      );
      expect(stateService.setTextVar).toHaveBeenCalledWith('stdout', 'file contents');
    });
  });

  describe('error handling', () => {
    it('should handle validation errors', async () => {
      const node = createRunDirective('', createLocation(1, 1));
      const context = { currentFilePath: 'test.meld' };

      vi.mocked(validationService.validate).mockRejectedValueOnce(
        new DirectiveError('Invalid command', 'run', DirectiveErrorCode.VALIDATION_FAILED)
      );

      await expect(handler.execute(node, context)).rejects.toThrow(DirectiveError);
      expect(fileSystemService.executeCommand).not.toHaveBeenCalled();
    });

    it('should handle resolution errors', async () => {
      const node = createRunDirective('${undefined_var}', createLocation(1, 1));
      const context = { currentFilePath: 'test.meld' };

      vi.mocked(resolutionService.resolveInContext).mockRejectedValueOnce(
        new Error('Variable not found')
      );

      await expect(handler.execute(node, context)).rejects.toThrow(DirectiveError);
      expect(fileSystemService.executeCommand).not.toHaveBeenCalled();
    });

    it('should handle command execution errors', async () => {
      const node = createRunDirective('invalid-command', createLocation(1, 1));
      const context = { currentFilePath: 'test.meld' };

      vi.mocked(resolutionService.resolveInContext).mockResolvedValueOnce('invalid-command');
      vi.mocked(fileSystemService.executeCommand).mockRejectedValueOnce(
        new Error('Command failed')
      );

      await expect(handler.execute(node, context)).rejects.toThrow(DirectiveError);
      expect(stateService.setTextVar).not.toHaveBeenCalled();
    });
  });

  describe('output handling', () => {
    it('should handle stdout and stderr', async () => {
      const node = createRunDirective('echo "test" >&2', createLocation(1, 1));
      const context = { currentFilePath: 'test.meld' };

      vi.mocked(resolutionService.resolveInContext).mockResolvedValueOnce('echo "test" >&2');
      vi.mocked(fileSystemService.executeCommand).mockResolvedValueOnce({
        stdout: '',
        stderr: 'error output'
      });

      await handler.execute(node, context);

      expect(stateService.setTextVar).toHaveBeenCalledWith('stderr', 'error output');
    });

    it('should handle output capture to variable', async () => {
      const node = createRunDirective('echo "test"', createLocation(1, 1));
      node.directive.output = 'result';  // Add output capture
      const context = { currentFilePath: 'test.meld' };

      vi.mocked(resolutionService.resolveInContext).mockResolvedValueOnce('echo "test"');
      vi.mocked(fileSystemService.executeCommand).mockResolvedValueOnce({
        stdout: 'test output',
        stderr: ''
      });

      await handler.execute(node, context);

      expect(stateService.setTextVar).toHaveBeenCalledWith('result', 'test output');
    });
  });

  describe('working directory handling', () => {
    it('should use workspace root as default cwd', async () => {
      const node = createRunDirective('pwd', createLocation(1, 1));
      const context = { currentFilePath: 'test.meld' };

      vi.mocked(resolutionService.resolveInContext).mockResolvedValueOnce('pwd');
      vi.mocked(fileSystemService.executeCommand).mockResolvedValueOnce({
        stdout: '/workspace',
        stderr: ''
      });

      await handler.execute(node, context);

      expect(fileSystemService.executeCommand).toHaveBeenCalledWith(
        'pwd',
        expect.objectContaining({ cwd: '/workspace' })
      );
    });

    it('should respect custom working directory', async () => {
      const node = createRunDirective('pwd', createLocation(1, 1));
      const context = { 
        currentFilePath: 'test.meld',
        workingDirectory: '/custom/dir'
      };

      vi.mocked(resolutionService.resolveInContext).mockResolvedValueOnce('pwd');
      vi.mocked(fileSystemService.executeCommand).mockResolvedValueOnce({
        stdout: '/custom/dir',
        stderr: ''
      });

      await handler.execute(node, context);

      expect(fileSystemService.executeCommand).toHaveBeenCalledWith(
        'pwd',
        expect.objectContaining({ cwd: '/custom/dir' })
      );
    });
  });
}); 