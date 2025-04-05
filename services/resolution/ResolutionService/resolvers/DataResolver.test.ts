import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { DataResolver } from '@services/resolution/ResolutionService/resolvers/DataResolver.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import { 
  ResolutionContext, 
  VariableType, 
  DataVariable,
  FieldAccess,
  FieldAccessType,
  JsonValue
} from '@core/types';
import type { DataVariable as DataVariableSpec } from '@core/types/variables-spec';
import { MeldResolutionError, FieldAccessError } from '@core/errors/index.js';
import { createMockStateService } from '@tests/utils/testFactories.js';
import { ResolutionContextFactory } from '@services/resolution/ResolutionService/ResolutionContextFactory.js';
import type { DirectiveNode } from '@core/types/ast-types';
import { ErrorSeverity } from '@core/errors';

const createDataDirectiveNode = (identifier: string, field?: string): DirectiveNode => ({
  type: 'Directive',
  directive: {
    kind: 'data',
    identifier: identifier,
    value: '',
    field: field
  }
});

describe('DataResolver', () => {
  let resolver: DataResolver;
  let stateService: ReturnType<typeof createMockStateService>;
  let context: ResolutionContext;
  let testData: { [key: string]: any };

  beforeEach(() => {
    stateService = createMockStateService();

    testData = {
      user: { name: 'Alice', id: 123, details: { active: true, roles: ['admin', 'dev'] } },
      items: ['apple', 'banana', { type: 'orange' }],
      primitive: 'a string',
      nullValue: null
    };

    vi.mocked(stateService.getDataVar).mockImplementation((name: string): DataVariable | undefined => {
      if (testData.hasOwnProperty(name)) {
        return { 
          name, 
          valueType: VariableType.DATA, 
          value: testData[name], 
          source: { type: 'definition', filePath: 'mock' } 
        };
      }
      return undefined;
    });

    resolver = new DataResolver(stateService);

    context = ResolutionContextFactory.create(stateService, 'test.meld')
              .withAllowedTypes([VariableType.DATA]) 
              .withStrictMode(true);
  });
  
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('resolve (with field access)', () => {
    
    it('should resolve simple field property access', async () => {
      const node = createDataDirectiveNode('user', 'name');
      const result = await resolver.resolve(node, context);
      expect(result).toBe(JSON.stringify('Alice'));
    });

    it('should resolve nested field property access', async () => {
      const node = createDataDirectiveNode('user', 'details');
      const result = await resolver.resolve(node, context);
      expect(result).toBe(JSON.stringify({ active: true, roles: ['admin', 'dev'] })); 
    });

    it('should resolve simple array index access', async () => {
      const node = createDataDirectiveNode('items');
      const result = await resolver.resolve(node, context);
      expect(result).toBe(JSON.stringify(['apple', 'banana', { type: 'orange' }]));
    });

    it('should resolve nested array index access', async () => {
    });

    it('should resolve mixed property/index access', async () => {
    });

    it('should throw FieldAccessError for invalid property in strict mode', async () => {
      const node = createDataDirectiveNode('user', 'age');
      await expect(resolver.resolve(node, context))
        .rejects
        .toThrow(FieldAccessError);
      await expect(resolver.resolve(node, context))
        .rejects
        .toThrow("Field 'age' not found in data variable 'user'"); 
    });

    it('should return empty string for invalid property in non-strict mode', async () => {
      const node = createDataDirectiveNode('user', 'age');
      context = context.withStrictMode(false);
      
      await expect(resolver.resolve(node, context))
        .rejects
        .toThrow(FieldAccessError);
    });

    it('should throw FieldAccessError for accessing field on primitive in strict mode', async () => {
      vi.mocked(stateService.getDataVar).mockImplementationOnce((name: string): DataVariable | undefined => {
        if (name === 'primitive') {
          return { name, valueType: VariableType.DATA, value: testData.primitive, source: { type: 'definition', filePath: 'mock' } };
        }
        return undefined;
      });
      const node = createDataDirectiveNode('primitive', 'length');
      await expect(resolver.resolve(node, context))
        .rejects
        .toThrow(FieldAccessError);
    });
    
    it('should throw FieldAccessError for accessing field on primitive in non-strict mode', async () => {
      vi.mocked(stateService.getDataVar).mockImplementationOnce((name: string): DataVariable | undefined => {
        if (name === 'primitive') {
          return { name, valueType: VariableType.DATA, value: testData.primitive, source: { type: 'definition', filePath: 'mock' } };
        }
        return undefined;
      });
      const node = createDataDirectiveNode('primitive', 'length');
      context = context.withStrictMode(false);

      await expect(resolver.resolve(node, context))
        .rejects
        .toThrow(FieldAccessError);
    });

    it('should throw FieldAccessError when accessing field on null in strict mode', async () => {
      const node = createDataDirectiveNode('nullValue', 'any');
      await expect(resolver.resolve(node, context))
        .rejects
        .toThrow(FieldAccessError);
      await expect(resolver.resolve(node, context))
        .rejects
        .toThrow("Field 'any' not found in data variable 'nullValue'");
    });
    
  });
}); 