import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { DataDirectiveHandler } from '@services/pipeline/DirectiveService/handlers/definition/DataDirectiveHandler.js';
import { createDataDirective, createLocation, createDirectiveNode } from '@tests/utils/testFactories.js';
// import { TestContextDI } from '@tests/utils/di/TestContextDI.js'; // Removed
import type { IValidationService } from '@services/resolution/ValidationService/IValidationService.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { IResolutionService, ResolutionContext } from '@services/resolution/ResolutionService/IResolutionService.js';
import type { DirectiveNode, InterpolatableValue } from '@core/syntax/types/nodes.js';
import { DirectiveError, DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import { dataDirectiveExamples } from '@core/syntax/index.js';
// import { MockFactory } from '@tests/utils/mocks/MockFactory.js'; // Removed
import { isInterpolatableValueArray } from '@core/syntax/types/guards.js';
import type { DirectiveProcessingContext } from '@core/types/index.js';
import { JsonValue, VariableType, VariableMetadata, VariableOrigin, createDataVariable, MeldVariable } from '@core/types';
import { MeldResolutionError } from '@core/errors/MeldResolutionError.js';
import { ErrorSeverity } from '@core/errors/MeldError.js';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
import type { IPathService } from '@services/fs/PathService/IPathService.js';
import { DirectiveResult, StateChanges } from '@core/directives/DirectiveHandler';
// import { DirectiveTestFixture } from '@tests/utils/fixtures/DirectiveTestFixture.js'; // Removed
import { expectToThrowWithConfig } from '@tests/utils/ErrorTestUtils.js';
import { PathPurpose } from '@core/types/paths.js';
import * as path from 'path';
import type { 
    ResolutionFlags, 
    PathResolutionContext, 
    FormattingContext,
    ParserFlags
 } from '@core/types/resolution.js';
import { container, type DependencyContainer } from 'tsyringe'; // Added
import { mockDeep, DeepMockProxy } from 'vitest-mock-extended'; // Added

/**
 * DataDirectiveHandler Test Status
 * --------------------------------
 * 
 * MIGRATION STATUS: In Progress (Refactoring to Manual DI)
 * 
 * This test file is being migrated to use:
 * - Manual Child Container pattern
 * - Standardized mock factories with vitest-mock-extended
 */

describe('DataDirectiveHandler', () => {
  // Remove fixture usage
  // let fixture: DirectiveTestFixture;
  let handler: DataDirectiveHandler;
  let testContainer: DependencyContainer;
  // Declare mocks for dependencies
  let mockValidationService: DeepMockProxy<IValidationService>;
  let mockStateService: DeepMockProxy<IStateService>;
  let mockResolutionService: DeepMockProxy<IResolutionService>;
  let mockFileSystemService: DeepMockProxy<IFileSystemService>;
  let mockPathService: DeepMockProxy<IPathService>;

  beforeEach(async () => {
    // fixture = await DirectiveTestFixture.create(); // Removed
    testContainer = container.createChildContainer(); // Create child container

    // --- Create Mocks ---
    mockValidationService = mockDeep<IValidationService>({
      validate: vi.fn(),
    });
    mockStateService = mockDeep<IStateService>({
      getCurrentFilePath: vi.fn(),
      isTransformationEnabled: vi.fn(),
      setVariable: vi.fn(),
      clone: vi.fn().mockReturnThis(), // Basic mock for clone
      // Add other methods if needed by handler or context creation
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
        // Add other methods if needed
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
    // Mock logger if needed by handler
    testContainer.registerInstance('ILogger', { debug: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn() });
    testContainer.registerInstance('DependencyContainer', testContainer);

    // --- Register Handler --- 
    testContainer.register(DataDirectiveHandler, { useClass: DataDirectiveHandler });

    // --- Resolve Handler --- 
    handler = testContainer.resolve(DataDirectiveHandler);
    // handler = await fixture.context.resolve(DataDirectiveHandler); // Removed
    // fixture.handler = handler; // Removed

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
    // await fixture?.cleanup(); // Removed
    testContainer?.dispose(); // Added
    vi.clearAllMocks();
  });

  const createMockProcessingContext = (node: DirectiveNode): DirectiveProcessingContext => {
    // Use manually created mocks instead of fixture
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
    it('should process simple JSON data', async () => {
      const node = createDataDirective('user', { 'name': 'Alice', 'id': 123 }, createLocation());
      const processingContext = createMockProcessingContext(node);
      vi.spyOn(handler as any, 'resolveInterpolatableValuesInData').mockResolvedValue({ name: 'Alice', id: 123 });
      const result = await handler.handle(processingContext) as DirectiveResult;
      expect(result.stateChanges?.variables).toHaveProperty('user');
      const varDef = result.stateChanges?.variables?.user;
      expect(varDef?.type).toBe(VariableType.DATA);
      expect(varDef?.value).toEqual({ name: 'Alice', id: 123 });
    });

    it('should handle nested JSON objects', async () => {
      const node = createDataDirective('person', { name: 'John Doe', age: 30, address: { street: '123 Main St', city: 'Anytown' } });
      const processingContext = createMockProcessingContext(node);
      const expectedData = { name: 'John Doe', age: 30, address: { street: '123 Main St', city: 'Anytown' } };
      vi.spyOn(handler as any, 'resolveInterpolatableValuesInData').mockResolvedValue(expectedData);
      const result = await handler.handle(processingContext) as DirectiveResult;
      expect(result.stateChanges?.variables).toHaveProperty('person');
      const varDef = result.stateChanges?.variables?.person;
      expect(varDef?.type).toBe(VariableType.DATA);
      expect(varDef?.value).toEqual(expectedData);
    });

    it('should handle JSON arrays', async () => {
      const node = createDataDirective('fruits', ['apple', 'banana', 'cherry']);
      const processingContext = createMockProcessingContext(node);
      const expectedData = ['apple', 'banana', 'cherry'];
      vi.spyOn(handler as any, 'resolveInterpolatableValuesInData').mockResolvedValue(expectedData);
      const result = await handler.handle(processingContext) as DirectiveResult;
      expect(result.stateChanges?.variables).toHaveProperty('fruits');
      const varDef = result.stateChanges?.variables?.fruits;
      expect(varDef?.type).toBe(VariableType.DATA);
      expect(varDef?.value).toEqual(expectedData);
    });

    it('should handle invalid JSON from run/embed', async () => {
      const node = createDirectiveNode('data', { identifier: 'invalidData', source: 'run', run: { subtype: 'runCommand', command: [{ type: 'Text', content: 'echo { invalid JSON' }] } });
      const processingContext = createMockProcessingContext(node);
      vi.spyOn(mockResolutionService, 'resolveNodes').mockResolvedValue('echo { invalid JSON');
      vi.spyOn(mockFileSystemService, 'executeCommand').mockResolvedValue({ stdout: '{ invalid JSON', stderr: '' });
      await expect(handler.handle(processingContext)).rejects.toThrow(/Failed to parse command output as JSON/);
    });

    it('should handle resolution errors', async () => {
      const node = createDataDirective('user', { name: '{{missing}}' });
      const processingContext = createMockProcessingContext(node);
      const resolutionError = new MeldResolutionError('Var missing', { code: 'VAR_NOT_FOUND' });
      vi.spyOn(handler as any, 'resolveInterpolatableValuesInData').mockRejectedValue(resolutionError);
      await expect(handler.handle(processingContext)).rejects.toThrow(DirectiveError);
    });

    it.skip('should handle state errors', async () => { /* ... */ });
  });

  describe('variable resolution', () => {
    it('should resolve variables in nested JSON structures', async () => {
      const node = createDataDirective('config', { app: { version: '{{v}}'} });
      const processingContext = createMockProcessingContext(node);
      const expectedResolvedData = { app: { version: '1.0' } };
      vi.spyOn(handler as any, 'resolveInterpolatableValuesInData').mockResolvedValue(expectedResolvedData);
      const result = await handler.handle(processingContext) as DirectiveResult;
      expect(result.stateChanges?.variables).toHaveProperty('config');
      expect(result.stateChanges?.variables?.config?.value).toEqual(expectedResolvedData);
    });

    it('should handle JSON strings containing variable references', async () => {
      const node = createDataDirective('message', 'Hello, {{name}}!', createLocation());
      const processingContext = createMockProcessingContext(node);
      vi.spyOn(handler as any, 'resolveInterpolatableValuesInData').mockResolvedValue('Hello, Alice!');
      const result = await handler.handle(processingContext) as DirectiveResult;
      expect(result.stateChanges?.variables).toHaveProperty('message');
      const varDef = result.stateChanges?.variables?.message;
      expect(varDef?.type).toBe(VariableType.DATA);
      expect(varDef?.value).toEqual('Hello, Alice!');
    });

    it('should preserve JSON structure when resolving variables', async () => {
      const node = createDataDirective('data', { app: { version: '{{v}}'} });
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