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

    context = ResolutionContextFactory.create(stateService, 'test.meld');
  });
  
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('applyFieldAccess (or similar method)', () => {
    // Placeholder for updated tests...
  });

  // Refocus tests on field access logic
  describe('applyFieldAccess (assuming this method exists)', () => {
    
    it('should resolve simple field property access', () => {
      const value = testData.user; // { name: 'Alice', id: 123, ... }
      const fields: FieldAccess[] = [{ type: FieldAccessType.PROPERTY, key: 'name' }];
      const result = resolver.applyFieldAccess(value, fields, context);
      expect(result).toBe('Alice');
    });

    it('should resolve nested field property access', () => {
      const value = testData.user;
      const fields: FieldAccess[] = [
        { type: FieldAccessType.PROPERTY, key: 'details' },
        { type: FieldAccessType.PROPERTY, key: 'active' }
      ];
      const result = resolver.applyFieldAccess(value, fields, context);
      expect(result).toBe(true);
    });

    it('should resolve simple array index access', () => {
      const value = testData.items; // ['apple', 'banana', { type: 'orange' }]
      const fields: FieldAccess[] = [{ type: FieldAccessType.INDEX, key: 1 }]; // Access 'banana'
      const result = resolver.applyFieldAccess(value, fields, context);
      expect(result).toBe('banana');
    });

    it('should resolve nested array index access', () => {
      const value = testData.user;
      const fields: FieldAccess[] = [
        { type: FieldAccessType.PROPERTY, key: 'details' },
        { type: FieldAccessType.PROPERTY, key: 'roles' },
        { type: FieldAccessType.INDEX, key: 0 } // Access 'admin'
      ];
      const result = resolver.applyFieldAccess(value, fields, context);
      expect(result).toBe('admin');
    });

    it('should resolve mixed property/index access', () => {
      const value = testData.items;
      const fields: FieldAccess[] = [
        { type: FieldAccessType.INDEX, key: 2 }, // Access { type: 'orange' }
        { type: FieldAccessType.PROPERTY, key: 'type' }
      ];
      const result = resolver.applyFieldAccess(value, fields, context);
      expect(result).toBe('orange');
    });

    it('should throw FieldAccessError for invalid property in strict mode', () => {
      const value = testData.user;
      const fields: FieldAccess[] = [{ type: FieldAccessType.PROPERTY, key: 'age' }];
      context = context.withFlags({ ...context.flags, strict: true });
      
      expect(() => resolver.applyFieldAccess(value, fields, context))
        .toThrow(FieldAccessError);
      expect(() => resolver.applyFieldAccess(value, fields, context))
        .toThrow("Field 'age' not found"); // Check message if possible
    });

    it('should return undefined for invalid property in non-strict mode', () => {
      const value = testData.user;
      const fields: FieldAccess[] = [{ type: FieldAccessType.PROPERTY, key: 'age' }];
      context = context.withFlags({ ...context.flags, strict: false });
      
      const result = resolver.applyFieldAccess(value, fields, context);
      expect(result).toBeUndefined(); // Or null, depending on implementation
    });

    it('should throw FieldAccessError for invalid index in strict mode', () => {
      const value = testData.items;
      const fields: FieldAccess[] = [{ type: FieldAccessType.INDEX, key: 5 }];
      context = context.withFlags({ ...context.flags, strict: true });
      
      expect(() => resolver.applyFieldAccess(value, fields, context))
        .toThrow(FieldAccessError);
       expect(() => resolver.applyFieldAccess(value, fields, context))
        .toThrow("Index 5 out of bounds");
    });

    it('should return undefined for invalid index in non-strict mode', () => {
      const value = testData.items;
      const fields: FieldAccess[] = [{ type: FieldAccessType.INDEX, key: 5 }];
      context = context.withFlags({ ...context.flags, strict: false });
      
      const result = resolver.applyFieldAccess(value, fields, context);
      expect(result).toBeUndefined();
    });

    it('should throw FieldAccessError for accessing property on non-object in strict mode', () => {
      const value = testData.primitive; // 'a string'
      const fields: FieldAccess[] = [{ type: FieldAccessType.PROPERTY, key: 'length' }];
      context = context.withFlags({ ...context.flags, strict: true });
      
      expect(() => resolver.applyFieldAccess(value, fields, context))
        .toThrow(FieldAccessError);
      expect(() => resolver.applyFieldAccess(value, fields, context))
        .toThrow("Cannot access property 'length' on type 'string'");
    });
    
    it('should return undefined for accessing property on non-object in non-strict mode', () => {
      const value = testData.primitive; // 'a string'
      const fields: FieldAccess[] = [{ type: FieldAccessType.PROPERTY, key: 'length' }];
      context = context.withFlags({ ...context.flags, strict: false });
      
      const result = resolver.applyFieldAccess(value, fields, context);
      expect(result).toBeUndefined();
    });

    it('should throw FieldAccessError for accessing index on non-array in strict mode', () => {
      const value = testData.user; // an object
      const fields: FieldAccess[] = [{ type: FieldAccessType.INDEX, key: 0 }];
      context = context.withFlags({ ...context.flags, strict: true });
      
      expect(() => resolver.applyFieldAccess(value, fields, context))
        .toThrow(FieldAccessError);
      expect(() => resolver.applyFieldAccess(value, fields, context))
        .toThrow("Cannot access index 0 on type 'object'");
    });

    it('should throw FieldAccessError when accessing field on null in strict mode', () => {
      const value = testData.nullValue; // null
      const fields: FieldAccess[] = [{ type: FieldAccessType.PROPERTY, key: 'any' }];
      context = context.withFlags({ ...context.flags, strict: true });
      
      expect(() => resolver.applyFieldAccess(value, fields, context))
        .toThrow(FieldAccessError);
       expect(() => resolver.applyFieldAccess(value, fields, context))
        .toThrow("Cannot access property 'any' on null or undefined value");
    });
    
  });
}); 