import type { MeldNode, TextNode } from 'meld-spec';
import { stateLogger as logger } from '@core/utils/logger.js';
import type { IStateService, TransformationOptions } from './IStateService.js';
import type { StateNode, CommandDefinition } from './types.js';
import { StateFactory } from './StateFactory.js';
import type { IStateEventService, StateEvent } from '../StateEventService/IStateEventService.js';
import type { IStateTrackingService } from '@tests/utils/debug/StateTrackingService/IStateTrackingService.js';
import { inject, container, injectable } from 'tsyringe';
import { Service } from '@core/ServiceProvider.js';
import { IServiceMediator } from '@services/mediator/IServiceMediator.js';

// Helper function to get the container
function getContainer() {
  return container;
}

/**
 * Service for managing state in Meld files
 * 
 * Handles variables, imports, commands, nodes, and state transformations
 */
@injectable()
@Service({
  description: 'Service responsible for managing state in Meld files'
})
export class StateService implements IStateService {
  // Initialize with default or it will be set in initialization methods
  private stateFactory: StateFactory = new StateFactory();
  private currentState!: StateNode;
  private _isImmutable: boolean = false;
  private _transformationEnabled: boolean = false;
  private _transformationOptions: TransformationOptions = {
    variables: false,
    directives: false,
    commands: false,
    imports: false
  };
  private eventService?: IStateEventService;
  private trackingService?: IStateTrackingService;
  private serviceMediator?: IServiceMediator;

  /**
   * Creates a new StateService instance using dependency injection
   * 
   * @param stateFactory - Factory for creating state nodes and managing state operations
   * @param eventService - Service for handling state events and notifications
   * @param trackingService - Service for tracking state changes and relationships (used for debugging)
   * @param serviceMediator - Mediator for resolving circular dependencies with other services
   * @param parentState - Optional parent state to inherit from (used for nested imports)
   */
  constructor(
    @inject(StateFactory) stateFactory?: StateFactory,
    @inject('IStateEventService') eventService?: IStateEventService,
    @inject('IStateTrackingService') trackingService?: IStateTrackingService,
    @inject('IServiceMediator') serviceMediator?: IServiceMediator,
    parentState?: IStateService
  ) {
    this.initializeFromParams(stateFactory, eventService, trackingService, serviceMediator, parentState);
  }

  /**
   * Initialize this service with the given parameters
   * Using DI-only mode
   */
  private initializeFromParams(
    stateFactory?: StateFactory,
    eventService?: IStateEventService | IStateService,
    trackingService?: IStateTrackingService,
    serviceMediator?: IServiceMediator,
    parentState?: IStateService
  ): void {
    // Always use DI mode
    if (stateFactory) {
      this.stateFactory = stateFactory;
      this.eventService = eventService as IStateEventService;
      this.trackingService = trackingService;
      this.serviceMediator = serviceMediator;
      
      // Register this service with the mediator if available
      if (this.serviceMediator && typeof this.serviceMediator.setStateService === 'function') {
        try {
          this.serviceMediator.setStateService(this);
        } catch (error) {
          console.warn('Failed to register StateService with ServiceMediator:', error);
        }
      }
      
      this.initializeState(parentState);
    } else {
      // This branch should not be reached in DI-only mode, but keeping as fallback
      // Creating a default factory for robustness
      logger.warn('StateService initialized without factory in DI-only mode');
      this.stateFactory = new StateFactory();
      
      // Use event service if provided as first parameter
      if (eventService && !(eventService as IStateService).createChildState) {
        this.eventService = eventService as IStateEventService;
      }
      
      // Store tracking service and mediator if provided
      this.trackingService = trackingService;
      this.serviceMediator = serviceMediator;
      
      // Register with mediator if available
      if (this.serviceMediator) {
        this.serviceMediator.setStateService(this);
      }
      
      // Initialize state with parent if provided
      const actualParentState = parentState || 
        (eventService && (eventService as IStateService).createChildState ? 
          eventService as IStateService : undefined);
      
      this.initializeState(actualParentState);
    }
  }

  /**
   * Initialize the service or re-initialize it
   * Can be used to reset the service to initial state
   * 
   * @deprecated Use constructor injection instead. This method will be removed in a future version.
   * @param eventService - Optional event service to use
   * @param parentState - Optional parent state to inherit from
   */
  initialize(eventService?: IStateEventService, parentState?: IStateService): void {
    logger.warn('StateService.initialize is deprecated. Use constructor injection instead.');
    
    // For backward compatibility, if the eventService was provided, use it
    if (eventService) {
      this.eventService = eventService;
    }
    
    // Initialize state with parent state
    this.initializeState(parentState);
  }

  /**
   * Initialize the state, either as a fresh state or as a child of a parent state
   */
  private initializeState(parentState?: IStateService): void {
    this.currentState = this.stateFactory.createState({
      source: 'new',
      parentState: parentState ? (parentState as StateService).currentState : undefined
    });

    // If parent has services, inherit them
    if (parentState) {
      const parent = parentState as StateService;
      
      // Inherit services if not already set
      if (!this.eventService && parent.eventService) {
        this.eventService = parent.eventService;
      }
      if (!this.trackingService && parent.trackingService) {
        this.trackingService = parent.trackingService;
      }
      if (!this.serviceMediator && parent.serviceMediator) {
        this.setServiceMediator(parent.serviceMediator);
      }
    }

    // Register state with tracking service if available
    if (this.trackingService) {
      const parentId = parentState ? (parentState as StateService).currentState.stateId : undefined;
      
      // Register the state with the pre-generated ID
      this.trackingService.registerState({
        id: this.currentState.stateId,
        parentId,
        filePath: this.currentState.filePath,
        createdAt: Date.now(),
        transformationEnabled: this._transformationEnabled,
        source: 'child'
      });
      
      // Explicitly register parent-child relationship if parent exists
      if (parentState && parentId) {
        this.trackingService.registerRelationship({
          sourceId: parentId,
          targetId: this.currentState.stateId,
          type: 'parent-child',
          timestamp: Date.now(),
          source: 'child'
        });
      }
    }
  }

  setEventService(eventService: IStateEventService): void {
    this.eventService = eventService;
  }

  private async emitEvent(event: StateEvent): Promise<void> {
    if (this.eventService) {
      await this.eventService.emit(event);
    }
  }

  // Text variables
  getTextVar(name: string): string | undefined {
    return this.currentState.variables.text.get(name);
  }

  setTextVar(name: string, value: string): void {
    this.checkMutable();
    const text = new Map(this.currentState.variables.text);
    text.set(name, value);
    this.updateState({
      variables: {
        ...this.currentState.variables,
        text
      }
    }, `setTextVar:${name}`);
  }

  getAllTextVars(): Map<string, string> {
    return new Map(this.currentState.variables.text);
  }

  getLocalTextVars(): Map<string, string> {
    return new Map(this.currentState.variables.text);
  }

  // Data variables
  getDataVar(name: string): unknown {
    return this.currentState.variables.data.get(name);
  }

  setDataVar(name: string, value: unknown): void {
    this.checkMutable();
    const data = new Map(this.currentState.variables.data);
    data.set(name, value);
    this.updateState({
      variables: {
        ...this.currentState.variables,
        data
      }
    }, `setDataVar:${name}`);
  }

  getAllDataVars(): Map<string, unknown> {
    return new Map(this.currentState.variables.data);
  }

  getLocalDataVars(): Map<string, unknown> {
    return new Map(this.currentState.variables.data);
  }

  // Path variables
  getPathVar(name: string): string | undefined {
    return this.currentState.variables.path.get(name);
  }

  setPathVar(name: string, value: string): void {
    this.checkMutable();
    const path = new Map(this.currentState.variables.path);
    path.set(name, value);
    this.updateState({
      variables: {
        ...this.currentState.variables,
        path
      }
    }, `setPathVar:${name}`);
  }

  getAllPathVars(): Map<string, string> {
    return new Map(this.currentState.variables.path);
  }

  // Commands
  getCommand(name: string): CommandDefinition | undefined {
    return this.currentState.commands.get(name);
  }

  setCommand(name: string, command: string | CommandDefinition): void {
    this.checkMutable();
    const commands = new Map(this.currentState.commands);
    const commandDef = typeof command === 'string' ? { command } : command;
    commands.set(name, commandDef);
    this.updateState({ commands }, `setCommand:${name}`);
  }

  getAllCommands(): Map<string, CommandDefinition> {
    return new Map(this.currentState.commands);
  }

  // Nodes
  getNodes(): MeldNode[] {
    return [...this.currentState.nodes];
  }

  getTransformedNodes(): MeldNode[] {
    if (this._transformationEnabled) {
      return this.currentState.transformedNodes ? [...this.currentState.transformedNodes] : [...this.currentState.nodes];
    }
    return [...this.currentState.nodes];
  }

  setTransformedNodes(nodes: MeldNode[]): void {
    this.checkMutable();
    this.updateState({ transformedNodes: nodes }, 'setTransformedNodes');
  }

  addNode(node: MeldNode): void {
    this.checkMutable();
    const nodes = [...this.currentState.nodes, node];
    const transformedNodes = this._transformationEnabled ? 
      (this.currentState.transformedNodes ? [...this.currentState.transformedNodes, node] : [...nodes]) : 
      undefined;
    this.updateState({ nodes, transformedNodes }, 'addNode');
  }

  transformNode(original: MeldNode, transformed: MeldNode): void {
    this.checkMutable();
    if (!this._transformationEnabled) {
      return;
    }

    // Initialize transformed nodes if needed
    let transformedNodes = this.currentState.transformedNodes ? 
      [...this.currentState.transformedNodes] : 
      [...this.currentState.nodes];
    
    // First try direct reference comparison
    let index = transformedNodes.findIndex(node => node === original);

    // If not found by reference, try matching by location
    if (index === -1 && original.location && transformed.location) {
      index = transformedNodes.findIndex(node => 
        node.location?.start?.line === original.location?.start?.line &&
        node.location?.start?.column === original.location?.start?.column &&
        node.location?.end?.line === original.location?.end?.line &&
        node.location?.end?.column === original.location?.end?.column
      );
    }

    if (index !== -1) {
      // Replace the node at the found index
      transformedNodes[index] = transformed;
    } else {
      // If not found in transformed nodes, check original nodes
      const originalIndex = this.currentState.nodes.findIndex(node => {
        if (!node.location || !original.location) return false;
        return (
          node.location.start.line === original.location.start.line &&
          node.location.start.column === original.location.start.column &&
          node.location.end.line === original.location.end.line &&
          node.location.end.column === original.location.end.column
        );
      });
      
      if (originalIndex === -1) {
        throw new Error('Cannot transform node: original node not found');
      }
      
      // Replace the node at the original index
      transformedNodes[originalIndex] = transformed;
    }
    
    this.updateState({ transformedNodes }, 'transformNode');
  }

  isTransformationEnabled(): boolean {
    return this._transformationEnabled;
  }

  /**
   * Check if a specific transformation type is enabled
   * @param type The transformation type to check (variables, directives, commands, imports)
   * @returns Whether the specified transformation type is enabled
   */
  shouldTransform(type: keyof TransformationOptions): boolean {
    return this._transformationEnabled && Boolean(this._transformationOptions[type]);
  }

  /**
   * Enable transformation with specific options
   * @param options Options for selective transformation, or true/false for all
   */
  enableTransformation(options?: TransformationOptions | boolean): void {
    if (typeof options === 'boolean') {
      // Legacy behavior - all on or all off
      this._transformationEnabled = options;
      this._transformationOptions = options ? 
        { variables: true, directives: true, commands: true, imports: true } : 
        { variables: false, directives: false, commands: false, imports: false };
    } else {
      // Selective transformation
      this._transformationEnabled = true;
      this._transformationOptions = {
        ...{ variables: true, directives: true, commands: true, imports: true },
        ...options
      };
    }

    if (this._transformationEnabled && !this.currentState.transformedNodes) {
      // Initialize transformed nodes with current nodes when enabling transformation
      this.updateState({ transformedNodes: [...this.currentState.nodes] }, 'enableTransformation');
    }
  }

  /**
   * Get the current transformation options
   * @returns The current transformation options
   */
  getTransformationOptions(): TransformationOptions {
    return { ...this._transformationOptions };
  }

  appendContent(content: string): void {
    this.checkMutable();
    // Create a text node and add it
    const textNode: TextNode = {
      type: 'Text',
      content,
      location: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } }
    };
    this.addNode(textNode);
  }

  // Imports
  addImport(path: string): void {
    this.checkMutable();
    const imports = new Set(this.currentState.imports);
    imports.add(path);
    this.updateState({ imports }, `addImport:${path}`);
  }

  removeImport(path: string): void {
    this.checkMutable();
    const imports = new Set(this.currentState.imports);
    imports.delete(path);
    this.updateState({ imports }, `removeImport:${path}`);
  }

  hasImport(path: string): boolean {
    return this.currentState.imports.has(path);
  }

  getImports(): Set<string> {
    return new Set(this.currentState.imports);
  }

  // File path
  getCurrentFilePath(): string | null {
    return this.currentState.filePath ?? null;
  }

  setCurrentFilePath(path: string): void {
    this.checkMutable();
    this.updateState({ filePath: path }, 'setCurrentFilePath');
  }

  // State management
  /**
   * In the immutable state model, any non-empty state is considered to have local changes.
   * This is a deliberate design choice - each state represents a complete snapshot,
   * so the entire state is considered "changed" from its creation.
   * 
   * @returns Always returns true to indicate the state has changes
   */
  hasLocalChanges(): boolean {
    return true; // In immutable model, any non-empty state has local changes
  }

  /**
   * Returns a list of changed elements in the state. In the immutable state model,
   * the entire state is considered changed from creation, so this always returns
   * ['state'] to indicate the complete state has changed.
   * 
   * This is a deliberate design choice that aligns with the immutable state model
   * where each state is a complete snapshot.
   * 
   * @returns Always returns ['state'] to indicate the entire state has changed
   */
  getLocalChanges(): string[] {
    return ['state']; // In immutable model, the entire state is considered changed
  }

  setImmutable(): void {
    this._isImmutable = true;
  }

  get isImmutable(): boolean {
    return this._isImmutable;
  }

  createChildState(): IStateService {
    // Always use DI mode
    const container = getContainer();
    const child = container.resolve(StateService);
    
    // Set the service mediator to ensure proper circular dependency handling
    if (this.serviceMediator && typeof child.setServiceMediator === 'function') {
      child.setServiceMediator(this.serviceMediator);
    }
    
    // Set parent state reference
    child.parentState = this;
    
    // Transfer parent variables to child
    // Copy text variables
    this.getAllTextVars().forEach((value, key) => {
      child.setTextVar(key, value);
    });
    
    // Copy data variables
    this.getAllDataVars().forEach((value, key) => {
      child.setDataVar(key, value);
    });
    
    // Copy path variables
    this.getAllPathVars().forEach((value, key) => {
      child.setPathVar(key, value);
    });
    
    // Copy commands
    this.getAllCommands().forEach((command, name) => {
      child.setCommand(name, command);
    });
    
    // Copy import info
    this.getImports().forEach(importPath => {
      child.addImport(importPath);
    });
    
    // Copy current file path
    const filePath = this.getCurrentFilePath();
    if (filePath) {
      child.setCurrentFilePath(filePath);
    }
    
    // Copy transformation settings
    if (this.isTransformationEnabled()) {
      child.enableTransformation(this.getTransformationOptions());
    }
    
    // Register with tracking service if available and set parent ID
    if (this.trackingService && this.currentState.stateId) {
      // Set the state ID, which will register with tracking and establish the parent relationship
      child.setStateId({
        parentId: this.currentState.stateId,
        source: 'child'
      });
      
      // Explicitly create the parent-child relationship in the tracking service
      this.trackingService.addRelationship(
        this.currentState.stateId,
        child.getStateId()!,
        'parent-child'
      );
    }
    
    return child;
  }

  mergeChildState(childState: IStateService): void {
    this.checkMutable();
    const child = childState as StateService;
    this.currentState = this.stateFactory.mergeStates(this.currentState, child.currentState);

    // Add merge relationship if tracking enabled
    if (this.trackingService && this.currentState.stateId && child.currentState.stateId) {
      // Make sure parent-child relationship exists
      this.trackingService.addRelationship(
        this.currentState.stateId,
        child.currentState.stateId,
        'parent-child'
      );
      
      // Add merge-source relationship
      this.trackingService.addRelationship(
        this.currentState.stateId,
        child.currentState.stateId,
        'merge-source'
      );
    }

    // Emit merge event
    this.emitEvent({
      type: 'merge',
      stateId: this.currentState.stateId || 'unknown',
      source: 'mergeChildState',
      timestamp: Date.now(),
      location: {
        file: this.getCurrentFilePath() || undefined
      }
    });
  }

  clone(): IStateService {
    // Always use DI mode
    const container = getContainer();
    const cloned = container.resolve(StateService);
    
    // Set the service mediator to ensure proper circular dependency handling
    if (this.serviceMediator && typeof cloned.setServiceMediator === 'function') {
      cloned.setServiceMediator(this.serviceMediator);
    }
    
    // Transfer event service if available
    if (this.eventService) {
      cloned.setEventService(this.eventService);
    }
    
    // Transfer tracking service if available
    if (this.trackingService) {
      cloned.setTrackingService(this.trackingService);
    }
    
    // Create a completely new state without parent reference
    cloned.currentState = this.stateFactory.createState({
      source: 'clone',
      filePath: this.currentState.filePath
    });

    // Deep clone all state using our helper
    cloned.updateState({
      variables: {
        text: this.deepCloneValue(this.currentState.variables.text),
        data: this.deepCloneValue(this.currentState.variables.data),
        path: this.deepCloneValue(this.currentState.variables.path)
      },
      commands: this.deepCloneValue(this.currentState.commands),
      nodes: this.deepCloneValue(this.currentState.nodes),
      transformedNodes: this.currentState.transformedNodes ? 
        this.deepCloneValue(this.currentState.transformedNodes) : undefined,
      imports: this.deepCloneValue(this.currentState.imports)
    }, 'clone');
    
    // Copy transformation settings
    if (this.isTransformationEnabled()) {
      cloned.enableTransformation(this.getTransformationOptions());
    }
    
    // Register with tracking service if present
    if (this.trackingService && this.currentState.stateId) {
      cloned.setStateId({
        parentId: this.currentState.stateId,
        source: 'clone'
      });
    }
    
    return cloned;
  }

  private checkMutable(): void {
    if (this._isImmutable) {
      throw new Error('Cannot modify immutable state');
    }
  }

  /**
   * Deep clones a value, handling objects, arrays, Maps, Sets, and circular references.
   * @param value The value to clone
   * @param seen A WeakMap to track circular references
   * @returns A deep clone of the value
   */
  private deepCloneValue<T>(value: T, seen: WeakMap<any, any> = new WeakMap()): T {
    // Handle null, undefined, and primitive types
    if (value === null || value === undefined || typeof value !== 'object') {
      return value;
    }

    // Handle circular references
    if (seen.has(value)) {
      return seen.get(value);
    }

    // Handle Date objects
    if (value instanceof Date) {
      return new Date(value.getTime()) as unknown as T;
    }

    // Handle Arrays
    if (Array.isArray(value)) {
      const clone = [] as unknown as T;
      seen.set(value, clone);
      (value as unknown as any[]).forEach((item, index) => {
        (clone as unknown as any[])[index] = this.deepCloneValue(item, seen);
      });
      return clone;
    }

    // Handle Maps
    if (value instanceof Map) {
      const clone = new Map() as unknown as T;
      seen.set(value, clone);
      (value as Map<any, any>).forEach((val, key) => {
        (clone as unknown as Map<any, any>).set(
          this.deepCloneValue(key, seen),
          this.deepCloneValue(val, seen)
        );
      });
      return clone;
    }

    // Handle Sets
    if (value instanceof Set) {
      const clone = new Set() as unknown as T;
      seen.set(value, clone);
      (value as Set<any>).forEach(item => {
        (clone as unknown as Set<any>).add(this.deepCloneValue(item, seen));
      });
      return clone;
    }

    // Handle plain objects (including MeldNodes and CommandDefinitions)
    const clone = Object.create(Object.getPrototypeOf(value));
    seen.set(value, clone);
    
    Object.entries(value as object).forEach(([key, val]) => {
      clone[key] = this.deepCloneValue(val, seen);
    });
    
    return clone;
  }

  private updateState(updates: Partial<StateNode>, source: string): void {
    this.currentState = this.stateFactory.updateState(this.currentState, updates);

    // Emit transform event for state updates
    this.emitEvent({
      type: 'transform',
      stateId: this.currentState.stateId || 'unknown',
      source,
      timestamp: Date.now(),
      location: {
        file: this.getCurrentFilePath() || undefined
      }
    });
  }

  // Add new methods for state tracking
  setTrackingService(trackingService: IStateTrackingService): void {
    this.trackingService = trackingService;
    
    // Register existing state if not already registered
    if (this.currentState.stateId) {
      try {
        this.trackingService.registerState({
          id: this.currentState.stateId,
          source: this.currentState.source || 'new',  // Use original source or default to 'new'
          filePath: this.getCurrentFilePath() || undefined,
          transformationEnabled: this._transformationEnabled
        });
      } catch (error) {
        logger.warn('Failed to register existing state with tracking service', { error, stateId: this.currentState.stateId });
      }
    }
  }

  getStateId(): string | undefined {
    return this.currentState.stateId;
  }
  
  /**
   * Sets the state ID and establishes parent-child relationships for tracking
   */
  setStateId(params: { parentId?: string, source: string }): void {
    const stateId = this.currentState.stateId || this.stateFactory.generateStateId();
    this.currentState.stateId = stateId;
    this.currentState.source = params.source;
    
    // Register with tracking service if available
    if (this.trackingService) {
      try {
        this.trackingService.registerState({
          id: stateId,
          source: params.source,
          filePath: this.getCurrentFilePath() || undefined,
          transformationEnabled: this._transformationEnabled
        });
        
        // Add parent-child relationship if parentId provided
        if (params.parentId) {
          this.trackingService.addRelationship(
            params.parentId,
            stateId,
            'parent-child'
          );
        }
      } catch (error) {
        console.warn('Failed to register state ID with tracking service', { error, stateId });
      }
    }
  }

  getCommandOutput(command: string): string | undefined {
    if (!this._transformationEnabled || !this.currentState.transformedNodes) {
      return undefined;
    }

    // Find the transformed node that matches this command
    const transformedNode = this.currentState.transformedNodes.find(node => {
      if (node.type !== 'Text') return false;
      return (node as TextNode).content === command;
    });

    return transformedNode?.type === 'Text' ? (transformedNode as TextNode).content : undefined;
  }

  hasTransformationSupport(): boolean {
    return true;
  }
  
  /**
   * Reset the state service to initial state
   * Used primarily for testing
   */
  reset(): void {
    // Reset to a fresh state
    this.initializeState();
    
    // Reset flags
    this._isImmutable = false;
    this._transformationEnabled = false;
    this._transformationOptions = {
      variables: false,
      directives: false,
      commands: false,
      imports: false
    };
  }

  /**
   * Set the service mediator for this state service
   * This is useful when creating a state service outside the DI container
   */
  setServiceMediator(mediator: IServiceMediator): void {
    this.serviceMediator = mediator;
    
    // Register this service with the mediator
    if (typeof this.serviceMediator.setStateService === 'function') {
      try {
        this.serviceMediator.setStateService(this);
      } catch (error) {
        logger.warn('Failed to register StateService with ServiceMediator:', error);
      }
    }
  }
} 