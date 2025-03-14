import { describe, it, expect, beforeEach, vi } from 'vitest';
import { VariableReferenceResolver } from './VariableReferenceResolver.js';
import { 
  createMockStateService, 
  createMockParserService, 
  createVariableReferenceNode,
  createTextNode
} from '@tests/utils/testFactories.js';
import type { ResolutionContext } from '@services/resolution/ResolutionService/IResolutionService.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { IParserService } from '@services/pipeline/ParserService/IParserService.js';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import { MeldResolutionError } from '@core/errors/MeldResolutionError.js';

describe('VariableReferenceResolver Edge Cases', () => {
  let resolver: VariableReferenceResolver;
  let stateService: ReturnType<typeof createMockStateService>;
  let parserService: ReturnType<typeof createMockParserService>;
  let resolutionService: IResolutionService;
  let context: ResolutionContext;

  beforeEach(() => {
    stateService = createMockStateService();
    parserService = createMockParserService();
    resolutionService = {
      resolveInContext: vi.fn().mockImplementation(async (value) => value)
    } as unknown as IResolutionService;
    
    resolver = new VariableReferenceResolver(stateService, resolutionService, parserService);
    
    context = {
      allowedVariableTypes: {
        text: true,
        data: true,
        path: true,
        command: true
      },
      currentFilePath: 'test.meld',
      state: stateService,
      strict: true
    };
  });

  // Test for nested object access with arrays
  it('should access nested array elements correctly', async () => {
    vi.mocked(stateService.getDataVar).mockReturnValue({
      items: [
        { name: 'item1' },
        { name: 'item2' }
      ]
    });
    
    vi.mocked(parserService.parse).mockResolvedValue([
      createVariableReferenceNode('data', 'data', [
        { type: 'field', value: 'items' },
        { type: 'index', value: 1 },
        { type: 'field', value: 'name' }
      ])
    ]);
    
    const result = await resolver.resolve('{{data.items[1].name}}', context);
    expect(result).toBe('item2');
  });

  it('should fall back to parser client when parser service fails', async () => {
    vi.mocked(parserService.parse).mockRejectedValue(new Error('Parser service failed'));
    
    vi.mocked(stateService.getTextVar).mockReturnValue('Hello');
    
    const result = await resolver.resolve('{{greeting}}', context);
    expect(result).toBe('Hello');
  });

  it('should handle data variables with field access through string concatenation', async () => {
    // Mock state service to return a data object
    vi.mocked(stateService.getDataVar).mockReturnValue({
      key1: 'value1',
      key2: 'value2'
    });
    
    // Mock parser to return a data variable with field access
    vi.mocked(parserService.parse).mockResolvedValue([
      createVariableReferenceNode('data', 'data', [
        { type: 'field', value: 'key2' }
      ])
    ]);
    
    const result = await resolver.resolve('{{data.key2}}', context);
    expect(result).toBe('value2');
  });

  it('should provide detailed error information for field access failures', async () => {
    vi.mocked(stateService.getDataVar).mockReturnValue({
      user: {}
    });
    
    vi.mocked(parserService.parse).mockResolvedValue([
      createVariableReferenceNode('data', 'data', [
        { type: 'field', value: 'user' },
        { type: 'field', value: 'name' }
      ])
    ]);
    
    try {
      await resolver.resolve('{{data.user.name}}', { ...context, strict: true });
      fail('Should have thrown an error');
    } catch (error) {
      expect(error).toBeInstanceOf(MeldResolutionError);
      expect(error.message).toContain('Cannot access field');
      expect(error.message).toContain('name');
    }
  });

  it('should return empty string for missing fields when strict mode is off', async () => {
    vi.mocked(stateService.getDataVar).mockReturnValue({
      user: {}
    });
    
    vi.mocked(parserService.parse).mockResolvedValue([
      createVariableReferenceNode('data', 'data', [
        { type: 'field', value: 'user' },
        { type: 'field', value: 'name' }
      ])
    ]);
    
    const result = await resolver.resolve('{{data.user.name}}', { ...context, strict: false });
    expect(result).toBe('');
  });

  it('should handle errors in nested variable resolution', async () => {
    // Mock resolveInContext to throw
    vi.mocked(resolutionService.resolveInContext).mockRejectedValue(new Error('Nested error'));
    
    await expect(resolver.resolve('{{var_{{nested}}}}', context))
      .rejects.toThrow();
  });
});