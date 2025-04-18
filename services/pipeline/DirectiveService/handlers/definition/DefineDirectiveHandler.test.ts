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
import type { DirectiveProcessingContext, OutputFormattingContext } from '@core/types/index.js';
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
import { VariableType, createCommandVariable } from '@core/types/variables.js';
import crypto from 'crypto'; // <<< Import crypto for UUID >>>
import { VariableDefinition } from '../../../../../core/variables/VariableTypes'; // Ensure this path is correct based on latest findings

// Helper to extract state (keep as is)
function getStateFromResult(result: any): IStateService | undefined {
  if (result && typeof result === 'object') {
    // Check for old DirectiveResult shape (for compatibility during refactor?)
    if ('state' in result && result.state) return result.state as IStateService;
    // Check if it IS an IStateService (less likely now)
    if (typeof result.getVariable === 'function') return result as IStateService;
  }
  // Cannot determine state from the new DirectiveResult shape easily here
  // Tests need to check result.stateChanges directly
  console.warn('[getStateFromResult] Could not extract state from result. Test needs update.');
  return undefined; 
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
    vi.spyOn(stateService, 'setVariable');
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
                  command: [{ type: 'Text', content: value, location: createLocation(1,1), nodeId: crypto.randomUUID() }], 
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
          location: createLocation(1,1),
          nodeId: crypto.randomUUID()
      };
  };

  // Helper for processing context (Cast ResolutionContext)
  const createMockProcessingContext = (node: DirectiveNode): DirectiveProcessingContext => {
      // Add required state property, cast to satisfy type checker
      const mockResolutionContext = { 
          strict: true, 
          state: stateService
      } as ResolutionContext; // Cast to type
      
      const mockFormattingContext: OutputFormattingContext = { isBlock: false, preserveLiteralFormatting: false, preserveWhitespace: false };
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

      const result = await handler.handle(processingContext);
      const resultState = getStateFromResult(result);

      expect(resultState).toBe(stateService); 
      // Use the resolved stateService mock
      expect(stateService.setVariable).toHaveBeenCalledWith(expect.objectContaining({
          type: VariableType.COMMAND,
          name: 'cmd1',
          value: expect.objectContaining({
              type: 'basic',
              name: 'cmd1',
              commandTemplate: 'echo hello resolved', 
              parameters: [],
              isMultiline: false,
          })
      }));
    });

    it('should handle command definition with parameters', async () => {
      const node = createValidDefineNode('cmd2', 'echo $p1 $p2', ['p1', 'p2']);
      const processingContext = createMockProcessingContext(node);
      vi.spyOn(resolutionService, 'resolveNodes').mockResolvedValueOnce('echo $p1 $p2 resolved');

      const result = await handler.handle(processingContext);
      const resultState = getStateFromResult(result);
      
      expect(resultState).toBe(stateService);
      expect(stateService.setVariable).toHaveBeenCalledWith(expect.objectContaining({
          type: VariableType.COMMAND,
          name: 'cmd2',
          value: expect.objectContaining({
              type: 'basic',
              name: 'cmd2',
              commandTemplate: 'echo $p1 $p2 resolved',
              parameters: expect.arrayContaining([
                  expect.objectContaining({ name: 'p1', position: 1 }),
                  expect.objectContaining({ name: 'p2', position: 2 })
              ]),
          })
      }));
    });

    it('should handle command definition with multiple parameters', async () => {
      const node = createValidDefineNode('cmd3', 'echo $a $b $c', ['a', 'b', 'c']);
      const processingContext = createMockProcessingContext(node);
       vi.spyOn(resolutionService, 'resolveNodes').mockResolvedValueOnce('echo $a $b $c resolved');
      
      const result = await handler.handle(processingContext);
      const resultState = getStateFromResult(result);

      expect(resultState).toBe(stateService);
      expect(stateService.setVariable).toHaveBeenCalledWith(expect.objectContaining({
          type: VariableType.COMMAND,
          name: 'cmd3',
          value: expect.objectContaining({
              type: 'basic',
              name: 'cmd3',
              commandTemplate: 'echo $a $b $c resolved',
              parameters: expect.arrayContaining([
                  expect.objectContaining({ name: 'a', position: 1 }),
                  expect.objectContaining({ name: 'b', position: 2 }),
                  expect.objectContaining({ name: 'c', position: 3 })
              ]),
          })
      }));
    });
    
    it('should handle command definition with literal value', async () => {
        const literalValue: InterpolatableValue = [
            { type: 'Text', content: 'echo literal ', location: createLocation(1,1), nodeId: crypto.randomUUID() },
            { type: 'VariableReference', identifier: 'var', valueType: 'text', isVariableReference: true, location: createLocation(1,15) }
        ];
        const node = createValidDefineNode('cmdLiteral', literalValue, [], false);
        const processingContext = createMockProcessingContext(node);
        vi.spyOn(resolutionService, 'resolveNodes').mockResolvedValueOnce('echo literal resolved_value');
        
        const result = await handler.handle(processingContext);
        const resultState = getStateFromResult(result);

        expect(resolutionService.resolveNodes).toHaveBeenCalledWith(literalValue, expect.any(Object));
        expect(resultState).toBe(stateService);
        expect(stateService.setVariable).toHaveBeenCalledWith(expect.objectContaining({
            type: VariableType.COMMAND,
            name: 'cmdLiteral',
            value: expect.objectContaining({
                type: 'basic',
                name: 'cmdLiteral',
                commandTemplate: 'echo literal resolved_value', 
                parameters: expect.arrayContaining([]),
            })
        }));
    });

    it('should define a basic command using literal', async () => {
      const node = createValidDefineNode('cmd1', 'echo hello'); 
      const processingContext = createMockProcessingContext(node);
      // Use the resolved resolutionService mock
      vi.spyOn(resolutionService, 'resolveNodes').mockResolvedValueOnce('echo hello resolved');

      const result = await handler.handle(processingContext);
      
      // Assert on result.stateChanges
      expect(result.stateChanges).toBeDefined();
      expect(result.stateChanges?.variables).toHaveProperty('cmd1');
      const cmdDef = result.stateChanges?.variables?.cmd1 as VariableDefinition | undefined;
      expect(cmdDef?.type).toBe(VariableType.COMMAND);
      expect(cmdDef?.value?.type).toBe('basic');
      expect((cmdDef?.value as IBasicCommandDefinition).commandTemplate).toBe('echo hello resolved');
      expect(cmdDef?.metadata?.origin).toBe(VariableOrigin.DIRECT_DEFINITION);
      
      // Remove assertion checking direct call to stateService
      // expect(stateService.setVariable).toHaveBeenCalledWith(...);
    });

    it('should define a basic command with parameters using literal', async () => {
      const node = createValidDefineNode('cmd2', 'echo $p1 $p2', ['p1', 'p2']);
      const processingContext = createMockProcessingContext(node);
      vi.spyOn(resolutionService, 'resolveNodes').mockResolvedValueOnce('echo $p1 $p2 resolved');

      const result = await handler.handle(processingContext);

      expect(result.stateChanges).toBeDefined();
      expect(result.stateChanges?.variables).toHaveProperty('cmd2');
      const cmdDef = result.stateChanges?.variables?.cmd2 as VariableDefinition | undefined;
      expect(cmdDef?.type).toBe(VariableType.COMMAND);
      expect(cmdDef?.value?.type).toBe('basic');
      expect((cmdDef?.value as IBasicCommandDefinition).commandTemplate).toBe('echo $p1 $p2 resolved');
      expect(cmdDef?.value?.parameters).toHaveLength(2);
      expect(cmdDef?.value?.parameters?.[0]?.name).toBe('p1');
      expect(cmdDef?.value?.parameters?.[1]?.name).toBe('p2');
    });

    it('should define a basic command using @run command', async () => {
      const node = createValidDefineNode('cmd3', 'echo $a $b $c', ['a', 'b', 'c']);
      const processingContext = createMockProcessingContext(node);
       vi.spyOn(resolutionService, 'resolveNodes').mockResolvedValueOnce('echo $a $b $c resolved');
      
      const result = await handler.handle(processingContext);
      
      expect(result.stateChanges).toBeDefined();
      expect(result.stateChanges?.variables).toHaveProperty('cmd3');
      const cmdDef = result.stateChanges?.variables?.cmd3 as VariableDefinition | undefined;
      expect(cmdDef?.type).toBe(VariableType.COMMAND);
      expect(cmdDef?.value?.type).toBe('basic');
      expect((cmdDef?.value as IBasicCommandDefinition).commandTemplate).toBe('echo $a $b $c resolved');
    });

    it('should define a language command using @run code', async () => {
      const node = createValidDefineNode('cmdLang', 'print("hello python resolved")', [], false);
      const processingContext = createMockProcessingContext(node);
      vi.spyOn(resolutionService, 'resolveNodes').mockResolvedValueOnce('print("hello python resolved")');
      
      const result = await handler.handle(processingContext);
      
      expect(result.stateChanges).toBeDefined();
      expect(result.stateChanges?.variables).toHaveProperty('cmdLang');
      const cmdDef = result.stateChanges?.variables?.cmdLang as VariableDefinition | undefined;
      expect(cmdDef?.type).toBe(VariableType.COMMAND);
      expect(cmdDef?.value?.type).toBe('language');
      expect((cmdDef?.value as ILanguageCommandDefinition).language).toBe('python');
      expect((cmdDef?.value as ILanguageCommandDefinition).codeBlock).toBe('print("hello python resolved")');
    });
  });

  describe('metadata handling', () => {
    it('should handle command risk metadata', async () => {
      const node = createValidDefineNode('cmdRisk.risk.high', 'rm -rf /'); 
      const processingContext = createMockProcessingContext(node);
      vi.spyOn(resolutionService, 'resolveNodes').mockResolvedValueOnce('rm -rf / resolved');

      await handler.handle(processingContext);
      expect(stateService.setVariable).toHaveBeenCalledWith(expect.objectContaining({
          type: VariableType.COMMAND,
          name: 'cmdRisk',
          value: expect.objectContaining({
               riskLevel: 'high', 
           })
      }));
    });

    it('should handle command about metadata', async () => {
      const node = createValidDefineNode('cmdAbout.about.A cool command', 'ls'); 
      const processingContext = createMockProcessingContext(node);
      vi.spyOn(resolutionService, 'resolveNodes').mockResolvedValueOnce('ls resolved');

      await handler.handle(processingContext);
      expect(stateService.setVariable).toHaveBeenCalledWith(expect.objectContaining({
          type: VariableType.COMMAND,
          name: 'cmdAbout',
          value: expect.objectContaining({
               description: 'A cool command', 
           })
      }));
    });
  });

  describe('state management', () => {
    it('should store command in the provided state', async () => {
      const node = createValidDefineNode('cmd6', 'echo test');
      const processingContext = createMockProcessingContext(node);
      vi.spyOn(resolutionService, 'resolveNodes').mockResolvedValueOnce('echo test resolved');

      await handler.handle(processingContext);
      expect(stateService.setVariable).toHaveBeenCalledWith(expect.objectContaining({
        type: VariableType.COMMAND,
        name: 'cmd6'
      })); 
      const storedCommandVariable = vi.mocked(stateService.setVariable).mock.calls[0][0] as CoreCommandVariable;
      const storedDefinition = storedCommandVariable.value as ICommandDefinition;
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
      vi.spyOn(stateService, 'setVariable').mockRejectedValueOnce(stateError);

      await expectToThrowWithConfig(
        async () => await handler.handle(processingContext),
        {
          code: DirectiveErrorCode.EXECUTION_FAILED, 
        }
      );
      
      try { await handler.handle(processingContext); } catch(e: any) { expect(e.cause).toBe(stateError); }
    });
    
    it('should handle literal value resolution errors', async () => {
        const literalValue: InterpolatableValue = [
            { type: 'Text', content: 'echo literal ', location: createLocation(1,1), nodeId: crypto.randomUUID() },
            { type: 'VariableReference', identifier: 'unresolvable', valueType: 'text', isVariableReference: true, location: createLocation(1,15) }
        ];
        const node = createValidDefineNode('cmdResolveError', literalValue, [], false);
        const processingContext = createMockProcessingContext(node);
        const resolutionError = new MeldResolutionError('Variable not found', { code: 'VAR_NOT_FOUND' });
        vi.spyOn(resolutionService, 'resolveNodes').mockRejectedValue(resolutionError);
                
        await expectToThrowWithConfig(
            async () => await handler.handle(processingContext),
            {
                code: DirectiveErrorCode.RESOLUTION_FAILED,
            }
        );
        
        try { await handler.handle(processingContext); } catch(e: any) { expect(e.cause).toBe(resolutionError); }
    });

  });
});