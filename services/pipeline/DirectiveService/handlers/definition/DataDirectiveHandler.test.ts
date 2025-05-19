import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { DataDirectiveHandler } from '@services/pipeline/DirectiveService/handlers/definition/DataDirectiveHandler';
import { createDirectiveNode } from '@tests/utils/testFactories';
// import { TestContextDI } from '@tests/utils/di/TestContextDI'; // Removed
import type { IValidationService } from '@services/resolution/ValidationService/IValidationService';
import type { IStateService } from '@services/state/StateService/IStateService';
import type { IResolutionService, ResolutionContext } from '@services/resolution/ResolutionService/IResolutionService';
import type { DirectiveNode, InterpolatableValue } from '@core/syntax/types/nodes';
import { DirectiveError, DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError';
import { dataDirectiveExamples } from '@core/syntax/index';
// import { MockFactory } from '@tests/utils/mocks/MockFactory'; // Removed
import { isInterpolatableValueArray } from '@core/syntax/types/guards';
import type { DirectiveProcessingContext } from '@core/types/index';
import { JsonValue, VariableType, VariableMetadata, VariableOrigin, createDataVariable, MeldVariable } from '@core/types';
import { MeldResolutionError } from '@core/errors/MeldResolutionError';
import { ErrorSeverity } from '@core/errors/MeldError';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService';
import type { IPathService } from '@services/fs/PathService/IPathService';
import { DirectiveResult, StateChanges } from '@core/directives/DirectiveHandler';
// import { DirectiveTestFixture } from '@tests/utils/fixtures/DirectiveTestFixture'; // Removed
import { expectToThrowWithConfig } from '@tests/utils/ErrorTestUtils';
import { PathPurpose } from '@core/types/paths';
import * as path from 'path';
import type { 
    ResolutionFlags, 
    PathResolutionContext, 
    FormattingContext,
    ParserFlags
 } from '@core/types/resolution';
import { container, type DependencyContainer } from 'tsyringe';
import { mockDeep, DeepMockProxy } from 'vitest-mock-extended';

/**
 * DataDirectiveHandler Test Status
 * --------------------------------
 * 
 * MIGRATION STATUS: Complete (Using Manual DI)
 * 
 * This test file has been migrated to use:
 * - Manual Child Container pattern
 * - Standardized mock factories with vitest-mock-extended
 */

describe('DataDirectiveHandler', () => {
  let handler: DataDirectiveHandler;
  let testContainer: DependencyContainer;
  let mockValidationService: DeepMockProxy<IValidationService>;
  let mockStateService: DeepMockProxy<IStateService>;
  let mockResolutionService: DeepMockProxy<IResolutionService>;
  let mockFileSystemService: DeepMockProxy<IFileSystemService>;
  let mockPathService: DeepMockProxy<IPathService>;

  beforeEach(async () => {
    testContainer = container.createChildContainer();

    // --- Create Mocks ---
    mockValidationService = mockDeep<IValidationService>({
      validate: vi.fn(),
    });
    mockStateService = mockDeep<IStateService>({
      getCurrentFilePath: vi.fn(),
      isTransformationEnabled: vi.fn(),
      setVariable: vi.fn(),
      clone: vi.fn().mockReturnThis(),
      getStateId: vi.fn().mockReturnValue('mock-data-state-id'), 
      getVariable: vi.fn(),
    });
    mockResolutionService = mockDeep<IResolutionService>({
      resolveNodes: vi.fn(),
      resolveInContext: vi.fn(),
      // Add other methods if needed by the handler
    });
    mockFileSystemService = mockDeep<IFileSystemService>({
        executeCommand: vi.fn(),
        readFile: vi.fn(),
        exists: vi.fn(),
    }); 
    mockPathService = mockDeep<IPathService>();

    // --- Register Mocks --- 
    testContainer.registerInstance<IValidationService>('IValidationService', mockValidationService);
    testContainer.registerInstance<IStateService>('IStateService', mockStateService);
    testContainer.registerInstance<IResolutionService>('IResolutionService', mockResolutionService);
    testContainer.registerInstance<IFileSystemService>('IFileSystemService', mockFileSystemService);
    testContainer.registerInstance<IPathService>('IPathService', mockPathService);
    testContainer.registerInstance('ILogger', { debug: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn() });
    testContainer.registerInstance('DependencyContainer', testContainer);

    // --- Register Handler --- 
    testContainer.register(DataDirectiveHandler, { useClass: DataDirectiveHandler });

    // --- Resolve Handler --- 
    handler = testContainer.resolve(DataDirectiveHandler);

    // --- Default Mock Behaviors --- 
    vi.spyOn(mockStateService, 'getCurrentFilePath').mockReturnValue('/test.meld');
    vi.spyOn(mockStateService, 'isTransformationEnabled').mockReturnValue(false);
    vi.spyOn(handler as any, 'resolveInterpolatableValuesInData').mockImplementation(async (v) => v);
    vi.spyOn(mockResolutionService, 'resolveNodes').mockImplementation(async (nodes, ctx) => 
        nodes.map((n: any) => n.content || `{{${n.identifier}}}`).join('')
    );
     vi.spyOn(mockResolutionService, 'resolveInContext').mockImplementation(async (val) => typeof val === 'string' ? val : JSON.stringify(val));
    vi.spyOn(mockFileSystemService, 'executeCommand').mockResolvedValue({ stdout: '', stderr: '' });
    vi.spyOn(mockValidationService, 'validate').mockResolvedValue(undefined);
  });

  afterEach(async () => {
    testContainer?.dispose();
    vi.clearAllMocks();
  });

  const createMockProcessingContext = (node: DirectiveNode): DirectiveProcessingContext => {
    if (!mockStateService) {
        throw new Error("Test setup error: mockStateService is undefined in createMockProcessingContext");
    }
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

  describe('basic data handling', () => {



    it('should handle invalid JSON from run/add', async () => {
      const node = createDirectiveNode('data', { 
        values: {
          identifier: [{ type: 'VariableReference', identifier: 'invalidData' }],
          source: 'run',
          run: { 
            subtype: 'runCommand', 
            command: [{ type: 'Text', content: 'echo { invalid JSON' }] 
          }
        }
      });
      const processingContext = createMockProcessingContext(node);
      vi.spyOn(mockResolutionService, 'resolveNodes').mockResolvedValue('echo { invalid JSON');
      vi.spyOn(mockFileSystemService, 'executeCommand').mockResolvedValue({ stdout: '{ invalid JSON', stderr: '' });
      await expect(handler.handle(processingContext)).rejects.toThrow(/Failed to parse command output as JSON/);
    });


    it.skip('should handle state errors', async () => { /* ... */ });
  });

  describe('variable resolution', () => {
    it('should resolve variables in nested JSON structures', async () => {
      const node = createDirectiveNode('data', { 
        values: {
          identifier: [{ type: 'VariableReference', identifier: 'config' }],
          source: 'literal',
          value: { app: { version: '{{v}}'} }
        }
      });
      const processingContext = createMockProcessingContext(node);
      const expectedResolvedData = { app: { version: '1.0' } };
      vi.spyOn(handler as any, 'resolveInterpolatableValuesInData').mockResolvedValue(expectedResolvedData);
      const result = await handler.handle(processingContext) as DirectiveResult;
      expect(result.stateChanges?.variables).toHaveProperty('config');
      expect(result.stateChanges?.variables?.config?.value).toEqual(expectedResolvedData);
    });

    it('should handle JSON strings containing variable references', async () => {
      const node = createDirectiveNode('data', { 
        values: {
          identifier: [{ type: 'VariableReference', identifier: 'message' }],
          source: 'literal',
          value: 'Hello, {{name}}!'
        }
      });
      const processingContext = createMockProcessingContext(node);
      vi.spyOn(handler as any, 'resolveInterpolatableValuesInData').mockResolvedValue('Hello, Alice!');
      const result = await handler.handle(processingContext) as DirectiveResult;
      expect(result.stateChanges?.variables).toHaveProperty('message');
      const varDef = result.stateChanges?.variables?.message;
      expect(varDef?.type).toBe(VariableType.DATA);
      expect(varDef?.value).toEqual('Hello, Alice!');
    });

    it('should preserve JSON structure when resolving variables', async () => {
      const node = createDirectiveNode('data', { 
        values: {
          identifier: [{ type: 'VariableReference', identifier: 'data' }],
          source: 'literal',
          value: { app: { version: '{{v}}'} }
        }
      });
      const processingContext = createMockProcessingContext(node);
      const expectedResolvedData = { app: { version: '1.0' } };
      vi.spyOn(handler as any, 'resolveInterpolatableValuesInData').mockResolvedValue(expectedResolvedData);
      const result = await handler.handle(processingContext) as DirectiveResult;
      expect(result.stateChanges?.variables).toHaveProperty('data');
      const varDef = result.stateChanges?.variables?.data;
      expect(varDef?.type).toBe(VariableType.DATA);
      expect(varDef?.value).toEqual(expectedResolvedData);
    });
  });
}); 