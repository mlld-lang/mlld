import { describe, it, expect, beforeEach, vi, fail, afterEach } from 'vitest';
import { VariableReferenceResolver } from '@services/resolution/ResolutionService/resolvers/VariableReferenceResolver.js';
import { 
  createTextNode,
  createVariableReferenceNode
} from '@tests/utils/testFactories.js';
import type { ResolutionContext, IStateService, IParserService, IResolutionService, MeldNode } from '@core/types';
import { MeldResolutionError } from '@core/errors/MeldResolutionError.js';
import { VariableNodeFactory } from '@core/syntax/types/factories/index.js';
import { DeepMockProxy, mockDeep } from 'vitest-mock-extended';
import { TestContextDI } from '@tests/utils/di/index.js';
import { ResolutionContextFactory } from '@services/resolution/ResolutionService/ResolutionContextFactory.js';

describe('VariableReferenceResolver Edge Cases', () => {
  let contextDI: TestContextDI;
  let resolver: VariableReferenceResolver;
  let stateService: DeepMockProxy<IStateService>;
  let parserService: DeepMockProxy<IParserService>;
  let resolutionService: DeepMockProxy<IResolutionService>;
  let resolutionContext: ResolutionContext;
  let mockVariableNodeFactory: VariableNodeFactory;

  beforeEach(async () => {
    contextDI = TestContextDI.createIsolated();

    stateService = mockDeep<IStateService>();
    parserService = mockDeep<IParserService>();
    resolutionService = mockDeep<IResolutionService>();
    
    mockVariableNodeFactory = {
      createVariableReferenceNode: vi.fn().mockImplementation(createVariableReferenceNode),
      isVariableReferenceNode: vi.fn().mockImplementation((node) => {
        return (
          node.type === 'VariableReference' &&
          typeof node.identifier === 'string' &&
          typeof node.valueType === 'string'
        );
      })
    } as any;

    contextDI.registerMock<IStateService>('IStateService', stateService);
    contextDI.registerMock<IParserService>('IParserService', parserService);
    contextDI.registerMock<IResolutionService>('IResolutionService', resolutionService);
    contextDI.registerMock<VariableNodeFactory>(VariableNodeFactory, mockVariableNodeFactory);
    
    resolver = await contextDI.resolve(VariableReferenceResolver);
    
    resolutionContext = ResolutionContextFactory.create(stateService, 'test.meld')
                          .withStrictMode(true);
  });
  
  afterEach(async () => {
    await contextDI?.cleanup();
  });

  it('should access nested array elements correctly', async () => {
    const mockData = {
      items: [
        { name: 'item1' },
        { name: 'item2' }
      ]
    };
    
    stateService.getDataVar.calledWith('data').mockReturnValue(mockData);
    
    parserService.parse.mockResolvedValue([
      createVariableReferenceNode('data', 'data', [
        { type: 'field', value: 'items' },
        { type: 'index', value: 1 },
        { type: 'field', value: 'name' }
      ])
    ]);
    
    const result = await resolver.resolve('{{data.items[1].name}}', resolutionContext);
    
    expect(result).toBe('item2');
  });

  it('should fall back to parser client when parser service fails', async () => {
    vi.mocked(parserService.parse).mockRejectedValue(new Error('Parser service failed'));
    
    stateService.getTextVar.calledWith('greeting').mockReturnValue('Hello');
    
    const result = await resolver.resolve('{{greeting}}', resolutionContext);
    expect(result).toBe('Hello');
  });

  it('should handle data variables with field access through string concatenation', async () => {
    const mockData = {
      key1: 'value1',
      key2: 'value2'
    };
    
    stateService.getDataVar.calledWith('data').mockReturnValue(mockData);
    
    parserService.parse.mockResolvedValue([
      createVariableReferenceNode('data', 'data', [
        { type: 'field', value: 'key2' }
      ])
    ]);
    
    const result = await resolver.resolve('{{data.key2}}', resolutionContext);
    expect(result).toBe('value2');
  });

  it('should provide detailed error information for field access failures', async () => {
    const mockData = { user: { name: 'John' } };
    
    stateService.getDataVar.calledWith('data').mockReturnValue(mockData);
    
    parserService.parse.mockResolvedValue([
      createVariableReferenceNode('data', 'data', [
        { type: 'field', value: 'user' },
        { type: 'field', value: 'email' }
      ])
    ]);
    
    try {
      await resolver.resolve('{{data.user.email}}', resolutionContext);
      fail('Should have thrown an error');
    } catch (error) {
      expect(error).toBeInstanceOf(MeldResolutionError);
      expect(error.message).toContain('Field email');
      expect(error.message).toContain('not found in variable data');
      expect(error.message).toContain('Available keys:');
      expect(error.message).toContain('name');
    }
  });

  it('should return empty string for missing fields when strict mode is off', async () => {
    const nonStrictContext = ResolutionContextFactory.create(stateService, 'test.meld')
                               .withStrictMode(false);
    
    const mockData = { user: { name: 'John' } };
    stateService.getDataVar.calledWith('data').mockReturnValue(mockData);
    
    parserService.parse.mockResolvedValue([
      createVariableReferenceNode('data', 'data', [
        { type: 'field', value: 'user' },
        { type: 'field', value: 'email' } 
      ])
    ]);
    
    const result = await resolver.resolve('{{data.user.email}}', nonStrictContext);
    expect(result).toBe('');
  });

  it('should handle errors in nested variable resolution', async () => {
    vi.mocked(resolutionService.resolveInContext).mockImplementation(async (value, ctx) => {
      if (typeof value === 'string' && value.includes('{{nested}}')) {
        return ''; 
      }
      if (typeof value === 'string' && value.startsWith('var_')) {
         const varName = value.substring(4);
         return stateService.getTextVar(varName);
      }
      return value; 
    });
    
    stateService.getTextVar.calledWith('').mockReturnValue('');
        
    const result = await resolver.resolve('{{var_{{nested}}}}', resolutionContext);
        
    expect(result).toBe('');
  });
});