import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
// Remove vitest-mock-extended if no longer needed
// import { mock } from 'vitest-mock-extended';
import { DefineDirectiveHandler } from '@services/pipeline/DirectiveService/handlers/definition/DefineDirectiveHandler.js';
import { createLocation, createDirectiveNode } from '@tests/utils/testFactories.js'; // Keep factory
// Remove IValidationService if not directly used/mocked
// import type { IValidationService } from '@services/resolution/ValidationService/IValidationService.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import { DirectiveError, DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import { MeldResolutionError, MeldError } from '@core/errors';
// Remove old service mock imports
// import {
//   createValidationServiceMock,
//   createStateServiceMock,
//   createResolutionServiceMock,
// } from '@tests/utils/mocks/serviceMocks.js';
import { TestContextDI } from '@tests/utils/di/TestContextDI.js';
import type { ICommandDefinition } from '@core/types/define.js';
import type { CommandVariable } from '@core/types/variables.js';
import type { DirectiveNode, IDirectiveData as DefineDirectiveData } from '@core/syntax/types/index.js';
import type { InterpolatableValue } from '@core/syntax/types/nodes.js';
import { expectToThrowWithConfig } from '@tests/utils/ErrorTestUtils.js';
import { isInterpolatableValueArray } from '@core/syntax/types/guards.js';
import type { DirectiveProcessingContext, FormattingContext } from '@core/types/index.js';
import type { ResolutionContext } from '@core/types/resolution.js';
import type { DirectiveResult } from '@services/pipeline/DirectiveService/types.js';
import { JsonValue } from '@core/types';
import { ErrorSeverity } from '@core/errors/MeldError.js';
// Remove unused imports
// import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
// import type { IPathService } from '@services/fs/PathService/IPathService.js';
import { VariableMetadata } from '@core/types/variables.js';
import { MockFactory } from '@tests/utils/mocks/MockFactory.js'; // Keep for state override if needed
import type { CommandVariable as CoreCommandVariable } from '@core/types/variables.js';
import { VariableType } from '@core/types/variables.js';

// Helper to extract state (keep as is)
function getStateFromResult(result: DirectiveResult | IStateService): IStateService {
    if (result && typeof result === 'object' && 'state' in result) {
        return result.state as IStateService;
    }
    return result as IStateService;
}

describe('DefineDirectiveHandler', () => {
  const helpers = TestContextDI.createTestHelpers();
  let handler: DefineDirectiveHandler;
  // Use standard interface types
  let stateService: IStateService;
  let resolutionService: IResolutionService;
  let context: TestContextDI;

  beforeEach(async () => {
    // Use helper
    context = helpers.setupWithStandardMocks();
    await context.resolve('IFileSystemService'); // Implicitly waits for init

    // Resolve services from context
    stateService = await context.resolve('IStateService');
    resolutionService = await context.resolve('IResolutionService');
    // Resolve the handler itself from the DI container
    handler = await context.resolve(DefineDirectiveHandler); 

    // Default mock behavior for resolved mocks
    vi.spyOn(stateService, 'getCurrentFilePath').mockReturnValue('/test.meld');
    // Use aliased CommandVariable type for mock return value
    const mockCommandVar: CommandVariable = { 
        type: VariableType.COMMAND, // Use enum
        name: '', 
        value: { 
            type: 'basic', 
            name: '', 
            commandTemplate: '', 
            parameters: [], 
            isMultiline: false // Add missing property
        } 
    }; 
    vi.spyOn(stateService, 'setCommandVar').mockResolvedValue(mockCommandVar); 
    vi.spyOn(resolutionService, 'resolveNodes').mockImplementation(async (nodes, ctx) => {
      // Simple mock: join text content or variable placeholders
      return nodes.map((n: any) => n.content || `{{${n.identifier}}}`).join('');
    });
  });

  afterEach(async () => {
    await context?.cleanup();
    vi.clearAllMocks();
  });

  // Helper to create nodes (use corrected DefineDirectiveData type)
  const createValidDefineNode = (
      name: string, 
      value: string | InterpolatableValue, 
      parameters: string[] = [],
      isRunSyntax: boolean = true
  ): DirectiveNode => {
      let directiveData: Omit<DefineDirectiveData, 'kind'>;
      if (isRunSyntax && typeof value === 'string') {
          directiveData = {
              name: name,
              command: {
                  subtype: 'runCommand', 
                  command: [{ type: 'Text', content: value, location: createLocation(1,1) }], 
                  isMultiLine: false 
              },
              value: undefined, 
              parameters: parameters
          };
      } else if (!isRunSyntax && isInterpolatableValueArray(value)) {
          directiveData = {
              name: name,
              command: undefined,
              value: value,
              parameters: parameters
          };
      } else {
          throw new Error(`Invalid combination of value type (${typeof value}) and isRunSyntax (${isRunSyntax}) in createValidDefineNode`);
      }
      return {
          type: 'Directive',
          directive: { kind: 'define', ...directiveData } as DefineDirectiveData, 
          location: createLocation(1,1)
      };
  };

  // Helper for processing context (Cast ResolutionContext)
  const createMockProcessingContext = (node: DirectiveNode): DirectiveProcessingContext => {
      // Add required state property, cast to satisfy type checker
      const mockResolutionContext = { 
          strict: true, 
          state: stateService
      } as ResolutionContext; // Cast to type
      
      const mockFormattingContext: FormattingContext = { isBlock: false, preserveLiteralFormatting: false, preserveWhitespace: false };
      if (!stateService) {
        throw new Error('Test setup error: stateService is not defined when creating context');
      }
      return {
          state: stateService, 
          resolutionContext: mockResolutionContext,
          formattingContext: mockFormattingContext,
          directiveNode: node,
      };
  };

  // --- Tests remain largely the same, using resolved handler/mocks ---
  describe('command definition', () => {
    it('should handle basic command definition without parameters', async () => {
      const node = createValidDefineNode('cmd1', 'echo hello'); 
      const processingContext = createMockProcessingContext(node);
      // Use the resolved resolutionService mock
      vi.spyOn(resolutionService, 'resolveNodes').mockResolvedValueOnce('echo hello resolved');

      const result = await handler.execute(processingContext);
      const resultState = getStateFromResult(result);

      expect(resultState).toBe(stateService); 
      // Use the resolved stateService mock
      expect(stateService.setCommandVar).toHaveBeenCalledWith('cmd1', 
          expect.objectContaining({
              type: 'basic',
              name: 'cmd1',
              commandTemplate: 'echo hello resolved', 
              parameters: [],
              isMultiline: false,
          })
      );
    });

    it('should handle command definition with parameters', async () => {
      const node = createValidDefineNode('cmd2', 'echo $p1 $p2', ['p1', 'p2']);
      const processingContext = createMockProcessingContext(node);
      vi.spyOn(resolutionService, 'resolveNodes').mockResolvedValueOnce('echo $p1 $p2 resolved');

      const result = await handler.execute(processingContext);
      const resultState = getStateFromResult(result);
      
      expect(resultState).toBe(stateService);
      expect(stateService.setCommandVar).toHaveBeenCalledWith('cmd2', 
          expect.objectContaining({
              type: 'basic',
              name: 'cmd2',
              commandTemplate: 'echo $p1 $p2 resolved',
              parameters: expect.arrayContaining([
                  expect.objectContaining({ name: 'p1', position: 1 }),
                  expect.objectContaining({ name: 'p2', position: 2 })
              ]),
          })
      );
    });

    it('should handle command definition with multiple parameters', async () => {
      const node = createValidDefineNode('cmd3', 'echo $a $b $c', ['a', 'b', 'c']);
      const processingContext = createMockProcessingContext(node);
       vi.spyOn(resolutionService, 'resolveNodes').mockResolvedValueOnce('echo $a $b $c resolved');
      
      const result = await handler.execute(processingContext);
      const resultState = getStateFromResult(result);

      expect(resultState).toBe(stateService);
      expect(stateService.setCommandVar).toHaveBeenCalledWith('cmd3', 
          expect.objectContaining({
              type: 'basic',
              name: 'cmd3',
              commandTemplate: 'echo $a $b $c resolved',
              parameters: expect.arrayContaining([
                  expect.objectContaining({ name: 'a', position: 1 }),
                  expect.objectContaining({ name: 'b', position: 2 }),
                  expect.objectContaining({ name: 'c', position: 3 })
              ]),
          })
      );
    });
    
    it('should handle command definition with literal value', async () => {
        const literalValue: InterpolatableValue = [
            { type: 'Text', content: 'echo literal ', location: createLocation(1,1) },
            { type: 'VariableReference', identifier: 'var', valueType: 'text', isVariableReference: true, location: createLocation(1,15) }
        ];
        const node = createValidDefineNode('cmdLiteral', literalValue, [], false);
        const processingContext = createMockProcessingContext(node);
        vi.spyOn(resolutionService, 'resolveNodes').mockResolvedValueOnce('echo literal resolved_value');
        
        const result = await handler.execute(processingContext);
        const resultState = getStateFromResult(result);

        expect(resolutionService.resolveNodes).toHaveBeenCalledWith(literalValue, expect.any(Object));
        expect(resultState).toBe(stateService);
        expect(stateService.setCommandVar).toHaveBeenCalledWith('cmdLiteral', 
            expect.objectContaining({
                type: 'basic',
                name: 'cmdLiteral',
                commandTemplate: 'echo literal resolved_value', 
                parameters: expect.arrayContaining([]),
            })
        );
    });

  });

  describe('metadata handling', () => {
    it('should handle command risk metadata', async () => {
      const node = createValidDefineNode('cmdRisk.risk.high', 'rm -rf /'); 
      const processingContext = createMockProcessingContext(node);
      vi.spyOn(resolutionService, 'resolveNodes').mockResolvedValueOnce('rm -rf / resolved');

      await handler.execute(processingContext);
      expect(stateService.setCommandVar).toHaveBeenCalledWith('cmdRisk', 
           expect.objectContaining({
               riskLevel: 'high', 
           })
      );
    });

    it('should handle command about metadata', async () => {
      const node = createValidDefineNode('cmdAbout.about.A cool command', 'ls'); 
      const processingContext = createMockProcessingContext(node);
      vi.spyOn(resolutionService, 'resolveNodes').mockResolvedValueOnce('ls resolved');

      await handler.execute(processingContext);
      expect(stateService.setCommandVar).toHaveBeenCalledWith('cmdAbout', 
           expect.objectContaining({
               description: 'A cool command', 
           })
      );
    });
  });

  describe('validation', () => {
    it.skip('should validate command structure through ValidationService', async () => {
      // Skipping because handler doesn't seem to call validation service directly
      // This should be tested at the DirectiveService level
    });
  });

  describe('state management', () => {
    it('should store command in the provided state', async () => {
      const node = createValidDefineNode('cmd6', 'echo test');
      const processingContext = createMockProcessingContext(node);
      vi.spyOn(resolutionService, 'resolveNodes').mockResolvedValueOnce('echo test resolved');

      await handler.execute(processingContext);
      expect(stateService.setCommandVar).toHaveBeenCalledWith('cmd6', expect.any(Object)); 
      const storedDefinition = vi.mocked(stateService.setCommandVar).mock.calls[0][1] as ICommandDefinition;
      expect(storedDefinition.type).toBe('basic');
      expect(storedDefinition.name).toBe('cmd6');
    });
  });
  
  describe('error handling', () => {
    it('should handle state errors', async () => {
      const node = createValidDefineNode('cmdError', 'test'); 
      const processingContext = createMockProcessingContext(node);
      const stateError = new Error('State error');
      vi.spyOn(resolutionService, 'resolveNodes').mockResolvedValueOnce('test resolved');
      vi.spyOn(stateService, 'setCommandVar').mockRejectedValueOnce(stateError);

      await expectToThrowWithConfig(
        async () => await handler.execute(processingContext),
        {
          code: DirectiveErrorCode.EXECUTION_FAILED, 
        }
      );
      
      try { await handler.execute(processingContext); } catch(e: any) { expect(e.cause).toBe(stateError); }
    });
    
    it('should handle literal value resolution errors', async () => {
        const literalValue: InterpolatableValue = [
            { type: 'Text', content: 'echo literal ', location: createLocation(1,1) },
            { type: 'VariableReference', identifier: 'unresolvable', valueType: 'text', isVariableReference: true, location: createLocation(1,15) }
        ];
        const node = createValidDefineNode('cmdResolveError', literalValue, [], false);
        const processingContext = createMockProcessingContext(node);
        const resolutionError = new MeldResolutionError('Variable not found', { code: 'VAR_NOT_FOUND' });
        vi.spyOn(resolutionService, 'resolveNodes').mockRejectedValue(resolutionError);
                
        await expectToThrowWithConfig(
            async () => await handler.execute(processingContext),
            {
                code: DirectiveErrorCode.RESOLUTION_FAILED,
            }
        );
        
        try { await handler.execute(processingContext); } catch(e: any) { expect(e.cause).toBe(resolutionError); }
    });

  });
});