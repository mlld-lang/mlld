import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RunDirectiveHandler } from './RunDirectiveHandler';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService';
import type { IStateService } from '@services/state/StateService/IStateService';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService';
import type { ILogger } from '@core/interfaces/ILogger';
import type { DirectiveNode, RunDirectiveNode } from '@core/ast/types';
import type { DirectiveProcessingContext, ResolutionContext } from '@core/types';
import { mock } from 'vitest-mock-extended';
import { createRunDirective, createLocation, createTextNode } from '@tests/utils/testFactories';
import { ErrorSeverity } from '@core/errors';
import { DirectiveError, DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError';

describe('RunDirectiveHandler - Simplified Tests', () => {
  let handler: RunDirectiveHandler;
  let fileSystemServiceMock: ReturnType<typeof mock<IFileSystemService>>;
  let stateServiceMock: ReturnType<typeof mock<IStateService>>;
  let resolutionServiceMock: ReturnType<typeof mock<IResolutionService>>;
  let loggerMock: ReturnType<typeof mock<ILogger>>;

  beforeEach(() => {
    fileSystemServiceMock = mock<IFileSystemService>();
    stateServiceMock = mock<IStateService>();
    resolutionServiceMock = mock<IResolutionService>();
    loggerMock = mock<ILogger>();

    // Default mock implementations
    vi.mocked(stateServiceMock.getCurrentFilePath).mockReturnValue('/test/current.md');
    vi.mocked(stateServiceMock.isTransformationEnabled).mockReturnValue(false);
    vi.mocked(fileSystemServiceMock.getCwd).mockResolvedValue('/test');
    
    // Initialize handler
    handler = new RunDirectiveHandler();
    handler.initialize({
      fileSystemService: fileSystemServiceMock,
      stateService: stateServiceMock,
      resolutionService: resolutionServiceMock,
      logger: loggerMock
    });
  });

  it('should handle basic runCommand execution', async () => {
    const node = createRunDirective('echo test', createLocation(1,1), 'runCommand');
    
    // Mock resolution and execution
    vi.mocked(resolutionServiceMock.resolveNodes).mockResolvedValue('echo test');
    vi.mocked(fileSystemServiceMock.executeCommand).mockResolvedValue({
      stdout: 'test',
      stderr: '',
      exitCode: 0
    });
    
    const mockContext: DirectiveProcessingContext = {
      directiveNode: node,
      state: stateServiceMock,
      resolutionContext: {} as ResolutionContext,
      executionContext: {},
      formattingContext: undefined
    };
    
    const result = await handler.handle(mockContext);
    
    expect(fileSystemServiceMock.executeCommand).toHaveBeenCalledWith('echo test', { cwd: '/test' });
    expect(result.stateChanges).toBeDefined();
    expect(result.stateChanges!['stdout'].value).toBe('test');
  });

  it('should handle runCode with JavaScript', async () => {
    const node = createRunDirective('console.log("test")', createLocation(1,1), 'runCode', 'javascript');
    
    // Mock file operations
    vi.mocked(fileSystemServiceMock.writeFile).mockResolvedValue(undefined);
    vi.mocked(fileSystemServiceMock.executeCommand).mockResolvedValue({
      stdout: 'test',
      stderr: '',
      exitCode: 0
    });
    
    const mockContext: DirectiveProcessingContext = {
      directiveNode: node,
      state: stateServiceMock,
      resolutionContext: {} as ResolutionContext,
      executionContext: {},
      formattingContext: undefined
    };
    
    const result = await handler.handle(mockContext);
    
    // Should have written a temp file
    expect(fileSystemServiceMock.writeFile).toHaveBeenCalledWith(
      expect.stringMatching(/\.js$/),
      'console.log("test")'
    );
    
    // Should execute with node
    expect(fileSystemServiceMock.executeCommand).toHaveBeenCalledWith(
      expect.stringContaining('node'),
      { cwd: '/test' }
    );
    
    expect(result.stateChanges!['stdout'].value).toBe('test');
  });

  it('should handle runExec for predefined commands', async () => {
    const node = createRunDirective({ name: 'myCmd' } as any, createLocation(1,1), 'runExec');
    // Need to set up identifier properly
    (node.values as any).identifier = [{ type: 'Text', content: 'myCmd' }];
    
    // Mock command resolution
    vi.mocked(resolutionServiceMock.resolveVariableInContext).mockResolvedValue({
      name: 'myCmd',
      command: 'echo hello',
      parameters: []
    });
    
    vi.mocked(fileSystemServiceMock.executeCommand).mockResolvedValue({
      stdout: 'hello',
      stderr: '',
      exitCode: 0
    });
    
    const mockContext: DirectiveProcessingContext = {
      directiveNode: node,
      state: stateServiceMock,
      resolutionContext: {} as ResolutionContext,
      executionContext: {},
      formattingContext: undefined
    };
    
    const result = await handler.handle(mockContext);
    
    expect(resolutionServiceMock.resolveVariableInContext).toHaveBeenCalledWith('myCmd', expect.any(Object));
    expect(fileSystemServiceMock.executeCommand).toHaveBeenCalledWith('echo hello', { cwd: '/test' });
    expect(result.stateChanges!['stdout'].value).toBe('hello');
  });

  it('should handle transformation mode', async () => {
    vi.mocked(stateServiceMock.isTransformationEnabled).mockReturnValue(true);
    
    const node = createRunDirective('echo test', createLocation(1,1), 'runCommand');
    
    vi.mocked(resolutionServiceMock.resolveNodes).mockResolvedValue('echo test');
    vi.mocked(fileSystemServiceMock.executeCommand).mockResolvedValue({
      stdout: 'test output',
      stderr: '',
      exitCode: 0
    });
    
    const mockContext: DirectiveProcessingContext = {
      directiveNode: node,
      state: stateServiceMock,
      resolutionContext: {} as ResolutionContext,
      executionContext: {},
      formattingContext: undefined
    };
    
    const result = await handler.handle(mockContext);
    
    // Should return replacement node in transformation mode
    expect(result.replacement).toBeDefined();
    expect(result.replacement?.[0]).toMatchObject({
      type: 'Text',
      content: 'test output'
    });
  });

  it('should handle custom output variables', async () => {
    const node = createRunDirective(
      'echo test', 
      createLocation(1,1), 
      'runCommand',
      undefined,
      undefined,
      'myOut',
      'myErr'
    );
    (node.values as any).outputVariable = [{ type: 'Text', content: 'myOut' }];
    (node.values as any).errorVariable = [{ type: 'Text', content: 'myErr' }];
    
    vi.mocked(resolutionServiceMock.resolveNodes).mockResolvedValue('echo test');
    vi.mocked(fileSystemServiceMock.executeCommand).mockResolvedValue({
      stdout: 'output',
      stderr: 'error',
      exitCode: 0
    });
    
    const mockContext: DirectiveProcessingContext = {
      directiveNode: node,
      state: stateServiceMock,
      resolutionContext: {} as ResolutionContext,
      executionContext: {},
      formattingContext: undefined
    };
    
    const result = await handler.handle(mockContext);
    
    // Should use custom variable names
    expect(result.stateChanges!['myOut'].value).toBe('output');
    expect(result.stateChanges!['myErr'].value).toBe('error');
  });

  it('should handle execution errors', async () => {
    const node = createRunDirective('bad-command', createLocation(1,1), 'runCommand');
    
    vi.mocked(resolutionServiceMock.resolveNodes).mockResolvedValue('bad-command');
    vi.mocked(fileSystemServiceMock.executeCommand).mockRejectedValue(new Error('Command not found'));
    
    const mockContext: DirectiveProcessingContext = {
      directiveNode: node,
      state: stateServiceMock,
      resolutionContext: {} as ResolutionContext,
      executionContext: {},
      formattingContext: undefined
    };
    
    await expect(handler.handle(mockContext)).rejects.toThrow(DirectiveError);
    await expect(handler.handle(mockContext)).rejects.toThrow(/Failed to execute command/);
  });

  it('should handle undefined command reference', async () => {
    const node = createRunDirective({ name: 'unknownCmd' } as any, createLocation(1,1), 'runExec');
    (node.values as any).identifier = [{ type: 'Text', content: 'unknownCmd' }];
    
    vi.mocked(resolutionServiceMock.resolveVariableInContext).mockResolvedValue(undefined);
    
    const mockContext: DirectiveProcessingContext = {
      directiveNode: node,
      state: stateServiceMock,
      resolutionContext: {} as ResolutionContext,
      executionContext: {},
      formattingContext: undefined
    };
    
    await expect(handler.handle(mockContext)).rejects.toThrow(DirectiveError);
    await expect(handler.handle(mockContext)).rejects.toThrow(/Undefined command reference: unknownCmd/);
  });
});