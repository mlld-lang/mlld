import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { TextDirectiveHandler } from '@services/pipeline/DirectiveService/handlers/definition/TextDirectiveHandler';
import { DirectiveError, DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError';
import type { IStateService } from '@services/state/StateService/IStateService';
import type { IResolutionService, ResolutionContext } from '@services/resolution/ResolutionService/IResolutionService';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService';
import type { DirectiveNode, InterpolatableValue, VariableReferenceNode, TextNode } from '@core/syntax/types/nodes';
import type { DirectiveProcessingContext, FormattingContext } from '@core/types/index';
import { VariableType, TextVariable, createTextVariable, VariableDefinition } from '@core/types/variables';
import { VariableMetadata, VariableOrigin } from '@core/types/variables';
import { MeldResolutionError, FieldAccessError, PathValidationError } from '@core/errors';
import { MeldPath } from '@core/types';
import type { ValidatedResourcePath } from '@core/types/paths';
import type { Stats } from 'fs-extra';
import { Field as AstField } from '@core/syntax/types/shared-types';
import type { VariableResolutionTracker, ResolutionTrackingConfig } from '@tests/utils/debug/VariableResolutionTracker/index';
import type { IFileSystem } from '@services/fs/FileSystemService/IFileSystem';
import type { DirectiveResult } from '@core/directives/DirectiveHandler';
import { container, type DependencyContainer } from 'tsyringe';
import { mockDeep, DeepMockProxy } from 'vitest-mock-extended';
import { createDirectiveNode, createLocation } from '@tests/utils/testFactories';
import type { IPathService } from '@services/fs/PathService/IPathService';
import type { IValidationService } from '@services/resolution/ValidationService/IValidationService';
import path from 'path';
import { PathPurpose } from '@core/types/paths';

/**
 * TextDirectiveHandler Command Test Status
 * --------------------------------
 * 
 * MIGRATION STATUS: Complete (Using Manual DI)
 * 
 * This test file has been fully migrated to use:
 * - Manual Child Container pattern
 * - Standardized mock factories with vitest-mock-extended
 */

describe('TextDirectiveHandler - Command Execution', () => {
  let handler: TextDirectiveHandler;
  let testContainer: DependencyContainer;
  let mockValidationService: DeepMockProxy<IValidationService>;
  let mockStateService: DeepMockProxy<IStateService>;
  let mockResolutionService: DeepMockProxy<IResolutionService>;
  let mockFileSystemService: DeepMockProxy<IFileSystemService>;
  let mockPathService: DeepMockProxy<IPathService>;


  beforeEach(async () => {
    testContainer = container.createChildContainer();

    mockValidationService = mockDeep<IValidationService>();
    mockStateService = mockDeep<IStateService>({
      getCurrentFilePath: vi.fn(),
      setVariable: vi.fn(),
    });
    mockResolutionService = mockDeep<IResolutionService>({
      resolveNodes: vi.fn(),
    });
    mockFileSystemService = mockDeep<IFileSystemService>({
      getCwd: vi.fn(),
      executeCommand: vi.fn(),
    });
    mockPathService = mockDeep<IPathService>();

    testContainer.registerInstance<IValidationService>('IValidationService', mockValidationService);
    testContainer.registerInstance<IStateService>('IStateService', mockStateService);
    testContainer.registerInstance<IResolutionService>('IResolutionService', mockResolutionService);
    testContainer.registerInstance<IFileSystemService>('IFileSystemService', mockFileSystemService);
    testContainer.registerInstance<IPathService>('IPathService', mockPathService);
    testContainer.registerInstance('ILogger', { debug: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn() });
    testContainer.registerInstance('DependencyContainer', testContainer);

    testContainer.register(TextDirectiveHandler, { useClass: TextDirectiveHandler });

    handler = testContainer.resolve(TextDirectiveHandler);

    vi.spyOn(mockStateService, 'getCurrentFilePath').mockReturnValue('/test/dir/test.meld');
  });

  afterEach(async () => {
    testContainer?.dispose();
    vi.clearAllMocks();
  });

  const createMockProcessingContext = (node: DirectiveNode): DirectiveProcessingContext => {
    const currentFilePath = mockStateService.getCurrentFilePath() || undefined;
    const resolutionContext: ResolutionContext = {
        state: mockStateService,
        strict: true,
        currentFilePath: currentFilePath,
        depth: 0,
        flags: {
            isVariableEmbed: false,
            isTransformation: false,
            allowRawContentResolution: false,
            isDirectiveHandler: false,
            isImportContext: false,
            processNestedVariables: true,
            preserveUnresolved: false
        },
        pathContext: {
            purpose: PathPurpose.READ,
            baseDir: currentFilePath ? path.dirname(currentFilePath) : '.',
            allowTraversal: false
        },
        withIncreasedDepth: vi.fn().mockReturnThis(),
        withStrictMode: vi.fn().mockReturnThis(),
        withAllowedTypes: vi.fn().mockReturnThis(),
        withFlags: vi.fn().mockReturnThis(),
        withFormattingContext: vi.fn().mockReturnThis(),
        withPathContext: vi.fn().mockReturnThis(),
        withParserFlags: vi.fn().mockReturnThis(),
    };
    return {
        state: mockStateService,
        resolutionContext: resolutionContext,
        formattingContext: { isBlock: false },
        directiveNode: node,
        executionContext: { cwd: '/test/dir' },
    };
  };

  it('should execute command and store its output', async () => {
    const identifier = 'cmdOutput';
    const command = 'echo "Hello Command"';

    const node = createDirectiveNode('text', { 
      identifier: identifier,
      source: 'run',
      value: { 
        run: [{ 
          subtype: 'runCommand',
          command: [{ type: 'Text', content: command, location: createLocation(), nodeId: 'text-node-1' }]
        }]
      }
    }, createLocation());

    const cwd = '/test/dir';
    vi.spyOn(mockFileSystemService, 'getCwd').mockReturnValue(cwd);
    vi.spyOn(mockFileSystemService, 'executeCommand').mockResolvedValue({ stdout: 'Hello Command\n', stderr: '' });
    vi.spyOn(mockResolutionService, 'resolveNodes').mockResolvedValue(command);
    const setVariableSpy = vi.spyOn(mockStateService, 'setVariable');

    const processingContext = createMockProcessingContext(node);
    const result = await handler.handle(processingContext) as DirectiveResult;
    expect(mockFileSystemService.executeCommand).toHaveBeenCalledWith(command, { cwd });
    expect(result.stateChanges).toBeDefined();
    expect(result.stateChanges?.variables).toHaveProperty(identifier);
    const varDef = result.stateChanges?.variables?.[identifier];
    expect(varDef?.type).toBe(VariableType.TEXT);
    expect(varDef?.value).toBe('Hello Command');
  });
  
  it('should handle variable references in command input', async () => {
    const identifier = 'cmdOutputVar';
    const commandTemplateNodes: InterpolatableValue = [
      { type: 'Text', content: 'echo "Input: ', location: createLocation(), nodeId: 'text-node-2' }, 
      { type: 'VariableReference', identifier: 'inputVar', valueType: 'text', location: createLocation(), nodeId: 'var-node-1' },
      { type: 'Text', content: '"', location: createLocation(), nodeId: 'text-node-3' }
    ];
    const resolvedCommand = 'echo "Input: test value"';

    const node = createDirectiveNode('text', {
      identifier: identifier,
      source: 'run',
      value: { 
        run: [{ 
          subtype: 'runCommand', 
          command: commandTemplateNodes
        }]
      }
    }, createLocation());

    const cwd = '/test/dir';
    vi.spyOn(mockFileSystemService, 'getCwd').mockReturnValue(cwd);
    const resolveNodesSpy = vi.spyOn(mockResolutionService, 'resolveNodes').mockResolvedValue(resolvedCommand);
    vi.spyOn(mockFileSystemService, 'executeCommand').mockResolvedValue({ stdout: 'Input: test value\n', stderr: '' });
    const setVariableSpy = vi.spyOn(mockStateService, 'setVariable');

    const processingContext = createMockProcessingContext(node);
    const result = await handler.handle(processingContext) as DirectiveResult;
    expect(resolveNodesSpy).toHaveBeenCalledWith(commandTemplateNodes, expect.anything());
    expect(mockFileSystemService.executeCommand).toHaveBeenCalledWith(resolvedCommand, { cwd });
    expect(result.stateChanges).toBeDefined();
    expect(result.stateChanges?.variables).toHaveProperty(identifier);
    const varDef = result.stateChanges?.variables?.[identifier];
    expect(varDef?.type).toBe(VariableType.TEXT);
    expect(varDef?.value).toBe('Input: test value');
  });
  
  it('should handle special characters in command outputs', async () => {
    const identifier = 'specialOutput';
    const command = 'echo "special chars: \'\"\\`$"';
    const expectedOutput = 'special chars: \'\"\\`$';

    const node = createDirectiveNode('text', {
      identifier: identifier,
      source: 'run',
      value: { 
        run: [{ 
          subtype: 'runCommand', 
          command: [{ type: 'Text', content: command, location: createLocation(), nodeId: 'text-node-4' }]
        }]
      }
    }, createLocation());

    const cwd = '/test/dir';
    vi.spyOn(mockFileSystemService, 'getCwd').mockReturnValue(cwd);
    const resolveNodesSpy = vi.spyOn(mockResolutionService, 'resolveNodes').mockResolvedValue(command);
    vi.spyOn(mockFileSystemService, 'executeCommand').mockResolvedValue({ stdout: `${expectedOutput}\n`, stderr: '' });
    const setVariableSpy = vi.spyOn(mockStateService, 'setVariable');

    const processingContext = createMockProcessingContext(node);
    const result = await handler.handle(processingContext) as DirectiveResult;
    expect(mockFileSystemService.executeCommand).toHaveBeenCalledWith(command, { cwd });
    expect(result.stateChanges).toBeDefined();
    expect(result.stateChanges?.variables).toHaveProperty(identifier);
    const varDef = result.stateChanges?.variables?.[identifier];
    expect(varDef?.type).toBe(VariableType.TEXT);
    expect(varDef?.value).toBe(expectedOutput);
  });
  
  it('should handle multi-line command outputs', async () => {
    const identifier = 'multiLineOutput';
    const command = 'echo "line1\nline2"';
    const expectedOutput = 'line1\nline2';

    const node = createDirectiveNode('text', {
      identifier: identifier,
      source: 'run',
      value: { 
        run: [{ 
          subtype: 'runCommand', 
          command: [{ type: 'Text', content: command, location: createLocation(), nodeId: 'text-node-5' }]
        }]
      }
    }, createLocation());

    const cwd = '/test/dir';
    vi.spyOn(mockFileSystemService, 'getCwd').mockReturnValue(cwd);
    const resolveNodesSpy = vi.spyOn(mockResolutionService, 'resolveNodes').mockResolvedValue(command);
    vi.spyOn(mockFileSystemService, 'executeCommand').mockResolvedValue({ stdout: `${expectedOutput}\n`, stderr: '' });
    const setVariableSpy = vi.spyOn(mockStateService, 'setVariable');

    const processingContext = createMockProcessingContext(node);
    const result = await handler.handle(processingContext) as DirectiveResult;
    expect(mockFileSystemService.executeCommand).toHaveBeenCalledWith(command, { cwd });
    expect(result.stateChanges).toBeDefined();
    expect(result.stateChanges?.variables).toHaveProperty(identifier);
    const varDef = result.stateChanges?.variables?.[identifier];
    expect(varDef?.type).toBe(VariableType.TEXT);
    expect(varDef?.value).toBe(expectedOutput);
  });
  
  it('should handle nested variable references across multiple levels', async () => {
    const identifier = 'cmdOutputNested';
    const commandTemplateNodes: InterpolatableValue = [
      { type: 'Text', content: 'echo "Final: ', location: createLocation(), nodeId: 'text-node-6' },
      { type: 'VariableReference', identifier: 'level2', valueType: 'text', location: createLocation(), nodeId: 'var-node-2' },
      { type: 'Text', content: '"', location: createLocation(), nodeId: 'text-node-7' }
    ];
    const resolvedCommand = 'echo "Final: Level 2 references Level 1 output"';
    const finalOutput = 'Final: Level 2 references Level 1 output';

    const node = createDirectiveNode('text', {
      identifier: identifier,
      source: 'run',
      value: { 
        run: [{ 
          subtype: 'runCommand', 
          command: commandTemplateNodes
        }]
      }
    }, createLocation());

    const cwd = '/test/dir';
    vi.spyOn(mockFileSystemService, 'getCwd').mockReturnValue(cwd);
    const resolveNodesSpy = vi.spyOn(mockResolutionService, 'resolveNodes').mockResolvedValue(resolvedCommand);
    vi.spyOn(mockFileSystemService, 'executeCommand').mockResolvedValue({ stdout: `${finalOutput}\n`, stderr: '' });
    const setVariableSpy = vi.spyOn(mockStateService, 'setVariable');

    const processingContext = createMockProcessingContext(node);
    const result = await handler.handle(processingContext) as DirectiveResult;
    expect(resolveNodesSpy).toHaveBeenCalledWith(commandTemplateNodes, expect.anything());
    expect(mockFileSystemService.executeCommand).toHaveBeenCalledWith(resolvedCommand, { cwd });
    expect(result.stateChanges).toBeDefined();
    expect(result.stateChanges?.variables).toHaveProperty(identifier);
    const varDef = result.stateChanges?.variables?.[identifier];
    expect(varDef?.type).toBe(VariableType.TEXT);
    expect(varDef?.value).toBe(finalOutput);
  });
}); 