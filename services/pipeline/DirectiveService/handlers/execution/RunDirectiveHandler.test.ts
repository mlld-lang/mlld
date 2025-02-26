// Mock the logger before any imports
const mockLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn()
};

vi.mock('../../../../core/utils/logger', () => ({
  directiveLogger: mockLogger
}));

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RunDirectiveHandler } from './RunDirectiveHandler.js';
import { createRunDirective, createLocation } from '@tests/utils/testFactories.js';
import type { IValidationService } from '@services/resolution/ValidationService/IValidationService.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
import type { DirectiveNode } from 'meld-spec';
import { DirectiveError, DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
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
  let clonedState: IStateService;

  beforeEach(() => {
    validationService = {
      validate: vi.fn(),
      registerValidator: vi.fn(),
      removeValidator: vi.fn(),
      hasValidator: vi.fn(),
      getRegisteredDirectiveKinds: vi.fn()
    } as unknown as IValidationService;

    clonedState = {
      setTextVar: vi.fn(),
      clone: vi.fn(),
      isTransformationEnabled: vi.fn().mockReturnValue(false)
    } as unknown as IStateService;

    stateService = {
      setTextVar: vi.fn(),
      clone: vi.fn().mockReturnValue(clonedState),
      isTransformationEnabled: vi.fn().mockReturnValue(false)
    } as unknown as IStateService;

    resolutionService = {
      resolveInContext: vi.fn()
    } as unknown as IResolutionService;

    fileSystemService = {
      getCwd: vi.fn().mockReturnValue('/workspace'),
      executeCommand: vi.fn(),
      dirname: vi.fn().mockReturnValue('/workspace'),
      join: vi.fn().mockImplementation((...args) => args.join('/')),
      normalize: vi.fn().mockImplementation(path => path)
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
      const node = createRunDirective('echo test', createLocation(1, 1));
      const context = { currentFilePath: 'test.meld', state: stateService };

      const clonedState = {
        ...stateService,
        clone: vi.fn().mockReturnThis(),
        setTextVar: vi.fn(),
        isTransformationEnabled: vi.fn().mockReturnValue(false)
      };

      vi.mocked(stateService.clone).mockReturnValue(clonedState);
      vi.mocked(validationService.validate).mockResolvedValue(undefined);
      vi.mocked(resolutionService.resolveInContext).mockResolvedValue('echo test');
      vi.mocked(fileSystemService.executeCommand).mockResolvedValue({
        stdout: 'test output',
        stderr: ''
      });

      const result = await handler.execute(node, context);

      expect(fileSystemService.executeCommand).toHaveBeenCalledWith(
        'echo test',
        expect.objectContaining({ cwd: '/workspace' })
      );
      expect(clonedState.setTextVar).toHaveBeenCalledWith('stdout', 'test output');
      expect(result.state).toBe(clonedState);
    });

    it('should handle commands with variables', async () => {
      const node = createRunDirective('echo {{message}}', createLocation(1, 1));
      const context = { currentFilePath: 'test.meld', state: stateService };

      const clonedState = {
        ...stateService,
        clone: vi.fn().mockReturnThis(),
        setTextVar: vi.fn(),
        getTextVar: vi.fn().mockReturnValue('Hello World'),
        isTransformationEnabled: vi.fn().mockReturnValue(false)
      };

      vi.mocked(stateService.clone).mockReturnValue(clonedState);
      vi.mocked(validationService.validate).mockResolvedValue(undefined);
      vi.mocked(resolutionService.resolveInContext).mockResolvedValue('echo Hello World');
      vi.mocked(fileSystemService.executeCommand).mockResolvedValue({
        stdout: 'Hello World',
        stderr: ''
      });

      const result = await handler.execute(node, context);

      expect(fileSystemService.executeCommand).toHaveBeenCalledWith(
        'echo Hello World',
        expect.objectContaining({ cwd: '/workspace' })
      );
      expect(clonedState.setTextVar).toHaveBeenCalledWith('stdout', 'Hello World');
      expect(result.state).toBe(clonedState);
    });

    it('should handle commands with path variables', async () => {
      const node = createRunDirective('cat {{file}}', createLocation(1, 1));
      const context = { currentFilePath: 'test.meld', state: stateService };

      const clonedState = {
        ...stateService,
        clone: vi.fn().mockReturnThis(),
        setTextVar: vi.fn(),
        getPathVar: vi.fn().mockReturnValue('/path/to/file'),
        isTransformationEnabled: vi.fn().mockReturnValue(false)
      };

      vi.mocked(stateService.clone).mockReturnValue(clonedState);
      vi.mocked(validationService.validate).mockResolvedValue(undefined);
      vi.mocked(resolutionService.resolveInContext).mockResolvedValue('cat /path/to/file');
      vi.mocked(fileSystemService.executeCommand).mockResolvedValue({
        stdout: 'file contents',
        stderr: ''
      });

      const result = await handler.execute(node, context);

      expect(fileSystemService.executeCommand).toHaveBeenCalledWith(
        'cat /path/to/file',
        expect.objectContaining({ cwd: '/workspace' })
      );
      expect(clonedState.setTextVar).toHaveBeenCalledWith('stdout', 'file contents');
      expect(result.state).toBe(clonedState);
    });
  });

  describe('error handling', () => {
    it('should handle validation errors', async () => {
      const node = createRunDirective('', createLocation(1, 1));
      const context = { 
        currentFilePath: 'test.meld', 
        state: stateService,
        workingDirectory: '/workspace'
      };

      vi.mocked(validationService.validate).mockRejectedValueOnce(
        new DirectiveError('Invalid command', 'run', DirectiveErrorCode.VALIDATION_FAILED)
      );

      await expect(handler.execute(node, context)).rejects.toThrow(DirectiveError);
      expect(fileSystemService.executeCommand).not.toHaveBeenCalled();
    });

    it('should handle resolution errors', async () => {
      const node = createRunDirective('{{undefined_var}}', createLocation(1, 1));
      const context = { 
        currentFilePath: 'test.meld', 
        state: stateService,
        workingDirectory: '/workspace'
      };

      vi.mocked(resolutionService.resolveInContext).mockRejectedValueOnce(
        new Error('Variable not found')
      );

      await expect(handler.execute(node, context)).rejects.toThrow(DirectiveError);
      expect(fileSystemService.executeCommand).not.toHaveBeenCalled();
    });

    it('should handle command execution errors', async () => {
      const node = createRunDirective('invalid-command', createLocation(1, 1));
      const context = { 
        currentFilePath: 'test.meld', 
        state: stateService,
        workingDirectory: '/workspace'
      };

      vi.mocked(resolutionService.resolveInContext).mockResolvedValueOnce('invalid-command');
      vi.mocked(fileSystemService.executeCommand).mockRejectedValueOnce(
        new Error('Command failed')
      );

      await expect(handler.execute(node, context)).rejects.toThrow(DirectiveError);
      expect(clonedState.setTextVar).not.toHaveBeenCalled();
    });
  });

  describe('output handling', () => {
    it('should handle stdout and stderr', async () => {
      const node = createRunDirective('echo error >&2', createLocation(1, 1));
      const context = {
        currentFilePath: 'test.meld',
        state: stateService,
        parentState: undefined
      };

      const clonedState = {
        ...stateService,
        clone: vi.fn().mockReturnThis(),
        setTextVar: vi.fn(),
        isTransformationEnabled: vi.fn().mockReturnValue(false)
      };

      vi.mocked(stateService.clone).mockReturnValue(clonedState);
      vi.mocked(validationService.validate).mockResolvedValue(undefined);
      vi.mocked(resolutionService.resolveInContext).mockResolvedValue('echo error >&2');
      vi.mocked(fileSystemService.executeCommand).mockResolvedValue({
        stdout: '',
        stderr: 'error output'
      });

      const result = await handler.execute(node, context);

      expect(stateService.clone).toHaveBeenCalled();
      expect(clonedState.setTextVar).toHaveBeenCalledWith('stderr', 'error output');
      expect(result.state).toBe(clonedState);
    });

    it('should handle output capture to variable', async () => {
      const node = createRunDirective('echo test', createLocation(1, 1));
      node.directive.output = 'result';
      const context = {
        currentFilePath: 'test.meld',
        state: stateService,
        parentState: undefined
      };

      const clonedState = {
        ...stateService,
        clone: vi.fn().mockReturnThis(),
        setTextVar: vi.fn(),
        isTransformationEnabled: vi.fn().mockReturnValue(false)
      };

      vi.mocked(stateService.clone).mockReturnValue(clonedState);
      vi.mocked(validationService.validate).mockResolvedValue(undefined);
      vi.mocked(resolutionService.resolveInContext).mockResolvedValue('echo test');
      vi.mocked(fileSystemService.executeCommand).mockResolvedValue({
        stdout: 'test output',
        stderr: ''
      });

      const result = await handler.execute(node, context);

      expect(stateService.clone).toHaveBeenCalled();
      expect(clonedState.setTextVar).toHaveBeenCalledWith('result', 'test output');
      expect(result.state).toBe(clonedState);
    });
  });

  describe('working directory handling', () => {
    it('should use workspace root as default cwd', async () => {
      const node = createRunDirective('pwd', createLocation(1, 1));
      const context = {
        currentFilePath: 'test.meld',
        state: stateService,
        parentState: undefined
      };

      const clonedState = {
        ...stateService,
        clone: vi.fn().mockReturnThis(),
        setTextVar: vi.fn(),
        isTransformationEnabled: vi.fn().mockReturnValue(false)
      };

      vi.mocked(stateService.clone).mockReturnValue(clonedState);
      vi.mocked(validationService.validate).mockResolvedValue(undefined);
      vi.mocked(resolutionService.resolveInContext).mockResolvedValue('pwd');
      vi.mocked(fileSystemService.executeCommand).mockResolvedValue({
        stdout: '/workspace',
        stderr: ''
      });

      const result = await handler.execute(node, context);

      expect(fileSystemService.executeCommand).toHaveBeenCalledWith(
        'pwd',
        expect.objectContaining({ cwd: '/workspace' })
      );
      expect(clonedState.setTextVar).toHaveBeenCalledWith('stdout', '/workspace');
      expect(result.state).toBe(clonedState);
    });

    it('should respect custom working directory', async () => {
      const node = createRunDirective('pwd', createLocation(1, 1));
      const context = {
        currentFilePath: 'test.meld',
        state: stateService,
        parentState: undefined,
        workingDirectory: '/custom/dir'
      };

      const clonedState = {
        ...stateService,
        clone: vi.fn().mockReturnThis(),
        setTextVar: vi.fn(),
        isTransformationEnabled: vi.fn().mockReturnValue(false)
      };

      vi.mocked(stateService.clone).mockReturnValue(clonedState);
      vi.mocked(validationService.validate).mockResolvedValue(undefined);
      vi.mocked(resolutionService.resolveInContext).mockResolvedValue('pwd');
      vi.mocked(fileSystemService.executeCommand).mockResolvedValue({
        stdout: '/custom/dir',
        stderr: ''
      });

      const result = await handler.execute(node, context);

      expect(fileSystemService.executeCommand).toHaveBeenCalledWith(
        'pwd',
        expect.objectContaining({ cwd: '/custom/dir' })
      );
      expect(clonedState.setTextVar).toHaveBeenCalledWith('stdout', '/custom/dir');
      expect(result.state).toBe(clonedState);
    });
  });
}); 