import type { MeldNode, TextNode } from '@core/syntax/types/index.js';
import { stateLogger as logger } from '@core/utils/logger.js';
import type { IStateService, TransformationOptions } from '@services/state/StateService/IStateService.js';
import type { StateNode, CommandDefinition } from '@services/state/StateService/types.js';
import { StateFactory } from '@services/state/StateService/StateFactory.js';
import type { IStateEventService, StateEvent } from '@services/state/StateEventService/IStateEventService.js';
import type { IStateTrackingService } from '@tests/utils/debug/StateTrackingService/IStateTrackingService.js';
import { inject, container, injectable } from 'tsyringe';
import { Service } from '@core/ServiceProvider.js';
import { StateTrackingServiceClientFactory } from '@services/state/StateTrackingService/factories/StateTrackingServiceClientFactory.js';
import type { IStateTrackingServiceClient } from '@services/state/StateTrackingService/interfaces/IStateTrackingServiceClient.js';
import { randomUUID } from 'crypto';
import cloneDeep from 'lodash.cloneDeep';
import type {
  TextVariable,
  DataVariable,
  IPathVariable,
  CommandVariable,
  JsonValue,
  VariableMetadata,
  IFilesystemPathState,
  IUrlPathState,
  ICommandDefinition,
  MeldVariable,
  VariableType
} from '@core/types/index.js';
import { 
  VariableOrigin,
  createTextVariable,
  createDataVariable,
  createPathVariable,
  createCommandVariable
} from '@core/types/index.js';

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
  
  // Factory pattern properties
  private trackingServiceClientFactory?: StateTrackingServiceClientFactory;
  private trackingClient?: IStateTrackingServiceClient;
  private factoryInitialized: boolean = false;

  /**
   * Creates a new StateService instance using dependency injection
   * 
   * @param stateFactory - Factory for creating state nodes and managing state operations
   * @param eventService - Service for handling state events and notifications
   * @param trackingServiceClientFactory - Factory for creating tracking service clients
   * @param parentState - Optional parent state to inherit from (used for nested imports)
   */
  constructor(
    @inject(StateFactory) stateFactory?: StateFactory,
    @inject('IStateEventService') eventService?: IStateEventService,
    @inject('StateTrackingServiceClientFactory') trackingServiceClientFactory?: StateTrackingServiceClientFactory,
    parentState?: IStateService
  ) {
    if (stateFactory) {
      this.stateFactory = stateFactory;
      this.eventService = eventService;
      
      // Initialize tracking client factory
      this.trackingServiceClientFactory = trackingServiceClientFactory;
      if (this.trackingServiceClientFactory) {
        this.factoryInitialized = true;
        this.initializeTrackingClient();
      }
      
      this.initializeState(parentState);
    } else {
      // Fallback for non-DI initialization
      logger.warn('StateService initialized without factory in DI-only mode');
      this.stateFactory = new StateFactory();
      
      // Use proper type guards to determine service type
      if (eventService && this.isStateEventService(eventService)) {
        this.eventService = eventService;
      }
      
      // Initialize state with parent if provided
      const actualParentState = parentState || 
        (eventService && this.isStateService(eventService) ? 
          eventService : undefined);
      
      this.initializeState(actualParentState);
    }
  }

  /**
   * Lazily initialize the StateTrackingServiceClient factory
   * This is called only when needed to avoid circular dependencies
   */
  private ensureFactoryInitialized(): void {
    if (this.factoryInitialized) {
      return;
    }
    
    this.factoryInitialized = true;
    
    try {
      this.trackingServiceClientFactory = container.resolve('StateTrackingServiceClientFactory');
      this.initializeTrackingClient();
    } catch (error) {
      // Factory not available, will use direct service
      logger.debug('StateTrackingServiceClientFactory not available, will use direct service if available');
    }
  }
  
  /**
   * Initialize the StateTrackingServiceClient using the factory
   */
  private initializeTrackingClient(): void {
    if (!this.trackingServiceClientFactory) {
      return;
    }
    
    try {
      this.trackingClient = this.trackingServiceClientFactory.createClient();
      logger.debug('Successfully created StateTrackingServiceClient using factory');
    } catch (error) {
      logger.warn('Failed to create StateTrackingServiceClient, will use direct service if available', { error });
      this.trackingClient = undefined;
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
    if (eventService && this.isStateEventService(eventService)) {
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
      parentState: parentState ? parentState.getInternalStateNode() : undefined
    });
    
    // Register state with tracking service if available
    // Ensure factory is initialized before trying to use it
    this.ensureFactoryInitialized();
    
    const parentId = parentState ? parentState.getStateId() : undefined;
    
    // Try to use the client from the factory first
    if (this.trackingClient) {
      try {
        // Register the state with the pre-generated ID
        this.trackingClient.registerState({
          id: this.currentState.stateId,
          parentId,
          filePath: this.currentState.filePath,
          createdAt: Date.now(),
          transformationEnabled: this._transformationEnabled,
          source: 'child'
        });
        
        // Explicitly register parent-child relationship if parent exists
        if (parentState && parentId) {
          this.trackingClient.registerRelationship({
            sourceId: parentId,
            targetId: this.currentState.stateId,
            type: 'parent-child',
            timestamp: Date.now(),
            source: 'child'
          });
        }
        
        return; // Successfully used the client, no need to try other methods
      } catch (error) {
        logger.warn('Error using trackingClient.registerState, will fall back to direct service if available', { error });
      }
    }
    
    // Fall back to direct tracking service if available
    if (this.trackingService) {
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
  getTextVar(name: string): TextVariable | undefined {
    return this.currentState.variables.text.get(name);
  }

  setTextVar(name: string, value: string, metadata?: Partial<VariableMetadata>): TextVariable {
    this.checkMutable();
    // Create the rich variable object using the factory
    const variable = createTextVariable(name, value, {
      origin: VariableOrigin.DIRECT_DEFINITION,
      ...metadata // Merge provided metadata, overwriting defaults if needed
    });
    // Create a new map, set the variable, and update state
    const text = new Map(this.currentState.variables.text);
    text.set(name, variable);
    this.updateState({
      variables: {
        ...this.currentState.variables,
        text // Use the map with the new rich object
      }
    }, `setTextVar:${name}`);
    return variable; // Return the created object
  }

  getAllTextVars(): Map<string, TextVariable> {
    return new Map(this.currentState.variables.text);
  }

  getLocalTextVars(): Map<string, TextVariable> {
    return new Map(this.currentState.variables.text);
  }

  // Data variables
  getDataVar(name: string): DataVariable | undefined {
    return this.currentState.variables.data.get(name);
  }

  setDataVar(name: string, value: JsonValue, metadata?: Partial<VariableMetadata>): DataVariable {
    this.checkMutable();
    // Create the rich variable object
    const variable = createDataVariable(name, value, {
      origin: VariableOrigin.DIRECT_DEFINITION,
      ...metadata
    });
    // Create a new map, set the variable, and update state
    const data = new Map(this.currentState.variables.data);
    data.set(name, variable);
    this.updateState({
      variables: {
        ...this.currentState.variables,
        data // Use the map with the new rich object
      }
    }, `setDataVar:${name}`);
    return variable; // Return the created object
  }

  getAllDataVars(): Map<string, DataVariable> {
    return new Map(this.currentState.variables.data);
  }

  getLocalDataVars(): Map<string, DataVariable> {
    return new Map(this.currentState.variables.data);
  }

  // Path variables
  getPathVar(name: string): IPathVariable | undefined {
    return this.currentState.variables.path.get(name);
  }

  setPathVar(name: string, value: IFilesystemPathState | IUrlPathState, metadata?: Partial<VariableMetadata>): IPathVariable {
    this.checkMutable();
    // Create the rich variable object
    const variable = createPathVariable(name, value, {
      origin: VariableOrigin.DIRECT_DEFINITION,
      ...metadata
    });
    // Create a new map, set the variable, and update state
    const path = new Map(this.currentState.variables.path);
    path.set(name, variable);
    this.updateState({
      variables: {
        ...this.currentState.variables,
        path // Use the map with the new rich object
      }
    }, `setPathVar:${name}`);
    return variable; // Return the created object
  }

  getAllPathVars(): Map<string, IPathVariable> {
    return new Map(this.currentState.variables.path);
  }

  // Commands
  getCommandVar(name: string): CommandVariable | undefined {
    return this.currentState.commands.get(name);
  }

  setCommandVar(name: string, value: ICommandDefinition, metadata?: Partial<VariableMetadata>): CommandVariable {
    this.checkMutable();
    // Create the rich variable object
    const variable = createCommandVariable(name, value, {
        origin: VariableOrigin.DIRECT_DEFINITION,
        ...metadata
    });
    // Create a new map, set the variable, and update state
    const commands = new Map(this.currentState.commands);
    commands.set(name, variable);
    this.updateState({ commands }, `setCommandVar:${name}`); // Update the whole commands map
    return variable; // Return the created object
  }

  getAllCommands(): Map<string, CommandVariable> {
    return new Map(this.currentState.commands);
  }

  // Nodes
  getNodes(): MeldNode[] {
    return [...this.currentState.nodes];
  }

  getOriginalNodes(): MeldNode[] {
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

  /**
   * Creates a new child state that inherits from this state.
   * Used for import resolution to maintain variable scope.
   */
  createChildState(): IStateService {
    this.checkMutable();
    
    // Create a new StateService instance that inherits from this one
    // Use factory pattern consistently - pass the trackingServiceClientFactory instead of service
    const childState = new StateService(
      this.stateFactory,
      this.eventService,
      this.trackingServiceClientFactory
    );
    
    // Transfer parent variables to child
    // Copy text variables
    this.getAllTextVars().forEach((value, key) => {
      childState.setTextVar(key, value);
    });
    
    // Copy data variables
    this.getAllDataVars().forEach((value, key) => {
      childState.setDataVar(key, value);
    });
    
    // Copy path variables
    this.getAllPathVars().forEach((value, key) => {
      childState.setPathVar(key, value);
    });
    
    // Copy commands
    this.getAllCommands().forEach((command, name) => {
      childState.setCommandVar(name, command);
    });
    
    // Copy import info
    this.getImports().forEach(importPath => {
      childState.addImport(importPath);
    });
    
    // Copy current file path
    const filePath = this.getCurrentFilePath();
    if (filePath) {
      childState.setCurrentFilePath(filePath);
    }
    
    // Set child state to transform if parent is transforming
    if (this._transformationEnabled) {
      childState.enableTransformation(this._transformationOptions);
    }
    
    // Track child state creation
    // Ensure factory is initialized before trying to use it
    this.ensureFactoryInitialized();
    
    if (this.trackingClient) {
      try {
        // Register the parent-child relationship 
        this.trackingClient.registerRelationship({
          sourceId: this.currentState.stateId,
          targetId: childState.getInternalStateNode().stateId,
          type: 'parent-child',
          timestamp: Date.now(),
          source: 'parent'
        });
        
        // Register a "created" event for the child state
        if (this.trackingClient.registerEvent) {
          this.trackingClient.registerEvent({
            stateId: this.currentState.stateId,
            type: 'created-child',
            timestamp: Date.now(),
            details: {
              childId: childState.getInternalStateNode().stateId
            },
            source: 'parent'
          });
        }
      } catch (error) {
        logger.warn('Failed to register child state creation with tracking client', { error });
      }
    } else if (this.trackingService) {
      // Fall back to direct service
      // Register the parent-child relationship 
      try {
        this.trackingService.addRelationship(
          this.currentState.stateId,
          childState.getInternalStateNode().stateId,
          'parent-child'
        );
      } catch (error) {
        logger.warn('Failed to register parent-child relationship with tracking service', { error });
      }
    }
    
    return childState;
  }

  mergeChildState(childState: IStateService): void {
    this.checkMutable();
    const childNode = childState.getInternalStateNode();
    this.currentState = this.stateFactory.mergeStates(this.currentState, childNode);

    // Add merge relationship if tracking enabled
    if (this.getStateId() && childNode.stateId) {
      // Ensure factory is initialized before trying to use it
      this.ensureFactoryInitialized();
      
      // Try to use the client from the factory first
      if (this.trackingClient) {
        try {
          // Make sure parent-child relationship exists
          this.trackingClient.addRelationship(
            this.getStateId()!,
            childNode.stateId,
            'parent-child'
          );
          
          // Add merge-source relationship
          this.trackingClient.addRelationship(
            this.getStateId()!,
            childNode.stateId,
            'merge-source'
          );
          
          // Successfully used the client, proceed to emit event
        } catch (error) {
          logger.warn('Error using trackingClient in mergeChildState, falling back to direct service', { error });
          
          // Fall back to direct tracking service if available
          if (this.trackingService) {
            // Make sure parent-child relationship exists
            this.trackingService.addRelationship(
              this.getStateId()!,
              childNode.stateId,
              'parent-child'
            );
            
            // Add merge-source relationship
            this.trackingService.addRelationship(
              this.getStateId()!,
              childNode.stateId,
              'merge-source'
            );
          }
        }
      } else if (this.trackingService) {
        // Fall back to direct tracking service if client not available
        // Make sure parent-child relationship exists
        this.trackingService.addRelationship(
          this.getStateId()!,
          childNode.stateId,
          'parent-child'
        );
        
        // Add merge-source relationship
        this.trackingService.addRelationship(
          this.getStateId()!,
          childNode.stateId,
          'merge-source'
        );
      }
    }

    // Emit merge event
    this.emitEvent({
      type: 'merge',
      stateId: this.getStateId() || 'unknown',
      source: 'mergeChildState',
      timestamp: Date.now(),
      location: {
        file: this.getCurrentFilePath() || undefined
      }
    });
  }

  /**
   * Creates a deep clone of this state service
   */
  clone(): IStateService {
    // Create a new StateService with the same factory, eventService and trackingServiceFactory
    const cloned = new StateService(
      this.stateFactory,
      this.eventService,
      this.trackingServiceClientFactory
    );
    
    // Use the factory to create a cloned state with all properties correctly initialized
    (cloned as StateService).currentState = this.stateFactory.createClonedState(
      this.currentState,
      {
        source: 'clone',
        filePath: this.currentState.filePath
      }
    );
    
    // Copy transformation settings
    (cloned as StateService)._transformationEnabled = this._transformationEnabled;
    (cloned as StateService)._transformationOptions = { ...this._transformationOptions };
    (cloned as StateService)._isImmutable = this._isImmutable;
    
    // Track cloning
    // Ensure factory is initialized before trying to use it
    this.ensureFactoryInitialized();
    
    if (this.trackingClient) {
      try {
        // Register the clone-original relationship
        this.trackingClient.registerRelationship({
          sourceId: this.getStateId()!,
          targetId: cloned.getStateId()!,
          type: 'clone-original',
          timestamp: Date.now(),
          source: 'original'
        });
        
        // Register a "cloned" event for the state
        if (this.trackingClient.registerEvent) {
          this.trackingClient.registerEvent({
            stateId: this.getStateId()!,
            type: 'cloned',
            timestamp: Date.now(),
            details: {
              cloneId: cloned.getStateId()!
            },
            source: 'original'
          });
        }
      } catch (error) {
        logger.warn('Failed to register clone with tracking client', { error });
      }
    } else if (this.trackingService) {
      // Fall back to direct service
      try {
        // Register the clone-original relationship with type assertion since it's valid in the client interface
        this.trackingService.addRelationship(
          this.getStateId()!,
          cloned.getStateId()!,
          'parent-child' // Use 'parent-child' as fallback for direct service
        );
      } catch (error) {
        logger.warn('Failed to register clone-original relationship with tracking service', { error });
      }
    }
    
    return cloned;
  }

  private checkMutable(): void {
    if (this._isImmutable) {
      throw new Error('Cannot modify immutable state');
    }
  }

  private updateState(updates: Partial<StateNode>, source: string): void {
    this.currentState = this.stateFactory.updateState(this.currentState, updates);

    // Emit transform event for state updates
    this.emitEvent({
      type: 'transform',
      stateId: this.getStateId() || 'unknown',
      source,
      timestamp: Date.now(),
      location: {
        file: this.getCurrentFilePath() || undefined
      }
    });
  }

  getStateId(): string | undefined {
    return this.currentState.stateId;
  }
  
  /**
   * Sets the state ID and establishes parent-child relationships for tracking
   */
  setStateId(params: { parentId?: string, source: string }): void {
    // If no stateId exists yet, generate a new UUID
    const stateId = this.currentState.stateId || (randomUUID ? randomUUID() : crypto.randomUUID());
    this.currentState.stateId = stateId;
    // Use type assertion to allow string assignment to the enum-like type
    this.currentState.source = params.source as any;
    
    // Register with tracking service if available
    // Ensure factory is initialized before trying to use it
    this.ensureFactoryInitialized();
    
    // Try to use the client from the factory first
    if (this.trackingClient) {
      try {
        this.trackingClient.registerState({
          id: stateId,
          source: params.source as any, // Type assertion to handle string vs enum-like type
          filePath: this.getCurrentFilePath() || undefined,
          transformationEnabled: this._transformationEnabled
        });
        
        // Add parent-child relationship if parentId provided
        if (params.parentId) {
          this.trackingClient.addRelationship(
            params.parentId,
            stateId,
            'parent-child'
          );
        }
        
        return; // Successfully used the client, no need to try other methods
      } catch (error) {
        logger.warn('Error using trackingClient in setStateId, falling back to direct service', { error });
      }
    }
    
    // Fall back to direct tracking service if available
    if (this.trackingService) {
      try {
        this.trackingService.registerState({
          id: stateId,
          source: params.source as any, // Type assertion to handle string vs enum-like type
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
   * Type guard to check if a service is an IStateEventService
   * @param service The service to check
   * @returns True if the service is an IStateEventService
   */
  private isStateEventService(service: unknown): service is IStateEventService {
    return (
      typeof service === 'object' && 
      service !== null && 
      'on' in service && 
      'off' in service && 
      'emit' in service &&
      !('createChildState' in service)
    );
  }

  /**
   * Type guard to check if a service is an IStateService
   * @param service The service to check
   * @returns True if the service is an IStateService
   */
  private isStateService(service: unknown): service is IStateService {
    return (
      typeof service === 'object' && 
      service !== null && 
      'createChildState' in service && 
      'getTextVar' in service && 
      'setTextVar' in service
    );
  }

  // Add back the setTrackingService method
  setTrackingService(trackingService: IStateTrackingService): void {
    this.trackingService = trackingService;
    
    // Register existing state if not already registered
    if (this.currentState.stateId) {
      // Ensure factory is initialized before trying to use it
      this.ensureFactoryInitialized();
      
      // Try to use the client from the factory first
      if (this.trackingClient) {
        try {
          this.trackingClient.registerState({
            id: this.currentState.stateId,
            source: this.currentState.source || 'new',  // Use original source or default to 'new'
            filePath: this.getCurrentFilePath() || undefined,
            transformationEnabled: this._transformationEnabled,
            createdAt: Date.now()
          });
          
          return; // Successfully used the client, no need to try other methods
        } catch (error) {
          logger.warn('Error using trackingClient in setTrackingService, will fall back to direct service', { error });
        }
      }
      
      // Fall back to direct tracking service
      try {
        this.trackingService.registerState({
          id: this.currentState.stateId,
          source: this.currentState.source || 'new',  // Use original source or default to 'new'
          filePath: this.getCurrentFilePath() || undefined,
          transformationEnabled: this._transformationEnabled,
          createdAt: Date.now()
        });
      } catch (error) {
        logger.warn('Failed to register existing state with tracking service', { error, stateId: this.currentState.stateId });
      }
    }
  }

  /**
   * Checks if a variable with the given name and type exists
   * 
   * @param type - The type of variable ('text', 'data', or 'path')
   * @param name - The name of the variable to check
   * @returns true if the variable exists, false otherwise
   */
  hasVariable(type: string, name: string): boolean {
    switch (type.toLowerCase()) {
      case 'text':
        return this.getTextVar(name) !== undefined;
      case 'data':
        return this.getDataVar(name) !== undefined;
      case 'path':
        return this.getPathVar(name) !== undefined;
      default:
        return false;
    }
  }

  /**
   * Implement the new interface method
   */
  getInternalStateNode(): StateNode {
    return this.currentState;
  }

  // Implement generic getVariable
  getVariable(name: string, type?: VariableType): MeldVariable | undefined {
    let variable: MeldVariable | undefined;
    if (type === undefined || type === VariableType.TEXT) {
      variable = this.getTextVar(name);
      if (variable) return variable;
    }
    if (type === undefined || type === VariableType.DATA) {
      variable = this.getDataVar(name);
      if (variable) return variable;
    }
    if (type === undefined || type === VariableType.PATH) {
      variable = this.getPathVar(name);
      if (variable) return variable;
    }
    if (type === undefined || type === VariableType.COMMAND) {
      variable = this.getCommandVar(name);
      if (variable) return variable;
    }
    return undefined;
  }

  // Implement generic setVariable
  setVariable(variable: MeldVariable): MeldVariable {
    this.checkMutable();
    switch (variable.type) {
      case VariableType.TEXT:
        return this.setTextVar(variable.name, variable.value, variable.metadata);
      case VariableType.DATA:
        return this.setDataVar(variable.name, variable.value, variable.metadata);
      case VariableType.PATH:
        // Type assertion needed because setPathVar expects the union, not the full variable
        return this.setPathVar(variable.name, variable.value as (IFilesystemPathState | IUrlPathState), variable.metadata);
      case VariableType.COMMAND:
        // Type assertion needed because setCommandVar expects ICommandDefinition, not the full variable
        return this.setCommandVar(variable.name, variable.value as ICommandDefinition, variable.metadata);
      default:
        // Should be unreachable due to discriminated union
        throw new Error(`Unsupported variable type: ${(variable as any).type}`);
    }
  }

  // Implement generic hasVariable
  hasVariable(name: string, type?: VariableType): boolean {
    if (type) {
      switch (type) {
        case VariableType.TEXT: return this.currentState.variables.text.has(name);
        case VariableType.DATA: return this.currentState.variables.data.has(name);
        case VariableType.PATH: return this.currentState.variables.path.has(name);
        case VariableType.COMMAND: return this.currentState.commands.has(name);
        default: return false;
      }
    } else {
      // Check across all types if no specific type is given
      return this.currentState.variables.text.has(name) ||
             this.currentState.variables.data.has(name) ||
             this.currentState.variables.path.has(name) ||
             this.currentState.commands.has(name);
    }
  }

  // Implement generic removeVariable
  removeVariable(name: string, type?: VariableType): boolean {
    this.checkMutable();
    let removed = false;
    if (type === undefined || type === VariableType.TEXT) {
      const text = new Map(this.currentState.variables.text);
      if (text.delete(name)) {
        this.updateState({ variables: { ...this.currentState.variables, text }}, `removeVariable:${name}(text)`);
        removed = true;
      }
    }
    if (type === undefined || type === VariableType.DATA) {
      const data = new Map(this.currentState.variables.data);
      if (data.delete(name)) {
        this.updateState({ variables: { ...this.currentState.variables, data }}, `removeVariable:${name}(data)`);
        removed = true;
      }
    }
    if (type === undefined || type === VariableType.PATH) {
      const path = new Map(this.currentState.variables.path);
      if (path.delete(name)) {
        this.updateState({ variables: { ...this.currentState.variables, path }}, `removeVariable:${name}(path)`);
        removed = true;
      }
    }
    if (type === undefined || type === VariableType.COMMAND) {
      const commands = new Map(this.currentState.commands);
      if (commands.delete(name)) {
        this.updateState({ commands }, `removeVariable:${name}(command)`);
        removed = true;
      }
    }
    // If a specific type was requested and nothing was removed, return false.
    // If no type was specified, return true if anything was removed.
    return removed;
  }

  // Add getParentState method to satisfy interface
  getParentState(): IStateService | undefined {
    // This needs access to the original parentState passed to constructor/initializeState
    // which is currently not stored directly. We need to modify how parent is tracked.
    // For now, return undefined. This might need a bigger change if parent access is crucial.
    // TODO: Revisit parent state tracking if needed for functionality.
    logger.warn('getParentState() is not fully implemented and may return undefined.');
    return undefined; 
  }
} 