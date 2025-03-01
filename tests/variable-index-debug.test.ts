import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { VariableReferenceResolver } from '@services/resolution/ResolutionService/resolvers/VariableReferenceResolver.js';
import type { ResolutionContext } from '@services/resolution/ResolutionService/IResolutionService.js';

describe('VariableReferenceResolver Array Index Debug', () => {
  // Mock state service
  const mockStateService = {
    getTextVar: vi.fn(),
    getDataVar: vi.fn(),
    getPathVar: vi.fn(),
    getAllTextVars: vi.fn(() => ({})),
    getAllDataVars: vi.fn(() => ({})),
    isTransformationEnabled: vi.fn(() => true)
  };

  // Mock resolution service
  const mockResolutionService = {
    resolveInContext: vi.fn()
  };

  // Mock parser service with realistic node generation
  const mockParserService = {
    parse: vi.fn()
  };

  // Create a basic resolver
  const resolver = new VariableReferenceResolver(
    mockStateService as any, 
    mockResolutionService as any,
    mockParserService as any
  );

  // Basic context
  const context: ResolutionContext = {
    state: mockStateService as any,
    baseDir: '/',
    strict: true,
    allowedVariableTypes: { text: true, data: true }
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Setup transformation enabled by default
    mockStateService.isTransformationEnabled.mockReturnValue(true);
  });

  it('should correctly handle field access for arrays with numeric indices via resolveFieldAccess', async () => {
    // Setup test data
    const array = ["apple", "banana", "cherry"];
    const simpleObj = { name: "Alice", age: 30 };
    const objArray = [
      { name: "Alice", age: 30 },
      { name: "Bob", age: 25 }
    ];
    const nestedObj = {
      users: [
        { name: "Alice", hobbies: ["reading", "hiking"] },
        { name: "Bob", hobbies: ["gaming", "cooking"] }
      ]
    };

    // We need to test the implementation of resolveFieldAccess directly
    // Create a wrapper function that simulates variable resolution
    const resolveFieldAccess = async (obj: any, fields: string[], ctx: ResolutionContext) => {
      // Add a helper function to the resolver instance 
      const privateResolver = resolver as any;
      
      // Create a mock variable name for testing
      const mockVarName = "testVar";
      
      // Mock the getVariable method to return our object
      privateResolver.getVariable = vi.fn().mockResolvedValue(obj);
      
      // Convert fields array to dotted path string
      const fieldPath = fields.join('.');
      
      // Call the actual resolveFieldAccess with our mocked variable
      return privateResolver.resolveFieldAccess(mockVarName, fieldPath, ctx);
    };

    // Test simple array access
    let result = await resolveFieldAccess(array, ["0"], context);
    expect(result).toBe("apple");

    // Test out of bounds array access
    await expect(resolveFieldAccess(array, ["5"], context)).rejects.toThrow(/out of bounds/);

    // Test object array access
    result = await resolveFieldAccess(objArray, ["0"], context);
    expect(result).toEqual({ name: "Alice", age: 30 });

    // Test nested array access
    result = await resolveFieldAccess(objArray, ["0", "name"], context);
    expect(result).toBe("Alice");

    // Test complex nested access
    result = await resolveFieldAccess(nestedObj, ["users", "0", "hobbies", "1"], context);
    expect(result).toBe("hiking");
  });

  it('should correctly debug field access with various inputs', async () => {
    // Setup test data
    const array = ["apple", "banana", "cherry"];
    const objArray = [
      { name: "Alice", age: 30 },
      { name: "Bob", age: 25 }
    ];

    // Use the debug method to test functionality
    const debugFieldAccess = (resolver as any).debugFieldAccess.bind(resolver);

    // Test array access
    let result = debugFieldAccess(array, ["0"], context);
    expect(result.result).toBe("apple");

    // Test object array access
    result = debugFieldAccess(objArray, ["0", "name"], context);
    expect(result.result).toBe("Alice");
  });

  it('should correctly resolve array indices in variable references', async () => {
    // Setup mock for parser to return realistic nodes
    mockParserService.parse.mockImplementation((text) => {
      if (text === '{{items.0}}') {
        return [
          {
            type: 'DataVar',
            identifier: 'items',
            fields: [
              { type: 'index', value: 0 }
            ]
          }
        ];
      } else if (text === '{{users.0.name}}') {
        return [
          {
            type: 'DataVar',
            identifier: 'users',
            fields: [
              { type: 'index', value: 0 },
              { type: 'identifier', value: 'name' }
            ]
          }
        ];
      }
      return [];
    });

    // Setup mock data
    mockStateService.getDataVar.mockImplementation((name) => {
      if (name === 'items') {
        return ["apple", "banana", "cherry"];
      } else if (name === 'users') {
        return [
          { name: "Alice", age: 30 },
          { name: "Bob", age: 25 }
        ];
      }
      return undefined;
    });
    
    // Add a mock for getVariable to handle direct variable resolution
    (resolver as any).getVariable = async (name: string) => {
      return mockStateService.getDataVar(name);
    };

    // Test simple array access
    let result = await resolver.resolve('{{items.0}}', context);
    expect(result).toBe('apple');

    // Test nested object property access
    result = await resolver.resolve('{{users.0.name}}', context);
    expect(result).toBe('Alice');
  });
}); 