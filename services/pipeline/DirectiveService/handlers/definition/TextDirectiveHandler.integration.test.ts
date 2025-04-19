import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { TextDirectiveHandler } from '@services/pipeline/DirectiveService/handlers/definition/TextDirectiveHandler.js';
import { DirectiveError, DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import { ResolutionError } from '@services/resolution/ResolutionService/errors/ResolutionError.js';
import type { DirectiveNode, InterpolatableValue, VariableReferenceNode, TextNode, StructuredPath } from '@core/syntax/types/nodes.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import { ErrorCollector } from '@tests/utils/ErrorTestUtils.js';
import { ErrorSeverity, MeldError } from '@core/errors/MeldError.js';
import { createLocation } from '@tests/utils/testFactories.js';
import type { ResolutionContext } from '@services/resolution/ResolutionService/IResolutionService.js';
import { mock } from 'vitest-mock-extended';
import type { DirectiveProcessingContext, FormattingContext } from '@core/types/index.js';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
import { DirectiveTestFixture } from '@tests/utils/fixtures/DirectiveTestFixture.js';
import { DirectiveResult } from '@core/directives/DirectiveHandler';
import { VariableDefinition } from '@core/types/variables.js';

/**
 * TextDirectiveHandler Integration Test Status
 * --------------------------------
 * 
 * MIGRATION STATUS: Complete
 * 
 * This test file has been fully migrated to use:
 * - TestContextDI for container management
 * - Standardized mock factories with vitest-mock-extended
 */

describe('TextDirectiveHandler Integration', () => {
  let fixture: DirectiveTestFixture;
  let handler: TextDirectiveHandler;
  let mockProcessingContext: Partial<DirectiveProcessingContext>;

  beforeEach(async () => {
    fixture = await DirectiveTestFixture.create();
    handler = await fixture.context.resolve(TextDirectiveHandler);
    fixture.handler = handler;

    vi.spyOn(fixture.validationService, 'validate').mockResolvedValue(undefined);
    vi.spyOn(fixture.stateService, 'getCurrentFilePath').mockReturnValue('test.meld');

    vi.spyOn(fixture.resolutionService, 'resolveNodes').mockImplementation(async (nodes: InterpolatableValue, context: ResolutionContext): Promise<string> => {
        let result = '';
        for (const node of nodes) {
            if (node.type === 'Text') result += node.content;
            else if (node.type === 'VariableReference') {
                if (node.identifier === 'user' && node.fields?.[0]?.value === 'name') result += 'Alice';
                else if (node.identifier === 'user') result += 'Alice';
                else if (node.identifier === 'prefix') result += 'Hello';
                else if (node.identifier === 'name') result += 'World';
                else if (node.identifier === 'suffix') result += '!';
                else if (node.identifier === 'ENV_HOST') result += process.env.ENV_HOST || 'localhost';
                else if (node.identifier === 'ENV_PORT') result += process.env.ENV_PORT || '3000';
                else result += `{{UNKNOWN: ${node.identifier}}}`;
            }
        }
        return result;
    });

    mockProcessingContext = {
        state: fixture.stateService,
        directiveNode: undefined as any,
    };
  });

  afterEach(async () => {
    await fixture?.cleanup();
  });

  describe('complex scenarios', () => {
    it('should handle nested variable references', async () => {
      const node: DirectiveNode = {
        type: 'Directive',
        location: createLocation(1, 1),
        directive: {
          kind: 'text',
          identifier: 'greeting',
          value: [
            { type: 'Text', content: 'Hello ', location: createLocation(1, 1) }, 
            { type: 'VariableReference', identifier: 'user', fields: [
              { type: 'field', value: 'name' }
            ], location: createLocation(1, 7), valueType: 'text', isVariableReference: true } as VariableReferenceNode,
            { type: 'Text', content: '!', location: createLocation(1, 20) }
          ]
        }
      };
      mockProcessingContext.directiveNode = node;

      const result = await fixture.executeHandler(node, {}, mockProcessingContext) as DirectiveResult;
      
      expect(result.stateChanges).toBeDefined();
      expect(result.stateChanges?.variables).toHaveProperty('greeting');
      const varDef = result.stateChanges?.variables?.greeting as VariableDefinition | undefined;
      expect(varDef?.type).toBe(VariableType.TEXT);
      expect(varDef?.value).toBe('Hello Alice!');
    });

    it('should handle mixed string literals and variables', async () => {
      const node: DirectiveNode = {
        type: 'Directive',
        location: createLocation(2, 1),
        directive: {
          kind: 'text',
          identifier: 'message',
          value: [
            { type: 'VariableReference', identifier: 'prefix', location: createLocation(2, 1), valueType: 'text', isVariableReference: true } as VariableReferenceNode, 
            { type: 'Text', content: ' "quoted ', location: createLocation(2, 10) }, 
            { type: 'VariableReference', identifier: 'name', location: createLocation(2, 20), valueType: 'text', isVariableReference: true } as VariableReferenceNode, 
            { type: 'Text', content: '" ', location: createLocation(2, 25) }, 
            { type: 'VariableReference', identifier: 'suffix', location: createLocation(2, 28), valueType: 'text', isVariableReference: true } as VariableReferenceNode
          ]
        }
      };
      mockProcessingContext.directiveNode = node;

      const result = await fixture.executeHandler(node, {}, mockProcessingContext) as DirectiveResult;
      expect(result.stateChanges).toBeDefined();
      expect(result.stateChanges?.variables).toHaveProperty('message');
      const varDef = result.stateChanges?.variables?.message as VariableDefinition | undefined;
      expect(varDef?.type).toBe(VariableType.TEXT);
      expect(varDef?.value).toBe('Hello "quoted World" !');
    });

    it('should handle complex data structure access', async () => {
      const node: DirectiveNode = {
        type: 'Directive',
        location: createLocation(3, 1),
        directive: {
          kind: 'text',
          identifier: 'userInfo',
          value: [
            { type: 'VariableReference', identifier: 'user', fields: [
              { type: 'field', value: 'contacts' }, 
              { type: 'index', value: 1 },
              { type: 'field', value: 'email' }
            ], location: createLocation(3, 1), valueType: 'data', isVariableReference: true } as VariableReferenceNode
          ]
        }
      };
      mockProcessingContext.directiveNode = node;

      vi.spyOn(fixture.resolutionService, 'resolveNodes').mockResolvedValue('Alice');

      const result = await fixture.executeHandler(node, {}, mockProcessingContext) as DirectiveResult;
      expect(result.stateChanges).toBeDefined();
      expect(result.stateChanges?.variables).toHaveProperty('userInfo');
      const varDef = result.stateChanges?.variables?.userInfo as VariableDefinition | undefined;
      expect(varDef?.type).toBe(VariableType.TEXT);
      expect(varDef?.value).toBe('Alice');
    });

    it('should handle environment variables with fallbacks', async () => {
      const node: DirectiveNode = {
        type: 'Directive',
        location: createLocation(4, 1),
        directive: {
          kind: 'text',
          identifier: 'config',
          value: [
            { type: 'VariableReference', identifier: 'ENV_HOST', fallback: 'localhost', location: createLocation(4, 1), valueType: 'text', isVariableReference: true } as VariableReferenceNode,
            { type: 'Text', content: ':', location: createLocation(4, 20) },
            { type: 'VariableReference', identifier: 'ENV_PORT', fallback: '3000', location: createLocation(4, 21), valueType: 'text', isVariableReference: true } as VariableReferenceNode
          ]
        }
      };
      mockProcessingContext.directiveNode = node;
      
      process.env.ENV_HOST = 'example.com';

      vi.spyOn(fixture.resolutionService, 'resolveNodes').mockResolvedValue('example.com:3000');

      const result = await fixture.executeHandler(node, {}, mockProcessingContext) as DirectiveResult;
      expect(result.stateChanges).toBeDefined();
      expect(result.stateChanges?.variables).toHaveProperty('config');
      const varDef = result.stateChanges?.variables?.config as VariableDefinition | undefined;
      expect(varDef?.type).toBe(VariableType.TEXT);
      expect(varDef?.value).toBe('example.com:3000');
      delete process.env.ENV_HOST;
    });

    it.todo('should handle circular reference detection - Complex error handling deferred for V1');

    it.todo('should handle error propagation through the stack - Complex error propagation deferred for V1');

    it('should handle validation errors with proper context', async () => {
      const node: DirectiveNode = {
        type: 'Directive',
        location: createLocation(5, 1),
        directive: {
          kind: 'text',
          identifier: 'invalid',
          value: null as any
        },
      };
      const testFilePath = 'test.meld';
      vi.spyOn(fixture.stateService, 'getCurrentFilePath').mockReturnValue(testFilePath);
      
      mockProcessingContext.directiveNode = node;
      mockProcessingContext.state = fixture.stateService;

      const validationError = new Error('Validation failed for test');
      vi.spyOn(fixture.validationService, 'validate').mockRejectedValueOnce(validationError);

      const errorCollector = new ErrorCollector();
      let thrownError: any;
      
      try {
          await fixture.executeHandler(node, {}, mockProcessingContext);
      } catch (error) {
          thrownError = error;
      }
      
      expect(thrownError).toBeDefined();
      expect(thrownError).toBeInstanceOf(DirectiveError);

      expect(thrownError.details).toBeDefined(); 
      expect(thrownError.details?.node).toBe(node); 
      expect(thrownError.details?.node?.location?.start?.line).toBe(5); 
      expect(thrownError.details?.context).toBeDefined();
      expect(thrownError.details?.context?.state).toBe(fixture.stateService);
      expect(thrownError.details?.context?.state?.getCurrentFilePath()).toBe(testFilePath);
    });

    it.todo('should handle mixed directive types - Complex directive interaction deferred for V1');
  });
}); 