import { describe, it, expect, beforeEach, vi } from 'vitest';
import { VariableReferenceResolver } from './VariableReferenceResolver.js';
import { createMockStateService, createMockParserService } from '@tests/utils/testFactories.js';
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
    
    vi.mocked(parserService.parse).mockResolvedValue([{
      type: 'VariableReference',
      identifier: 'data',
      fields: [
        { type: 'field', value: 'items' },
        { type: 'index', value: 1 },
        { type: 'field', value: 'name' }
      ]
    }]);
    
    const result = await resolver.resolve('{{data.items.1.name}}', context);
    expect(result).toBe('item2');
  });

  // Test for parser service fallback
  it('should fall back to parser client when parser service fails', async () => {
    vi.mocked(parserService.parse).mockRejectedValueOnce(new Error('Parse failed'));
    vi.mocked(stateService.getTextVar).mockReturnValue('Fallback Success');
    
    const result = await resolver.resolve('{{fallback}}', context);
    expect(result).toBe('Fallback Success');
  });

  // Test for data variables with field access
  it('should handle data variables with field access through string concatenation', async () => {
    vi.mocked(stateService.getDataVar).mockReturnValue({ 
      key1: 'value1', 
      key2: 'value2' 
    });
    
    const result = await resolver.resolve('{{data.key2}}', context);
    expect(result).toBe('value2');
  });

  // Test for error details in field access errors
  it('should provide detailed error information for field access failures', async () => {
    vi.mocked(stateService.getDataVar).mockReturnValue({ user: {} });
    
    await expect(resolver.resolveFieldAccess('data', 'user.name', context))
      .rejects.toHaveProperty('message');
  });
  
  // Test for error handling with strict mode off
  it('should return empty string for missing fields when strict mode is off', async () => {
    const nonStrictContext = { ...context, strict: false };
    vi.mocked(stateService.getDataVar).mockReturnValue({ user: {} });
    
    const result = await resolver.resolve('{{data.user.name}}', nonStrictContext);
    expect(result).toBe('');
  });
  
  // Test for error handling in nested variable resolution
  it('should handle errors in nested variable resolution', async () => {
    // Mock a failing resolution service
    vi.mocked(resolutionService.resolveInContext).mockRejectedValue(
      new Error('Failed to resolve nested variable')
    );
    
    await expect(resolver.resolveNestedVariableReference('{{var_{{nested}}}}', context))
      .rejects.toThrow();
  });
});