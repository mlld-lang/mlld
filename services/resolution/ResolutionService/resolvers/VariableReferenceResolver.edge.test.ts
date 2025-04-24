import { describe, it, expect, beforeEach, vi, afterEach, type Mock } from 'vitest';
import { VariableReferenceResolver } from '@services/resolution/ResolutionService/resolvers/VariableReferenceResolver';
import { 
  createTextNode,
  createVariableReferenceNode
} from '@tests/utils/testFactories';
import type { ResolutionContext } from '@core/types/resolution';
import type { IStateService } from '@services/state/StateService/IStateService';
import type { IParserService } from '@services/pipeline/ParserService/IParserService';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService';
import type { MeldNode } from '@core/ast/ast/astTypes';
import { MeldResolutionError, FieldAccessError, VariableResolutionError } from '@core/errors/index';
import { DeepMockProxy, mockDeep } from 'vitest-mock-extended';
import { ResolutionContextFactory } from '@services/resolution/ResolutionService/ResolutionContextFactory';
import { VariableType, TextVariable, DataVariable, MeldVariable, JsonValue } from '@core/types/index';
import { expectToThrowWithConfig } from '@tests/utils/ErrorTestUtils';
import type { IPathService } from '@services/fs/PathService/IPathService';
import { createStateServiceMock } from '@tests/utils/mocks/serviceMocks';
import { isInterpolatableValueArray } from '@core/syntax/types/guards';
import type { InterpolatableValue } from '@core/syntax/types/nodes';
import type { StructuredPath as AstStructuredPath } from '@core/syntax/types/nodes';
import type { VariableReferenceNode, TextNode } from '@core/ast/ast/astTypes';
import { container, type DependencyContainer } from 'tsyringe';

// Define mock types if helpful
type MockPathService = DeepMockProxy<IPathService>;
type MockResolutionService = DeepMockProxy<IResolutionService>;
type MockParserService = DeepMockProxy<IParserService>;

describe('VariableReferenceResolver Edge Cases', () => {
  let testContainer: DependencyContainer;
  let resolver: VariableReferenceResolver;
  let stateService: ReturnType<typeof createStateServiceMock>;
  let parserService: MockParserService;
  let resolutionService: MockResolutionService;
  let pathService: MockPathService;
  let resolutionContext: ResolutionContext;

  // --- Define mock variables used in edge tests --- 
  const mockGreetingVar: TextVariable = { name: 'greeting', type: VariableType.TEXT, value: 'Hello' };
  const mockDataVarBase: DataVariable = { name: 'data', type: VariableType.DATA, value: { user: { name: 'John' } } };
  const mockDataVarItems: DataVariable = { name: 'data', type: VariableType.DATA, value: { items: [{ name: 'item1' }, { name: 'item2' }] } };
  const mockDataVarKeys: DataVariable = { name: 'data', type: VariableType.DATA, value: { key1: 'value1', key2: 'value2' } };

  beforeEach(async () => {
    testContainer = container.createChildContainer();

    stateService = createStateServiceMock();
    parserService = mockDeep<IParserService>();
    resolutionService = mockDeep<IResolutionService>();
    pathService = mockDeep<IPathService>();
    
    stateService.getVariable.mockImplementation((name: string, type?: VariableType): MeldVariable | undefined => {
        if (name === null || typeof name === 'undefined') {
            console.warn(`[DEBUG MOCK EDGE DEFAULT getVariable] Received null or undefined name.`);
            return undefined;
        }
        console.log(`[DEBUG MOCK EDGE DEFAULT getVariable] Called for: ${name}`);
        if (name === '{{greeting}}') return mockGreetingVar;
        if (name === 'greeting') return mockGreetingVar;
        if (name === 'data') {
            console.log(`[DEBUG MOCK EDGE DEFAULT getVariable] Returning base mock for: ${name}`);
            return mockDataVarBase;
        }
        if ([ 'nested', 'outer', 'user', 'missingVar', 'var_'].some(prefix => name.startsWith(prefix))) {
             console.log(`[DEBUG MOCK EDGE DEFAULT getVariable] Explicitly returning undefined for edge case var: ${name}`);
             return undefined;
        }
        console.log(`[DEBUG MOCK EDGE DEFAULT getVariable] NOT FOUND for: ${name}`);
        return undefined;
    });

    stateService.getCurrentFilePath.mockReturnValue('/mock/dir/edge_test.meld');

    testContainer.registerInstance<IStateService>('IStateService', stateService);
    testContainer.registerInstance<IParserService>('IParserService', parserService);
    testContainer.registerInstance<IResolutionService>('IResolutionService', resolutionService);
    testContainer.registerInstance<IPathService>('IPathService', pathService);

    testContainer.register(VariableReferenceResolver, { useClass: VariableReferenceResolver });

    resolver = testContainer.resolve(VariableReferenceResolver);
    
    resolutionContext = ResolutionContextFactory.create(stateService, 'edge_test.meld')
                          .withStrictMode(true);
  });
  
  afterEach(async () => {
    testContainer?.dispose();
  });

  it('should access nested array elements correctly', async () => {
    stateService.getVariable.mockImplementation((name: string): MeldVariable | undefined => {
        if (name === 'data') return mockDataVarItems;
        return undefined;
    });

    const node = createVariableReferenceNode('data', VariableType.DATA, [
      { type: 'field', value: 'items' },
      { type: 'index', value: 1 },
      { type: 'field', value: 'name' }
    ]);
    
    const result = await resolver.resolve(node, resolutionContext);
    
    expect(result).toBe('item2');
    expect(stateService.getVariable).toHaveBeenCalledWith('data', VariableType.DATA);
  });

  it('should fall back to parser client when parser service fails', async () => {
    parserService.parse.mockRejectedValue(new Error('Parser service failed'));
    
    stateService.getVariable.mockImplementation((name: string): MeldVariable | undefined => {
        console.log(`[DEBUG MOCK FALLBACK getVariable] Called with: ${name}`);
        if (name === 'greeting') return mockGreetingVar;
        return undefined;
    });

    const node = createVariableReferenceNode('greeting', VariableType.TEXT);
    const result = await resolver.resolve(node, resolutionContext);
    expect(result).toBe('Hello');

    expect(stateService.getVariable).toHaveBeenCalled();
  });

  it('should handle data variables with field access through string concatenation', async () => {
    stateService.getVariable.mockImplementation((name: string): MeldVariable | undefined => {
        if (name === 'data') return mockDataVarKeys;
        return undefined;
    });
    
    const node = createVariableReferenceNode('data', VariableType.DATA, [
      { type: 'field', value: 'key2' }
    ]);

    const result = await resolver.resolve(node, resolutionContext);
    expect(result).toBe('value2');
    expect(stateService.getVariable).toHaveBeenCalledWith('data', VariableType.DATA);
  });

  it('should provide detailed error information for field access failures', async () => {
    stateService.getVariable.mockImplementation((name: string): MeldVariable | undefined => {
        if (name === 'data') return mockDataVarBase;
        return undefined;
    });

    const node = createVariableReferenceNode('data', VariableType.DATA, [
      { type: 'field', value: 'user' },
      { type: 'field', value: 'email' }
    ]);

    try {
        await resolver.resolve(node, resolutionContext);
        throw new Error('Test failed: Expected FieldAccessError was not thrown'); 
    } catch (error) {
        // process.stdout.write(`\n>>> CAUGHT ERROR DETAILS (edge test) <<<\n`);
        // process.stdout.write(`instanceof Error: ${error instanceof Error}\n`);
        // process.stdout.write(`constructor.name: ${error?.constructor?.name}\n`);
        // process.stdout.write(`message: ${message}\n`);
        // process.stdout.write(`instanceof FieldAccessError: ${error instanceof FieldAccessError}\n`);
        // process.stdout.write(`serialized: ${serialized}\n`);
        // process.stdout.write(`serialization failed: ${e instanceof Error ? e.message : String(e)}\n`);
        // process.stdout.write(`>>> END ERROR DETAILS <<<\n\n`);
        
        if (error instanceof Error) {
            expect(error.constructor.name).toBe('FieldAccessError');
            expect(error.message).toContain('Field \'email\''); 
            expect(error.message).toContain('not found in object');
            expect(error.message).toContain('Available keys:');
            expect(error.message).toContain('name');
        } else {
            throw new Error('Caught exception was not an instance of Error');
        }
    }

    expect(stateService.getVariable).toHaveBeenCalledWith('data', VariableType.DATA);
  });

  it('should return empty string for missing fields when strict mode is off', async () => {
    stateService.getVariable.mockImplementation((name: string): MeldVariable | undefined => {
        if (name === 'data') return mockDataVarBase;
        return undefined;
    });

    const nonStrictContext = ResolutionContextFactory.create(stateService, 'edge_test.meld')
                               .withStrictMode(false);
    
    const node = createVariableReferenceNode('data', VariableType.DATA, [
      { type: 'field', value: 'user' },
      { type: 'field', value: 'email' } 
    ]);

    const result = await resolver.resolve(node, nonStrictContext);
    expect(result).toBe('');
    expect(stateService.getVariable).toHaveBeenCalledWith('data', VariableType.DATA);
  });

  it('should handle errors in nested variable resolution', async () => {
    const mockOuterVar: TextVariable = { name: 'outer', type: VariableType.TEXT, value: 'Value is {{nested}}' };

    stateService.getVariable.mockImplementation((name: string): MeldVariable | undefined => {
      if (name === 'outer') return mockOuterVar;
      if (name === 'nested') return undefined;
      return undefined;
    });
    
    const node: VariableReferenceNode = createVariableReferenceNode('outer', VariableType.TEXT);

    // process.stdout.write(`DEBUG: [Nested Error Test] Context before resolve: ${resolutionContext ? 'Defined' : 'UNDEFINED'}\n`);
    const result: string = await resolver.resolve(node, resolutionContext);
    expect(result).toBe(mockOuterVar.value);
        
    expect(stateService.getVariable).toHaveBeenCalledWith('outer', VariableType.TEXT);
    expect(resolutionService.resolveInContext).not.toHaveBeenCalled();
  });
});