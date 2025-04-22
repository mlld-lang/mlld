import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CommandResolver } from '@services/resolution/ResolutionService/resolvers/CommandResolver';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
import type { IParserService } from '@services/pipeline/ParserService/IParserService.js';
import { 
  VariableType, 
  CommandVariable, 
  IBasicCommandDefinition,
  ICommandParameterMetadata
} from '@core/types';
import { ResolutionContext } from '@core/types/resolution';
import { MeldResolutionError } from '@core/errors/index';
import { ResolutionContextFactory } from '@services/resolution/ResolutionService/ResolutionContextFactory.js';
import { mockDeep } from 'vitest-mock-extended';
import { expectToThrowWithConfig } from '@tests/utils/ErrorTestUtils';
import { container, type DependencyContainer, injectable } from 'tsyringe'; // Added injectable for mock

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
  let testContainer: DependencyContainer;
  let resolver: CommandResolver;
  let mockStateService: IStateService;
  let mockFileSystemService: IFileSystemService;
  let mockParserService: IParserService;
  let context: ResolutionContext;

  // --- Mock Command Definitions --- 
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
    testContainer = container.createChildContainer();

    // --- Create Manual Mocks --- 
    mockStateService = {
      getVariable: vi.fn(),
      getCurrentFilePath: vi.fn(),
      // Add other methods if needed, mocked to avoid type errors
      setState: vi.fn(),
      getState: vi.fn(),
      getVariableValue: vi.fn(),
      hasVariable: vi.fn(),
      listVariables: vi.fn(),
      stateId: 'mock-state-id',
      variables: { text: new Map(), data: new Map(), path: new Map(), command: new Map() }
    } as unknown as IStateService;

    mockFileSystemService = {
      executeCommand: vi.fn(),
      dirname: vi.fn(),
      getCwd: vi.fn(),
      // Add other methods if needed
      readFile: vi.fn(),
      writeFile: vi.fn(),
      exists: vi.fn(),
      isDirectory: vi.fn(),
      isFile: vi.fn(),
      resolvePath: vi.fn(),
      normalizePath: vi.fn(),
      joinPaths: vi.fn(),
      listDir: vi.fn(),
      watchFiles: vi.fn(() => ({ close: vi.fn() }))
    } as unknown as IFileSystemService;

    // ParserService mock (can be minimal as it's optional and not used in tests)
    mockParserService = {
      parse: vi.fn(),
      parseWithLocations: vi.fn(),
      parseFile: vi.fn(),
      createVariableNode: vi.fn()
    } as unknown as IParserService;

    // --- Configure Mock Implementations --- 
    vi.spyOn(mockStateService, 'getVariable').mockImplementation((name: string, typeHint?: VariableType): CommandVariable | undefined => {
      if (typeHint && typeHint !== VariableType.COMMAND) {
        return undefined;
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
    vi.spyOn(mockFileSystemService, 'executeCommand').mockResolvedValue({ stdout: '', stderr: '' });
    vi.spyOn(mockFileSystemService, 'dirname').mockImplementation(p => p ? p.substring(0, p.lastIndexOf('/') || 0) : '');
    vi.spyOn(mockFileSystemService, 'getCwd').mockReturnValue('/mock/cwd');
    vi.spyOn(mockStateService, 'getCurrentFilePath').mockReturnValue('/mock/dir/test.meld');

    // --- Register Mocks and Real Service --- 
    testContainer.registerInstance<IStateService>('IStateService', mockStateService);
    testContainer.registerInstance<IFileSystemService>('IFileSystemService', mockFileSystemService);
    testContainer.registerInstance<IParserService>('IParserService', mockParserService);
    testContainer.register(CommandResolver, { useClass: CommandResolver });
    
    // --- Resolve Service Under Test --- 
    resolver = testContainer.resolve(CommandResolver);
    
    // --- Create ResolutionContext --- 
    context = ResolutionContextFactory.create(mockStateService, 'test.meld')
               .withAllowedTypes([VariableType.COMMAND]);
  });

  afterEach(async () => {
    testContainer?.dispose();
  });

  describe('executeBasicCommand', () => {
    it('should execute a simple command with no args', async () => {
      const result = await resolver.executeBasicCommand(mockSimpleCmdDef, [], context);
      
      expect(mockFileSystemService.executeCommand).toHaveBeenCalledWith('echo test', expect.objectContaining({ cwd: '/mock/dir' }));
      expect(result).toBe('');
    });
    
    it('should execute a command and substitute required args', async () => {
      vi.spyOn(mockFileSystemService, 'executeCommand').mockImplementation(async (cmd) => ({ stdout: cmd, stderr: '' }));
      
      const result = await resolver.executeBasicCommand(mockEchoCmdDef, ['Hello'], context);
      
      expect(mockFileSystemService.executeCommand).toHaveBeenCalledWith('echo Hello default', expect.any(Object));
      expect(result).toBe('echo Hello default');
    });
    
    it('should execute a command and substitute all args', async () => {
      vi.spyOn(mockFileSystemService, 'executeCommand').mockImplementation(async (cmd) => ({ stdout: cmd, stderr: '' }));
      
      const result = await resolver.executeBasicCommand(mockEchoCmdDef, ['Hello', 'World'], context);
      
      expect(mockFileSystemService.executeCommand).toHaveBeenCalledWith('echo Hello World', expect.any(Object));
      expect(result).toBe('echo Hello World');
    });
    
    it('should calculate cwd from currentFilePath if available', async () => {
      vi.spyOn(mockStateService, 'getCurrentFilePath').mockReturnValue('/my/specific/file.txt');
      vi.spyOn(mockFileSystemService, 'dirname').mockReturnValue('/my/specific');
      
      await resolver.executeBasicCommand(mockSimpleCmdDef, [], context);
      
      expect(mockFileSystemService.dirname).toHaveBeenCalledWith('/my/specific/file.txt');
      expect(mockFileSystemService.executeCommand).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ cwd: '/my/specific' }));
    });
    
    it('should calculate cwd from fileSystemService.getCwd if currentFilePath is null', async () => {
      vi.spyOn(mockStateService, 'getCurrentFilePath').mockReturnValue(null);
      vi.spyOn(mockFileSystemService, 'getCwd').mockReturnValue('/system/cwd');
      
      await resolver.executeBasicCommand(mockSimpleCmdDef, [], context);
      
      expect(mockFileSystemService.getCwd).toHaveBeenCalled();
      expect(mockFileSystemService.executeCommand).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ cwd: '/system/cwd' }));
    });

    // --- Argument Validation Error Tests --- 
    
    it('should throw MeldResolutionError for too few arguments (strict mode)', async () => {
      const strictContext = context.withStrictMode(true);
      await expectToThrowWithConfig(async () => {
        await resolver.executeBasicCommand(mockEchoCmdDef, [], strictContext);
      }, {
        type: 'MeldResolutionError',
        code: 'E_RESOLVE_PARAM_MISMATCH_COUNT',
        messageContains: 'Expected at least 1 arguments, but got 0'
      });
    });
    
    it('should return empty string for too few arguments (non-strict mode)', async () => {
      const nonStrictContext = context.withStrictMode(false);
      const result = await resolver.executeBasicCommand(mockEchoCmdDef, [], nonStrictContext);
      expect(result).toBe('');
      expect(mockFileSystemService.executeCommand).not.toHaveBeenCalled();
    });
    
    it('should throw MeldResolutionError for too many arguments (strict mode)', async () => {
      const strictContext = context.withStrictMode(true);
      await expectToThrowWithConfig(async () => {
        await resolver.executeBasicCommand(mockEchoCmdDef, ['a', 'b', 'c'], strictContext);
      }, {
        type: 'MeldResolutionError',
        code: 'E_RESOLVE_PARAM_MISMATCH_COUNT',
        messageContains: 'Expected at most 2 arguments, but got 3'
      });
    });
    
    it('should return empty string for too many arguments (non-strict mode)', async () => {
      const nonStrictContext = context.withStrictMode(false);
      const result = await resolver.executeBasicCommand(mockEchoCmdDef, ['a', 'b', 'c'], nonStrictContext);
      expect(result).toBe('');
      expect(mockFileSystemService.executeCommand).not.toHaveBeenCalled();
    });
    
    // --- Execution Error Tests ---
    
    it('should throw MeldResolutionError on command execution failure (strict mode)', async () => {
      const error = new Error('Command failed!');
      vi.spyOn(mockFileSystemService, 'executeCommand').mockRejectedValue(error);
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
      vi.spyOn(mockFileSystemService, 'executeCommand').mockRejectedValue(new Error('Command failed!'));
      const nonStrictContext = context.withStrictMode(false);
      
      const result = await resolver.executeBasicCommand(mockSimpleCmdDef, [], nonStrictContext);
      expect(result).toBe('');
    });
    
    it('should throw MeldResolutionError if FileSystemService is missing when called', async () => {
        // Manually instantiate resolver with undefined for optional dependencies
        // This directly tests the internal check without complex DI resolution for optional deps
        const resolverWithoutFS = new CommandResolver(
            mockStateService, 
            undefined, // Explicitly pass undefined for fileSystemService
            mockParserService // Pass the mock parser service (or undefined if that's the test case)
        );
        const strictContext = context.withStrictMode(true);
        
        await expectToThrowWithConfig(async () => {
           await resolverWithoutFS.executeBasicCommand(mockSimpleCmdDef, [], strictContext);
        }, {
            type: 'MeldResolutionError',
            code: 'E_SERVICE_UNAVAILABLE',
            messageContains: 'FileSystemService is not available'
        });
        
        // No need to dispose a separate container here
    });
  });
}); 