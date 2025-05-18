import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RunDirectiveHandler } from './RunDirectiveHandler';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService';
import type { IStateService } from '@services/state/StateService/IStateService';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService';
import type { ILogger } from '@core/interfaces/ILogger';
import type { DirectiveNode, RunDirectiveNode } from '@core/ast/types';
import type { DirectiveProcessingContext, ResolutionContext } from '@core/types';
import { mock } from 'vitest-mock-extended';
import { ASTFixtureLoader } from '@tests/utils/ASTFixtureLoader';

describe('RunDirectiveHandler - Fixture Tests', () => {
  let handler: RunDirectiveHandler;
  let fileSystemServiceMock: ReturnType<typeof mock<IFileSystemService>>;
  let stateServiceMock: ReturnType<typeof mock<IStateService>>;
  let resolutionServiceMock: ReturnType<typeof mock<IResolutionService>>;
  let loggerMock: ReturnType<typeof mock<ILogger>>;
  const fixtureLoader = new ASTFixtureLoader();

  beforeEach(() => {
    fileSystemServiceMock = mock<IFileSystemService>();
    stateServiceMock = mock<IStateService>();
    resolutionServiceMock = mock<IResolutionService>();
    loggerMock = mock<ILogger>();

    // Default mock implementations
    vi.mocked(stateServiceMock.getCurrentFilePath).mockReturnValue('/test/current.md');
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

  describe('runCommand', () => {
    it('should handle run-command directive correctly', async () => {
      const fixture = fixtureLoader.getFixture('run-command');
      if (!fixture) throw new Error('Fixture not found');
      
      const runNode = fixture.ast[0] as RunDirectiveNode;
      const expectedOutput = 'Hello from command\n';
      
      // Set up mocks
      vi.mocked(fileSystemServiceMock.executeCommand).mockResolvedValue({
        stdout: expectedOutput,
        stderr: '',
        exitCode: 0
      });
      
      const mockContext: DirectiveProcessingContext = {
        directiveNode: runNode,
        state: stateServiceMock,
        resolutionContext: {} as ResolutionContext,
        executionContext: {},
        formattingContext: undefined
      };
      
      const result = await handler.handle(mockContext);
      
      // Should execute the command
      expect(fileSystemServiceMock.executeCommand).toHaveBeenCalledWith(
        'echo "Hello from command"',
        expect.objectContaining({
          cwd: expect.any(String)
        })
      );
      
      // Should create state changes with stdout/stderr variables
      expect(result.stateChanges).toBeDefined();
      expect(result.stateChanges!['stdout']).toBeDefined();
      expect(result.stateChanges!['stdout'].value).toBe(expectedOutput);
      expect(result.stateChanges!['stderr']).toBeDefined();
    });

    it('should handle run-command-multiline directive correctly', async () => {
      const fixture = fixtureLoader.getFixture('run-command-multiline');
      if (!fixture) throw new Error('Fixture not found');
      
      const runNode = fixture.ast[0] as RunDirectiveNode;
      const expectedOutput = 'Line 1\nLine 2\n';
      
      // Set up mocks
      vi.mocked(resolutionServiceMock.resolveNodes).mockImplementation(async (nodes: any[]) => {
        // The fixture has the full command in the content
        if (nodes && nodes[0] && nodes[0].content) {
          return nodes[0].content;
        }
        return '';
      });
      vi.mocked(fileSystemServiceMock.executeCommand).mockResolvedValue({
        stdout: expectedOutput,
        stderr: '',
        exitCode: 0
      });
      
      const mockContext: DirectiveProcessingContext = {
        directiveNode: runNode,
        state: stateServiceMock,
        resolutionContext: {} as ResolutionContext,
        executionContext: {},
        formattingContext: undefined
      };
      
      const result = await handler.handle(mockContext);
      
      // Should execute the multiline command
      expect(fileSystemServiceMock.executeCommand).toHaveBeenCalledWith(
        expect.stringContaining('bash -c'),
        expect.any(Object)
      );
      
      // Should create state changes
      expect(result.stateChanges).toBeDefined();
      expect(result.stateChanges!['stdout'].value).toBe(expectedOutput);
    });
  });

  describe('runCode', () => {
    it('should handle run-code directive correctly', async () => {
      const fixture = fixtureLoader.getFixture('run-code');
      if (!fixture) throw new Error('Fixture not found');
      
      const runNode = fixture.ast[0] as RunDirectiveNode;
      const expectedOutput = 'Hello from code';
      
      // Set up mocks - write temp file and execute
      vi.mocked(fileSystemServiceMock.writeFile).mockResolvedValue(undefined);
      vi.mocked(fileSystemServiceMock.executeCommand).mockResolvedValue({
        stdout: expectedOutput,
        stderr: '',
        exitCode: 0
      });
      
      const mockContext: DirectiveProcessingContext = {
        directiveNode: runNode,
        state: stateServiceMock,
        resolutionContext: {} as ResolutionContext,
        executionContext: {},
        formattingContext: undefined
      };
      
      const result = await handler.handle(mockContext);
      
      // Should have written a temp file
      expect(fileSystemServiceMock.writeFile).toHaveBeenCalledWith(
        expect.stringMatching(/\.js$/),
        'console.log("Hello from code")'
      );
      
      // Should execute the javascript script
      expect(fileSystemServiceMock.executeCommand).toHaveBeenCalledWith(
        expect.stringContaining('node'),
        expect.any(Object)
      );
      
      // Should create state changes
      expect(result.stateChanges).toBeDefined();
      expect(result.stateChanges!['stdout'].value).toBe(expectedOutput);
    });

    it('should handle run-code-multiline directive correctly', async () => {
      const fixture = fixtureLoader.getFixture('run-code-multiline');
      if (!fixture) throw new Error('Fixture not found');
      
      const runNode = fixture.ast[0] as RunDirectiveNode;
      const expectedOutput = 'Hello\nWorld\n';
      
      // Set up mocks
      vi.mocked(fileSystemServiceMock.writeFile).mockResolvedValue(undefined);
      vi.mocked(fileSystemServiceMock.executeCommand).mockResolvedValue({
        stdout: expectedOutput,
        stderr: '',
        exitCode: 0
      });
      
      const mockContext: DirectiveProcessingContext = {
        directiveNode: runNode,
        state: stateServiceMock,
        resolutionContext: {} as ResolutionContext,
        executionContext: {},
        formattingContext: undefined
      };
      
      const result = await handler.handle(mockContext);
      
      // Should have written the multiline code
      expect(fileSystemServiceMock.writeFile).toHaveBeenCalledWith(
        expect.stringMatching(/\.js$/),
        expect.stringContaining('console.log(greet())')
      );
      
      // Should create state changes
      expect(result.stateChanges).toBeDefined();
      expect(result.stateChanges!['stdout'].value).toBe(expectedOutput);
    });
  });

  describe('runExec', () => {
    it('should handle run-exec directive correctly', async () => {
      const fixture = fixtureLoader.getFixture('run-exec');
      if (!fixture) throw new Error('Fixture not found');
      
      const runNode = fixture.ast[0] as RunDirectiveNode;
      const expectedOutput = 'Hello from predefined command';
      
      // Set up mocks - resolve the command definition
      const commandDef = {
        name: 'greetCommand',
        command: 'echo "Hello from predefined command"',
        parameters: []
      };
      
      vi.mocked(resolutionServiceMock.resolveVariableInContext).mockResolvedValue(commandDef);
      vi.mocked(fileSystemServiceMock.executeCommand).mockResolvedValue({
        stdout: expectedOutput,
        stderr: '',
        exitCode: 0
      });
      
      const mockContext: DirectiveProcessingContext = {
        directiveNode: runNode,
        state: stateServiceMock,
        resolutionContext: {} as ResolutionContext,
        executionContext: {},
        formattingContext: undefined
      };
      
      const result = await handler.handle(mockContext);
      
      // Should resolve the command definition
      expect(resolutionServiceMock.resolveVariableInContext).toHaveBeenCalledWith(
        'greetCommand',
        expect.any(Object)
      );
      
      // Should execute the resolved command
      expect(fileSystemServiceMock.executeCommand).toHaveBeenCalledWith(
        'echo "Hello from predefined command"',
        expect.any(Object)
      );
      
      // Should create state changes
      expect(result.stateChanges).toBeDefined();
      expect(result.stateChanges!['stdout'].value).toBe(expectedOutput);
    });

    it('should handle run-exec-parameters directive correctly', async () => {
      const fixture = fixtureLoader.getFixture('run-exec-parameters');
      if (!fixture) throw new Error('Fixture not found');
      
      // The run directive is the last one in the AST array
      const runNode = fixture.ast[fixture.ast.length - 1] as RunDirectiveNode;
      const expectedOutput = 'Hello World';
      
      // Set up mocks - note the fixture only has one parameter "World"
      const commandDef = {
        name: 'greetCommand',
        command: 'echo "Hello $1"',
        parameters: ['name']
      };
      
      vi.mocked(resolutionServiceMock.resolveVariableInContext).mockResolvedValue(commandDef);
      vi.mocked(resolutionServiceMock.resolveInContext).mockImplementation(async (value: any) => {
        if (value === 'World') return 'World';
        return value;
      });
      vi.mocked(fileSystemServiceMock.executeCommand).mockResolvedValue({
        stdout: expectedOutput,
        stderr: '',
        exitCode: 0
      });
      
      const mockContext: DirectiveProcessingContext = {
        directiveNode: runNode,
        state: stateServiceMock,
        resolutionContext: {} as ResolutionContext,
        executionContext: {},
        formattingContext: undefined
      };
      
      const result = await handler.handle(mockContext);
      
      // Should execute with parameters substituted
      expect(fileSystemServiceMock.executeCommand).toHaveBeenCalledWith(
        'echo "Hello World"',
        expect.any(Object)
      );
      
      // Should create state changes
      expect(result.stateChanges).toBeDefined();
      expect(result.stateChanges!['stdout'].value).toBe(expectedOutput);
    });
  });

  describe('error handling', () => {
    it('should throw error for invalid directive kind', async () => {
      const fixture = fixtureLoader.getFixture('run-command');
      if (!fixture) throw new Error('Fixture not found');
      
      const runNode = fixture.ast[0] as any;
      runNode.kind = 'text'; // Invalid kind
      
      const mockContext: DirectiveProcessingContext = {
        directiveNode: runNode,
        state: stateServiceMock,
        resolutionContext: {} as ResolutionContext,
        executionContext: {},
        formattingContext: undefined
      };
      
      await expect(handler.handle(mockContext)).rejects.toThrow('Invalid node type provided to RunDirectiveHandler');
    });

    it('should throw error for command execution failure', async () => {
      const fixture = fixtureLoader.getFixture('run-exec');
      if (!fixture) throw new Error('Fixture not found');
      
      const runNode = fixture.ast[0] as RunDirectiveNode;
      
      // Set up mocks - command definition exists but execution fails
      vi.mocked(resolutionServiceMock.resolveVariableInContext).mockResolvedValue({
        name: 'greetCommand',
        command: 'echo "test"',
        parameters: []
      });
      vi.mocked(fileSystemServiceMock.executeCommand).mockRejectedValue(new Error('Command failed'));
      
      const mockContext: DirectiveProcessingContext = {
        directiveNode: runNode,
        state: stateServiceMock,
        resolutionContext: {} as ResolutionContext,
        executionContext: {},
        formattingContext: undefined
      };
      
      await expect(handler.handle(mockContext)).rejects.toThrow('Failed to execute command');
    });

    it('should throw error for undefined command reference', async () => {
      const fixture = fixtureLoader.getFixture('run-exec');
      if (!fixture) throw new Error('Fixture not found');
      
      const runNode = fixture.ast[0] as RunDirectiveNode;
      
      // Set up mocks - command not found
      vi.mocked(resolutionServiceMock.resolveVariableInContext).mockResolvedValue(undefined);
      
      const mockContext: DirectiveProcessingContext = {
        directiveNode: runNode,
        state: stateServiceMock,
        resolutionContext: {} as ResolutionContext,
        executionContext: {},
        formattingContext: undefined
      };
      
      await expect(handler.handle(mockContext)).rejects.toThrow('Undefined command reference: greetCommand');
    });
  });

  describe('output variables', () => {
    it('should use custom output variable names when specified', async () => {
      const fixture = fixtureLoader.getFixture('run-exec');
      if (!fixture) throw new Error('Fixture not found');
      
      // Add custom output variables to the node
      const runNode = fixture.ast[0] as RunDirectiveNode;
      (runNode.values as any).outputVariable = [{ type: 'Text', content: 'myOutput' }];
      (runNode.values as any).errorVariable = [{ type: 'Text', content: 'myError' }];
      
      // Set up mocks
      vi.mocked(resolutionServiceMock.resolveVariableInContext).mockResolvedValue({
        name: 'greetCommand',
        command: 'echo "test"',
        parameters: []
      });
      vi.mocked(fileSystemServiceMock.executeCommand).mockResolvedValue({
        stdout: 'test output',
        stderr: 'test error',
        exitCode: 0
      });
      
      const mockContext: DirectiveProcessingContext = {
        directiveNode: runNode,
        state: stateServiceMock,
        resolutionContext: {} as ResolutionContext,
        executionContext: {},
        formattingContext: undefined
      };
      
      const result = await handler.handle(mockContext);
      
      // Should use custom variable names
      expect(result.stateChanges).toBeDefined();
      expect(result.stateChanges!['myOutput']).toBeDefined();
      expect(result.stateChanges!['myOutput'].value).toBe('test output');
      expect(result.stateChanges!['myError']).toBeDefined();
      expect(result.stateChanges!['myError'].value).toBe('test error');
    });
  });
});