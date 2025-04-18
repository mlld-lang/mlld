import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CommandResolver } from '@services/resolution/ResolutionService/resolvers/CommandResolver';
import type { IStateService } from '@services/state/StateService/IStateService';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService';
import type { IParserService } from '@services/pipeline/ParserService/IParserService';
import { 
  VariableType, 
  CommandVariable, 
  IBasicCommandDefinition,
  ICommandParameterMetadata
} from '@core/types';
import { ResolutionContext } from '@core/types/resolution';
import { MeldResolutionError } from '@core/errors/index';
import { ResolutionContextFactory } from '@services/resolution/ResolutionService/ResolutionContextFactory';
import { TestContextDI } from '@tests/utils/di';
import { DeepMockProxy, mockDeep } from 'vitest-mock-extended';
import { expectToThrowWithConfig } from '@tests/utils/ErrorTestUtils';

// Mock logger if CommandResolver uses it
vi.mock('@core/utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

describe('CommandResolver', () => {
  const helpers = TestContextDI.createTestHelpers(); // Define helpers
  let contextDI: TestContextDI;
  let resolver: CommandResolver;
  let stateService: IStateService; // Use interface type
  let fileSystemService: IFileSystemService; // Use interface type
  let parserService: IParserService; // Use interface type
  let context: ResolutionContext;

  const mockSimpleCmdDef: IBasicCommandDefinition = {
    name: 'simple',
    type: 'basic', 
    commandTemplate: 'echo test',
    parameters: [],
    isMultiline: false
  };
  const mockEchoCmdDef: IBasicCommandDefinition = {
    name: 'echo',
    type: 'basic',
    commandTemplate: 'echo {{arg1}} {{arg2}}',
    parameters: [
      { name: 'arg1', position: 0, required: true },
      { name: 'arg2', position: 1, required: false, defaultValue: 'default' }
    ],
    isMultiline: false
  };
  const mockComplexCmdDef: IBasicCommandDefinition = {
    name: 'complex',
    type: 'basic', 
    commandTemplate: 'echo -n "Hello World"',
    parameters: [],
    isMultiline: false
  };

  beforeEach(async () => {
    // Use standard setup with mocks
    contextDI = helpers.setupWithStandardMocks();

    // Resolve mocked services from the container
    stateService = await contextDI.resolve<IStateService>('IStateService');
    fileSystemService = await contextDI.resolve<IFileSystemService>('IFileSystemService');
    parserService = await contextDI.resolve<IParserService>('IParserService');

    // Configure mocks using vi.spyOn for test-specific behavior
    vi.spyOn(stateService, 'getVariable').mockImplementation((name: string, typeHint?: VariableType): CommandVariable | undefined => {
      // Verify the type hint if provided (CommandResolver likely provides it)
      if (typeHint && typeHint !== VariableType.COMMAND) {
        return undefined; // Only return command variables
      }
      
      let definition: IBasicCommandDefinition | undefined;
      if (name === 'simple') definition = mockSimpleCmdDef;
      if (name === 'echo') definition = mockEchoCmdDef;
      if (name === 'complex') definition = mockComplexCmdDef;
      
      if (definition) {
        return { name, type: VariableType.COMMAND, value: definition };
      }
      return undefined;
    });
    
    vi.spyOn(fileSystemService, 'executeCommand').mockResolvedValue({ stdout: '', stderr: '' });
    vi.spyOn(fileSystemService, 'dirname').mockImplementation(p => p ? p.substring(0, p.lastIndexOf('/') || 0) : '');
    vi.spyOn(fileSystemService, 'getCwd').mockReturnValue('/mock/cwd');
    
    vi.spyOn(stateService, 'getCurrentFilePath').mockReturnValue('/mock/dir/test.meld');
    
    // Instantiate CommandResolver directly with resolved mocks
    resolver = new CommandResolver(stateService, fileSystemService, parserService); 

    // Create ResolutionContext
    context = ResolutionContextFactory.create(stateService, 'test.meld')
               .withAllowedTypes([VariableType.COMMAND]); 
  });

  afterEach(async () => {
    await contextDI?.cleanup(); 
  });

  describe('executeBasicCommand', () => {
    it('should execute a simple command with no args', async () => {
      const result = await resolver.executeBasicCommand(mockSimpleCmdDef, [], context);
      
      // Check that the correct command string was executed
      expect(fileSystemService.executeCommand).toHaveBeenCalledWith('echo test', expect.objectContaining({ cwd: '/mock/dir' }));
      // Check that the result is the stdout from the mock
      expect(result).toBe(''); // Default mock stdout is empty
    });
    
    it('should execute a command and substitute required args', async () => {
      // Mock executeCommand to return substituted string for verification
      fileSystemService.executeCommand.mockImplementation(async (cmd) => ({ stdout: cmd, stderr: '' }));
      
      const result = await resolver.executeBasicCommand(mockEchoCmdDef, ['Hello'], context);
      
      // Arg1 required, Arg2 defaults to 'default'
      expect(fileSystemService.executeCommand).toHaveBeenCalledWith('echo Hello default', expect.any(Object));
      expect(result).toBe('echo Hello default');
    });
    
    it('should execute a command and substitute all args', async () => {
      fileSystemService.executeCommand.mockImplementation(async (cmd) => ({ stdout: cmd, stderr: '' }));
      
      const result = await resolver.executeBasicCommand(mockEchoCmdDef, ['Hello', 'World'], context);
      
      // Arg1=Hello, Arg2=World
      expect(fileSystemService.executeCommand).toHaveBeenCalledWith('echo Hello World', expect.any(Object));
      expect(result).toBe('echo Hello World');
    });
    
    it('should calculate cwd from currentFilePath if available', async () => {
      stateService.getCurrentFilePath.mockReturnValue('/my/specific/file.txt');
      fileSystemService.dirname.mockReturnValue('/my/specific');
      
      await resolver.executeBasicCommand(mockSimpleCmdDef, [], context);
      
      expect(fileSystemService.dirname).toHaveBeenCalledWith('/my/specific/file.txt');
      expect(fileSystemService.executeCommand).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ cwd: '/my/specific' }));
    });
    
    it('should calculate cwd from fileSystemService.getCwd if currentFilePath is null', async () => {
      stateService.getCurrentFilePath.mockReturnValue(null);
      fileSystemService.getCwd.mockReturnValue('/system/cwd');
      
      await resolver.executeBasicCommand(mockSimpleCmdDef, [], context);
      
      expect(fileSystemService.getCwd).toHaveBeenCalled();
      expect(fileSystemService.executeCommand).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ cwd: '/system/cwd' }));
    });

    // --- Argument Validation Error Tests --- 
    
    it('should throw MeldResolutionError for too few arguments (strict mode)', async () => {
      const strictContext = context.withStrictMode(true);
      await expectToThrowWithConfig(async () => {
        // mockEchoCmdDef requires 1 arg, providing 0
        await resolver.executeBasicCommand(mockEchoCmdDef, [], strictContext);
      }, {
        type: 'MeldResolutionError',
        code: 'E_RESOLVE_PARAM_MISMATCH_COUNT',
        messageContains: 'Expected at least 1 arguments, but got 0'
      });
    });
    
    it('should return empty string for too few arguments (non-strict mode)', async () => {
      const nonStrictContext = context.withStrictMode(false);
      // mockEchoCmdDef requires 1 arg, providing 0
      const result = await resolver.executeBasicCommand(mockEchoCmdDef, [], nonStrictContext);
      expect(result).toBe('');
      // Should not attempt execution
      expect(fileSystemService.executeCommand).not.toHaveBeenCalled();
    });
    
    it('should throw MeldResolutionError for too many arguments (strict mode)', async () => {
      const strictContext = context.withStrictMode(true);
      await expectToThrowWithConfig(async () => {
        // mockEchoCmdDef allows max 2 args, providing 3
        await resolver.executeBasicCommand(mockEchoCmdDef, ['a', 'b', 'c'], strictContext);
      }, {
        type: 'MeldResolutionError',
        code: 'E_RESOLVE_PARAM_MISMATCH_COUNT',
        messageContains: 'Expected at most 2 arguments, but got 3'
      });
    });
    
    it('should return empty string for too many arguments (non-strict mode)', async () => {
      const nonStrictContext = context.withStrictMode(false);
      // mockEchoCmdDef allows max 2 args, providing 3
      const result = await resolver.executeBasicCommand(mockEchoCmdDef, ['a', 'b', 'c'], nonStrictContext);
      expect(result).toBe('');
      // Should not attempt execution
      expect(fileSystemService.executeCommand).not.toHaveBeenCalled();
    });
    
    // --- Execution Error Tests ---
    
    it('should throw MeldResolutionError on command execution failure (strict mode)', async () => {
      const error = new Error('Command failed!');
      fileSystemService.executeCommand.mockRejectedValue(error);
      const strictContext = context.withStrictMode(true);
      
      await expectToThrowWithConfig(async () => {
        await resolver.executeBasicCommand(mockSimpleCmdDef, [], strictContext);
      }, {
        type: 'MeldResolutionError',
        code: 'E_COMMAND_EXEC_FAILED',
        messageContains: 'Command execution failed: simple'
      });
    });
    
    it('should return empty string on command execution failure (non-strict mode)', async () => {
      fileSystemService.executeCommand.mockRejectedValue(new Error('Command failed!'));
      const nonStrictContext = context.withStrictMode(false);
      
      const result = await resolver.executeBasicCommand(mockSimpleCmdDef, [], nonStrictContext);
      expect(result).toBe('');
    });
    
    it('should throw MeldResolutionError if FileSystemService is missing', async () => {
        // Create resolver without FileSystemService
        const resolverWithoutFS = new CommandResolver(stateService, undefined, parserService); 
        const strictContext = context.withStrictMode(true);
        
        await expectToThrowWithConfig(async () => {
           await resolverWithoutFS.executeBasicCommand(mockSimpleCmdDef, [], strictContext);
        }, {
            type: 'MeldResolutionError',
            code: 'E_SERVICE_UNAVAILABLE',
            messageContains: 'FileSystemService is not available'
        });
    });
  });
}); 