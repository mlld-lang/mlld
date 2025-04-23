import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { VariableReferenceResolver } from '@services/resolution/ResolutionService/resolvers/VariableReferenceResolver';
import type { ResolutionContext } from '@services/resolution/ResolutionService/IResolutionService';
import { TestContextDI } from '@tests/utils/di/TestContextDI';
import { FieldAccess, FieldAccessType, FieldAccessError } from '@services/resolution/ResolutionService/resolvers/FieldAccess';

/**
 * This test file follows a hybrid approach:
 * 
 * 1. It maintains the focused unit test approach to directly test the VariableReferenceResolver
 *    in isolation with controlled inputs and outputs, which is ideal for testing complex resolution logic.
 * 
 * 2. It uses TestContextDI for managing the test lifecycle and mock registration, aligning with
 *    the project's DI-based testing infrastructure while preserving the benefits of isolated testing.
 * 
 * This approach was chosen intentionally to balance:
 * - The need to test this complex component in isolation
 * - The consistency benefits of using the project's DI testing infrastructure
 * - Better maintainability as the codebase evolves
 */
describe('VariableReferenceResolver Array Index Debug', () => {
  // Use TestContextDI for service mocking
  let testContext: TestContextDI;
  
  // Mock services
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
  let resolver: VariableReferenceResolver;

  // Basic context
  let context: ResolutionContext;

  beforeEach(async () => {
    // Create a test context with isolated container
    testContext = TestContextDI.createIsolated();
    await testContext.initialize();
    
    // Register our mock services
    testContext.registerMock('IStateService', mockStateService);
    testContext.registerMock('IResolutionService', mockResolutionService);
    testContext.registerMock('IParserService', mockParserService);
    
    // Create a resolver with our mocked services
    resolver = new VariableReferenceResolver(
      mockStateService as any, 
      mockResolutionService as any,
      mockParserService as any
    );

    // Set up basic resolution context
    context = {
      currentFilePath: 'test.meld',
      allowedVariableTypes: { 
        text: true, 
        data: true, 
        path: false, 
        command: false 
      },
      strict: true,
      state: mockStateService as any
    };
    
    // Clear all mocks
    vi.clearAllMocks();
    
    // Setup transformation enabled by default
    mockStateService.isTransformationEnabled.mockReturnValue(true);
  });

  afterEach(async () => {
    // Clean up the test context
    await testContext.cleanup();
  });

  it('should correctly handle field access for arrays with numeric indices via accessFields', async () => {
    // Setup test data
    const array = ['apple', 'banana', 'cherry'];
    const objArray = [
      { name: 'Alice', age: 30 },
      { name: 'Bob', age: 25 }
    ];
    const nestedObj = {
      users: [
        { name: 'Alice', hobbies: ['reading', 'hiking'] },
        { name: 'Bob', hobbies: ['gaming', 'cooking'] }
      ]
    };

    // Test the public accessFields method directly
    // Assuming resolver has: accessFields(value: JsonValue, fields: FieldAccess[], context: ResolutionContext): Result<JsonValue, FieldAccessError>

    // Test simple array access
    let fields: FieldAccess[] = [{ type: FieldAccessType.INDEX, key: 0 }];
    let result = await resolver.accessFields(array, fields, context);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe('apple');

    // Test out of bounds array access (strict mode)
    fields = [{ type: FieldAccessType.INDEX, key: 5 }];
    context = context.withFlags({ ...context.flags, strict: true });
    result = await resolver.accessFields(array, fields, context);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(FieldAccessError);
      expect(result.error.code).toBe('INDEX_OUT_OF_BOUNDS');
    }
    
    // Test out of bounds array access (non-strict mode)
    context = context.withFlags({ ...context.flags, strict: false });
    result = await resolver.accessFields(array, fields, context);
    expect(result.ok).toBe(true); // Non-strict might return success with undefined/null value
    if (result.ok) expect(result.value).toBeUndefined(); // Or null

    // Test object array access (preserve type)
    fields = [{ type: FieldAccessType.INDEX, key: 0 }];
    // Use context.withFormattingContext if that's how preserveType is passed
    // Assuming context needs a way to specify preserveType for accessFields
    const preserveTypeContext = { ...context, flags: { ...context.flags, preserveType: true }}; // Example way to pass flag
    result = await resolver.accessFields(objArray, fields, preserveTypeContext);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ name: 'Alice', age: 30 });
    }

    // Test nested array access
    fields = [
        { type: FieldAccessType.INDEX, key: 0 }, 
        { type: FieldAccessType.PROPERTY, key: 'name' } 
    ];
    result = await resolver.accessFields(objArray, fields, context);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe('Alice');

    // Test complex nested access
    fields = [
        { type: FieldAccessType.PROPERTY, key: 'users' }, 
        { type: FieldAccessType.INDEX, key: 0 }, 
        { type: FieldAccessType.PROPERTY, key: 'hobbies' }, 
        { type: FieldAccessType.INDEX, key: 1 }
    ];
    result = await resolver.accessFields(nestedObj, fields, context);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe('hiking');
  });

  it('should correctly resolve array indices in variable references', async () => {
    // Setup mock for parser to return realistic nodes
    mockParserService.parse.mockImplementation((text) => {
      if (text === '{{items.0}}') {
        return [
          {
            type: 'VariableReference',
            identifier: 'items',
            valueType: 'data',
            isVariableReference: true,
            fields: [
              { type: 'index', value: 0 }
            ]
          }
        ];
      } else if (text === '{{users.0.name}}') {
        return [
          {
            type: 'VariableReference',
            identifier: 'users',
            valueType: 'data',
            isVariableReference: true,
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
        return ['apple', 'banana', 'cherry'];
      } else if (name === 'users') {
        return [
          { name: 'Alice', age: 30 },
          { name: 'Bob', age: 25 }
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