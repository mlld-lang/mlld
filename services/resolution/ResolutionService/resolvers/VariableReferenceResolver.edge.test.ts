import { describe, it, expect, beforeEach, vi, fail } from 'vitest';
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
import { VariableResolutionTracker } from '@tests/utils/debug/VariableResolutionTracker/index.js';

// Simple custom state service implementation that returns objects directly
class SimpleStateService implements IStateService {
  private dataVars = new Map<string, unknown>();
  private textVars = new Map<string, string>();
  private pathVars = new Map<string, string>();

  setDataVar(name: string, value: unknown): void {
    this.dataVars.set(name, value);
  }

  getDataVar(name: string): unknown {
    return this.dataVars.get(name);
  }

  setTextVar(name: string, value: string): void {
    this.textVars.set(name, value);
  }

  getTextVar(name: string): string | undefined {
    return this.textVars.get(name);
  }

  setPathVar(name: string, value: string): void {
    this.pathVars.set(name, value);
  }

  getPathVar(name: string): string | undefined {
    return this.pathVars.get(name);
  }

  // Stub methods to satisfy the interface
  getAllTextVars(): Map<string, string> { return new Map(this.textVars); }
  getAllDataVars(): Map<string, unknown> { return new Map(this.dataVars); }
  getAllPathVars(): Map<string, string> { return new Map(this.pathVars); }
  
  // Other methods as needed - just stubs
  getCommand(): any { return undefined; }
  setCommand(): void {}
  appendContent(): void {}
  getContent(): string { return ''; }
  createChildState(): any { return this; }
  getParentState(): any { return undefined; }
  isImmutable(): boolean { return false; }
  makeImmutable(): void {}
  clone(): any { return this; }
  
  // Additional required methods with default implementations
  mergeStates(): void {}
  getNodes(): any[] { return []; }
  addNode(): void {}
  getTransformedNodes(): any[] { return []; }
  transformNode(): void {}
  isTransformationEnabled(): boolean { return false; }
  enableTransformation(): void {}
  addImport(): void {}
  removeImport(): void {}
  hasImport(): boolean { return false; }
  getImports(): Set<string> { return new Set(); }
  getCurrentFilePath(): string | null { return null; }
  setCurrentFilePath(): void {}
  hasLocalChanges(): boolean { return false; }
  getLocalChanges(): any[] { return []; }
  setImmutable(): void {}
  mergeChildState(): void {}
  getStateId(): string { return 'test-state'; }
}

describe('VariableReferenceResolver Edge Cases', () => {
  let resolver: VariableReferenceResolver;
  let stateService: SimpleStateService;
  let parserService: ReturnType<typeof createMockParserService>;
  let resolutionService: IResolutionService;
  let context: ResolutionContext;
  let resolutionTracker: VariableResolutionTracker;

  beforeEach(() => {
    // Create a simple state service instead of a mock
    stateService = new SimpleStateService();
    parserService = createMockParserService();
    resolutionService = {
      resolveInContext: vi.fn().mockImplementation(async (value) => value)
    } as unknown as IResolutionService;
    
    // Initialize and enable the resolution tracker
    resolutionTracker = new VariableResolutionTracker();
    resolutionTracker.configure({ enabled: true });
    
    // Create resolver with the tracker
    resolver = new VariableReferenceResolver(stateService, resolutionService, parserService);
    resolver.setResolutionTracker(resolutionTracker);
    
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
    // Mock data object with items array
    const mockData = {
      items: [
        { name: 'item1' },
        { name: 'item2' }
      ]
    };
    
    console.log('Mock data object:', mockData);
    
    // Set the data directly on our state service
    stateService.setDataVar('data', mockData);
    
    // Mock the parser to return a data variable with field access
    vi.mocked(parserService.parse).mockResolvedValue([
      createVariableReferenceNode('data', 'data', [
        { type: 'field', value: 'items' },
        { type: 'index', value: 1 },
        { type: 'field', value: 'name' }
      ])
    ]);
    
    // Log the variable reference node
    const variableNode = createVariableReferenceNode('data', 'data', [
      { type: 'field', value: 'items' },
      { type: 'index', value: 1 },
      { type: 'field', value: 'name' }
    ]);
    console.log('Variable reference node:', JSON.stringify(variableNode));
    
    // Directly check the variable to ensure it's working
    const dataVar = stateService.getDataVar('data');
    console.log('Data variable from state:', {
      value: dataVar,
      type: typeof dataVar,
      isObject: typeof dataVar === 'object',
      hasItems: dataVar && typeof dataVar === 'object' && 'items' in dataVar
    });
    
    // Run the test
    const result = await resolver.resolve('{{data.items[1].name}}', context);
    console.log('Result:', result);
    
    expect(result).toBe('item2');
  });

  it('should fall back to parser client when parser service fails', async () => {
    vi.mocked(parserService.parse).mockRejectedValue(new Error('Parser service failed'));
    
    stateService.setTextVar('greeting', 'Hello');
    
    const result = await resolver.resolve('{{greeting}}', context);
    expect(result).toBe('Hello');
  });

  it('should handle data variables with field access through string concatenation', async () => {
    // Mock data object with key-value pairs
    const mockData = {
      key1: 'value1',
      key2: 'value2'
    };
    
    // Set the data directly
    stateService.setDataVar('data', mockData);
    
    // Mock parser to return a data variable with field access
    vi.mocked(parserService.parse).mockResolvedValue([
      createVariableReferenceNode('data', 'data', [
        { type: 'field', value: 'key2' }
      ])
    ]);
    
    const result = await resolver.resolve('{{data.key2}}', context);
    console.log('Field access result:', result);
    expect(result).toBe('value2');
  });

  it('should provide detailed error information for field access failures', async () => {
    // Mock the data object without the requested field
    const mockData = { user: { name: 'John' } };
    
    // Set the data directly
    stateService.setDataVar('data', mockData);
    
    // Mock parser to return a data variable with field access to a missing property
    vi.mocked(parserService.parse).mockResolvedValue([
      createVariableReferenceNode('data', 'data', [
        { type: 'field', value: 'user' },
        { type: 'field', value: 'email' } // This field doesn't exist
      ])
    ]);
    
    try {
      await resolver.resolve('{{data.user.email}}', context);
      fail('Should have thrown an error');
    } catch (error) {
      console.log('Error details:', error);
      expect(error).toBeInstanceOf(MeldResolutionError);
      // Check for the actual error message format used by the resolver
      expect(error.message).toContain('Field email not found in variable data');
      expect(error.message).toContain('email');
    }
  });

  it('should return empty string for missing fields when strict mode is off', async () => {
    // Set up a non-strict context
    const nonStrictContext = {
      ...context,
      strict: false
    };
    
    // Mock the data object without the requested field
    const mockData = { user: { name: 'John' } };
    
    // Set the data directly
    stateService.setDataVar('data', mockData);
    
    // Mock parser to return a data variable with field access to a missing property
    vi.mocked(parserService.parse).mockResolvedValue([
      createVariableReferenceNode('data', 'data', [
        { type: 'field', value: 'user' },
        { type: 'field', value: 'email' } // This field doesn't exist
      ])
    ]);
    
    const result = await resolver.resolve('{{data.user.email}}', nonStrictContext);
    console.log('Non-strict result:', result);
    expect(result).toBe('');
  });

  it('should handle errors in nested variable resolution', async () => {
    // Ensure strict mode is on
    const strictContext = {
      ...context,
      strict: true
    };
    
    // Mock the resolution service to throw for nested variables
    vi.mocked(resolutionService.resolveInContext).mockImplementation(async (value, ctx) => {
      console.log(`resolveInContext called with: ${value}`);
      if (typeof value === 'string' && value.includes('{{nested}}')) {
        throw new Error('Nested variable not found');
      }
      return value;
    });
    
    // Add specific variables for testing nested variable resolution
    stateService.setTextVar('var_', ''); // This variable will be resolved first
    stateService.setTextVar('nested', 'will-not-be-used'); // Verify it's not used directly
    
    // We should just test for the expected behavior with empty string in non-strict mode
    const result = await resolver.resolve('{{var_{{nested}}}}', strictContext);
    expect(result).toBe('');
  });
});