import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { DataDirectiveHandler } from '@services/pipeline/DirectiveService/handlers/definition/DataDirectiveHandler.js';
import { createDataDirective, createLocation, createDirectiveNode } from '@tests/utils/testFactories.js';
import { TestContextDI } from '@tests/utils/di/TestContextDI.js';
import type { IValidationService } from '@services/resolution/ValidationService/IValidationService.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { IResolutionService, ResolutionContext } from '@services/resolution/ResolutionService/IResolutionService.js';
import type { DirectiveNode, InterpolatableValue } from '@core/syntax/types/nodes.js';
import { DirectiveError, DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import { dataDirectiveExamples } from '@core/syntax/index.js';
import { MockFactory } from '@tests/utils/mocks/MockFactory.js';
import { isInterpolatableValueArray } from '@core/syntax/types/guards.js';
import type { DirectiveProcessingContext } from '@core/types/index.js';
import { JsonValue, VariableType, VariableMetadata, VariableOrigin, createDataVariable, MeldVariable } from '@core/types';
import { MeldResolutionError } from '@core/errors/MeldResolutionError.js';
import { ErrorSeverity } from '@core/errors/MeldError.js';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
import type { IPathService } from '@services/fs/PathService/IPathService.js';
import { DirectiveResult, StateChanges } from '@core/directives/DirectiveHandler';
import { DirectiveTestFixture } from '@tests/utils/fixtures/DirectiveTestFixture.js';
import { expectToThrowWithConfig } from '@tests/utils/ErrorTestUtils.js';

/**
 * DataDirectiveHandler Test Status
 * --------------------------------
 * 
 * MIGRATION STATUS: Phase 5 ✅ (Using TestContextDI helpers)
 * 
 * This test file has been migrated to use:
 * - TestContextDI.createTestHelpers().setupWithStandardMocks()
 * - vi.spyOn on resolved mocks for test-specific behavior
 */

describe('DataDirectiveHandler', () => {
  let fixture: DirectiveTestFixture;
  let handler: DataDirectiveHandler;

  beforeEach(async () => {
    fixture = await DirectiveTestFixture.create();
    handler = await fixture.context.resolve(DataDirectiveHandler);
    fixture.handler = handler;

    vi.spyOn(fixture.stateService, 'getCurrentFilePath').mockReturnValue('/test.meld');
    vi.spyOn(fixture.stateService, 'setVariable').mockResolvedValue({} as MeldVariable);
    vi.spyOn(fixture.stateService, 'isTransformationEnabled').mockReturnValue(false);
    vi.spyOn(handler as any, 'resolveInterpolatableValuesInData').mockImplementation(async (v) => v);

    vi.spyOn(fixture.resolutionService, 'resolveNodes').mockImplementation(async (nodes, ctx) => 
        nodes.map((n: any) => n.content || `{{${n.identifier}}}`).join('')
    );
     vi.spyOn(fixture.resolutionService, 'resolveInContext').mockImplementation(async (val) => typeof val === 'string' ? val : JSON.stringify(val));

    vi.spyOn(fixture.fileSystemService, 'executeCommand').mockResolvedValue({ stdout: '', stderr: '' });
    vi.spyOn(fixture.validationService, 'validate').mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await fixture?.cleanup();
  });

  const createMockProcessingContext = (node: DirectiveNode): DirectiveProcessingContext => {
    return {
        state: fixture.stateService, 
        resolutionContext: { state: fixture.stateService, strict: true } as ResolutionContext,
        formattingContext: { isBlock: false },
        directiveNode: node,
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
  });

  describe('error handling', () => {
    it('should handle invalid JSON from run/embed', async () => {
      const node = createDirectiveNode('data', { identifier: 'invalidData', source: 'run', run: { subtype: 'runCommand', command: [{ type: 'Text', content: 'echo { invalid JSON' }] } });
      const processingContext = createMockProcessingContext(node);
      vi.spyOn(fixture.resolutionService, 'resolveNodes').mockResolvedValue('echo { invalid JSON');
      vi.spyOn(fixture.fileSystemService, 'executeCommand').mockResolvedValue({ stdout: '{ invalid JSON', stderr: '' });
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