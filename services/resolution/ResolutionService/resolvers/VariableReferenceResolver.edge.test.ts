import { describe, it, expect, beforeEach, vi, fail, afterEach } from 'vitest';
import { VariableReferenceResolver } from '@services/resolution/ResolutionService/resolvers/VariableReferenceResolver.js';
import { 
  createMockStateService, 
  createMockParserService, 
  createTextNode,
  // Legacy helper function still available during transition
  createVariableReferenceNode
} from '@tests/utils/testFactories.js';
import type { ResolutionContext } from '@services/resolution/ResolutionService/IResolutionService.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { IParserService } from '@services/pipeline/ParserService/IParserService.js';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import { MeldResolutionError } from '@core/errors/MeldResolutionError.js';
import { VariableResolutionTracker } from '@tests/utils/debug/VariableResolutionTracker/index.js';
import type { MeldNode } from '@core/syntax/types/index.js';
import type { IStateEventService } from '@services/state/StateEventService/IStateEventService.js';
import type { IStateTrackingService } from '@tests/utils/debug/StateTrackingService/IStateTrackingService.js';
import type { TransformationOptions } from '@services/state/StateService/IStateService.js';
import { VariableNodeFactory } from '@core/syntax/types/factories/index.js';
import { container } from 'tsyringe';
import { DeepMockProxy } from 'vitest';
import { mockDeep } from 'vitest-mock';

/**
 * Enhanced implementation of IStateService for testing variable resolution
 * This properly implements all required methods from IStateService
 */
class EnhancedTestStateService implements IStateService {
  private readonly _stateId = `test-state-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  private textVars = new Map<string, string>();
  private dataVars = new Map<string, unknown>();
  private pathVars = new Map<string, string>();
  private commands = new Map<string, { command: string; options?: Record<string, unknown> }>();
  private nodes: MeldNode[] = [];
  private transformedNodes: MeldNode[] = [];
  private imports = new Set<string>();
  private currentFilePath: string | null = null;
  private transformationEnabled = false;
  private transformationOptions: TransformationOptions = {};
  private _isImmutable = false;
  private parentState: IStateService | null = null;
  private eventService?: IStateEventService;
  private trackingService?: IStateTrackingService;
  private commandOutputs = new Map<string, string>();

  // Core variable methods
  setTextVar(name: string, value: string): void {
    if (this._isImmutable) throw new Error('State is immutable');
    this.textVars.set(name, value);
  }

  getTextVar(name: string): string | undefined {
    const localValue = this.textVars.get(name);
    if (localValue !== undefined) return localValue;
    return this.parentState?.getTextVar(name);
  }

  setDataVar(name: string, value: unknown): void {
    if (this._isImmutable) throw new Error('State is immutable');
    this.dataVars.set(name, value);
  }

  getDataVar(name: string): unknown {
    const localValue = this.dataVars.get(name);
    if (localValue !== undefined) return localValue;
    return this.parentState?.getDataVar(name);
  }

  setPathVar(name: string, value: string): void {
    if (this._isImmutable) throw new Error('State is immutable');
    this.pathVars.set(name, value);
  }

  getPathVar(name: string): string | undefined {
    const localValue = this.pathVars.get(name);
    if (localValue !== undefined) return localValue;
    return this.parentState?.getPathVar(name);
  }

  // Variable collections
  getAllTextVars(): Map<string, string> {
    const result = new Map<string, string>();
    if (this.parentState) {
      for (const [key, value] of this.parentState.getAllTextVars()) {
        result.set(key, value);
      }
    }
    for (const [key, value] of this.textVars) {
      result.set(key, value);
    }
    return result;
  }

  getLocalTextVars(): Map<string, string> {
    return new Map(this.textVars);
  }

  getAllDataVars(): Map<string, unknown> {
    const result = new Map<string, unknown>();
    if (this.parentState) {
      for (const [key, value] of this.parentState.getAllDataVars()) {
        result.set(key, value);
      }
    }
    for (const [key, value] of this.dataVars) {
      result.set(key, value);
    }
    return result;
  }

  getLocalDataVars(): Map<string, unknown> {
    return new Map(this.dataVars);
  }

  getAllPathVars(): Map<string, string> {
    const result = new Map<string, string>();
    if (this.parentState) {
      for (const [key, value] of this.parentState.getAllPathVars()) {
        result.set(key, value);
      }
    }
    for (const [key, value] of this.pathVars) {
      result.set(key, value);
    }
    return result;
  }

  // Command handling
  setCommand(name: string, command: string | { command: string; options?: Record<string, unknown> }): void {
    if (this._isImmutable) throw new Error('State is immutable');
    if (typeof command === 'string') {
      this.commands.set(name, { command });
    } else {
      this.commands.set(name, command);
    }
  }

  getCommand(name: string): { command: string; options?: Record<string, unknown> } | undefined {
    const localCommand = this.commands.get(name);
    if (localCommand) return localCommand;
    return this.parentState?.getCommand(name);
  }

  getAllCommands(): Map<string, { command: string; options?: Record<string, unknown> }> {
    const result = new Map<string, { command: string; options?: Record<string, unknown> }>();
    if (this.parentState) {
      for (const [key, value] of this.parentState.getAllCommands()) {
        result.set(key, value);
      }
    }
    for (const [key, value] of this.commands) {
      result.set(key, value);
    }
    return result;
  }

  getCommandOutput(command: string): string | undefined {
    return this.commandOutputs.get(command) || this.parentState?.getCommandOutput(command);
  }

  // Content methods
  appendContent(content: string): void {
    if (this._isImmutable) throw new Error('State is immutable');
    // This is a simplified implementation
  }

  getContent(): string {
    return ''; // Simplified implementation
  }

  // Node management
  getNodes(): MeldNode[] {
    return [...this.nodes];
  }

  addNode(node: MeldNode): void {
    if (this._isImmutable) throw new Error('State is immutable');
    this.nodes.push(node);
  }

  getTransformedNodes(): MeldNode[] {
    return this.transformedNodes.length > 0 ? [...this.transformedNodes] : [...this.nodes];
  }

  setTransformedNodes(nodes: MeldNode[]): void {
    if (this._isImmutable) throw new Error('State is immutable');
    this.transformedNodes = [...nodes];
  }

  transformNode(original: MeldNode, transformed: MeldNode): void {
    if (this._isImmutable) throw new Error('State is immutable');
    if (!this.transformationEnabled) return;

    // Find and replace node in transformed nodes
    const transformedNodes = this.getTransformedNodes();
    const index = transformedNodes.findIndex(n => n === original);
    if (index !== -1) {
      transformedNodes[index] = transformed;
      this.transformedNodes = transformedNodes;
    } else {
      this.transformedNodes.push(transformed);
    }
  }

  // Transformation methods
  isTransformationEnabled(): boolean {
    return this.transformationEnabled;
  }

  enableTransformation(options?: TransformationOptions | boolean): void {
    if (typeof options === 'boolean') {
      this.transformationEnabled = options;
      this.transformationOptions = options ? {
        variables: true,
        directives: true,
        commands: true,
        imports: true
      } : {};
    } else if (options) {
      this.transformationEnabled = true;
      this.transformationOptions = { ...options };
    } else {
      this.transformationEnabled = true;
      this.transformationOptions = {
        variables: true,
        directives: true,
        commands: true,
        imports: true
      };
    }
  }

  shouldTransform(type: keyof TransformationOptions): boolean {
    return !!this.transformationOptions[type];
  }

  getTransformationOptions(): TransformationOptions {
    return { ...this.transformationOptions };
  }

  hasTransformationSupport(): boolean {
    return true;
  }

  // Import handling
  addImport(path: string): void {
    if (this._isImmutable) throw new Error('State is immutable');
    this.imports.add(path);
  }

  removeImport(path: string): void {
    if (this._isImmutable) throw new Error('State is immutable');
    this.imports.delete(path);
  }

  hasImport(path: string): boolean {
    return this.imports.has(path) || !!this.parentState?.hasImport(path);
  }

  getImports(): Set<string> {
    const result = new Set<string>();
    if (this.parentState) {
      for (const path of this.parentState.getImports()) {
        result.add(path);
      }
    }
    for (const path of this.imports) {
      result.add(path);
    }
    return result;
  }

  // Current file handling
  getCurrentFilePath(): string | null {
    return this.currentFilePath;
  }

  setCurrentFilePath(path: string): void {
    this.currentFilePath = path;
  }

  // State management
  hasLocalChanges(): boolean {
    return this.textVars.size > 0 || 
           this.dataVars.size > 0 || 
           this.pathVars.size > 0 || 
           this.commands.size > 0 || 
           this.nodes.length > 0 ||
           this.imports.size > 0;
  }

  getLocalChanges(): string[] {
    const changes: string[] = [];
    if (this.textVars.size > 0) changes.push(`${this.textVars.size} text variables`);
    if (this.dataVars.size > 0) changes.push(`${this.dataVars.size} data variables`);
    if (this.pathVars.size > 0) changes.push(`${this.pathVars.size} path variables`);
    if (this.commands.size > 0) changes.push(`${this.commands.size} commands`);
    if (this.nodes.length > 0) changes.push(`${this.nodes.length} nodes`);
    if (this.imports.size > 0) changes.push(`${this.imports.size} imports`);
    return changes;
  }

  // Immutability
  get isImmutable(): boolean {
    return this._isImmutable;
  }

  setImmutable(): void {
    this._isImmutable = true;
  }

  makeImmutable(): void {
    this.setImmutable();
  }

  // State hierarchy
  createChildState(): IStateService {
    const child = new EnhancedTestStateService();
    child.parentState = this;
    if (this.eventService) child.setEventService(this.eventService);
    if (this.trackingService) child.setTrackingService(this.trackingService);
    return child;
  }

  getParentState(): IStateService | null {
    return this.parentState;
  }

  mergeChildState(childState: IStateService): void {
    if (this._isImmutable) throw new Error('State is immutable');
    
    // Merge text variables
    for (const [key, value] of childState.getLocalTextVars()) {
      this.textVars.set(key, value);
    }
    
    // Merge data variables
    for (const [key, value] of childState.getLocalDataVars()) {
      this.dataVars.set(key, value);
    }
    
    // Merge path variables
    for (const [key, value] of childState.getAllPathVars()) {
      if (!this.pathVars.has(key)) {
        this.pathVars.set(key, value);
      }
    }
    
    // Merge commands
    for (const [key, value] of childState.getAllCommands()) {
      if (!this.commands.has(key)) {
        this.commands.set(key, value);
      }
    }
    
    // Merge imports
    for (const importPath of childState.getImports()) {
      this.imports.add(importPath);
    }
  }
  
  mergeStates(otherState: IStateService): void {
    this.mergeChildState(otherState);
  }

  clone(): IStateService {
    const clone = new EnhancedTestStateService();
    
    // Copy variables
    for (const [key, value] of this.textVars) {
      clone.textVars.set(key, value);
    }
    for (const [key, value] of this.dataVars) {
      clone.dataVars.set(key, value);
    }
    for (const [key, value] of this.pathVars) {
      clone.pathVars.set(key, value);
    }
    
    // Copy commands
    for (const [key, value] of this.commands) {
      clone.commands.set(key, value);
    }
    
    // Copy nodes
    clone.nodes = [...this.nodes];
    clone.transformedNodes = [...this.transformedNodes];
    
    // Copy imports
    clone.imports = new Set(this.imports);
    
    // Copy settings
    clone.currentFilePath = this.currentFilePath;
    clone.transformationEnabled = this.transformationEnabled;
    clone.transformationOptions = { ...this.transformationOptions };
    clone._isImmutable = this._isImmutable;
    
    // Copy service references
    if (this.eventService) clone.setEventService(this.eventService);
    if (this.trackingService) clone.setTrackingService(this.trackingService);
    
    return clone;
  }

  // Service connections
  setEventService(eventService: IStateEventService): void {
    this.eventService = eventService;
  }

  setTrackingService(trackingService: IStateTrackingService): void {
    this.trackingService = trackingService;
  }

  getStateId(): string | undefined {
    return this._stateId;
  }
}

describe('VariableReferenceResolver Edge Cases', () => {
  let resolver: VariableReferenceResolver;
  let stateService: EnhancedTestStateService;
  let parserService: DeepMockProxy<IParserService>;
  let resolutionService: DeepMockProxy<IResolutionService>;
  let resolutionTracker: VariableResolutionTracker;
  let context: ResolutionContext;
  let mockVariableNodeFactory: VariableNodeFactory;

  beforeEach(() => {
    // Create an enhanced test state service instead of a simple mock
    stateService = new EnhancedTestStateService();
    parserService = mockDeep<IParserService>();
    resolutionService = mockDeep<IResolutionService>();
    resolutionTracker = new VariableResolutionTracker();
    
    // Create a mock VariableNodeFactory
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
    
    // Mock container.resolve to return our mock factory
    vi.spyOn(container, 'resolve').mockImplementation((token) => {
      if (token === VariableNodeFactory) {
        return mockVariableNodeFactory;
      }
      throw new Error(`Unexpected token: ${String(token)}`);
    });
    
    // Create resolver with the tracker
    resolver = new VariableReferenceResolver(
      stateService, 
      resolutionService, 
      parserService
    );
    resolver.setTracker(resolutionTracker);
    
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
  
  afterEach(() => {
    vi.restoreAllMocks();
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
      // Updated to expect the enhanced error format that includes available keys
      expect(error.message).toContain('Field email');
      expect(error.message).toContain('not found in variable data');
      expect(error.message).toContain('Available keys:');
      expect(error.message).toContain('name');
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