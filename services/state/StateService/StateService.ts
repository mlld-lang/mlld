import type { MeldNode, TextNode } from '@core/syntax/types/index.js';
import { stateLogger as logger } from '@core/utils/logger.js';
import type { IStateService, TransformationOptions } from '@services/state/StateService/IStateService.js';
import type { StateNode } from '@services/state/StateService/types.js';
import { StateFactory } from '@services/state/StateService/StateFactory.js';
import type { IStateEventService, StateEvent, StateTransformEvent } from '@services/state/StateEventService/IStateEventService.js';
import type { IStateTrackingService } from '@tests/utils/debug/StateTrackingService/IStateTrackingService.js';
import { inject, container, injectable } from 'tsyringe';
import { Service } from '@core/ServiceProvider.js';
import { StateTrackingServiceClientFactory } from '@services/state/StateTrackingService/factories/StateTrackingServiceClientFactory.js';
import type { IStateTrackingServiceClient } from '@services/state/StateTrackingService/interfaces/IStateTrackingServiceClient.js';
import { randomUUID } from 'crypto';
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
  MeldPath,
} from '@core/types/index.js';
import { 
  VariableOrigin,
  createTextVariable,
  createDataVariable,
  createPathVariable,
  createCommandVariable
} from '@core/types/index.js';
import { VariableType } from '@core/types/index.js';
import { cloneDeep } from 'lodash';

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
    enabled: false, 
    preserveOriginal: true,
    transformNested: true
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
      // DEBUG REMOVED
      // if (typeof (this.eventService as any).emit === 'function') {
      //   console.log('[StateService.emitEvent] this.eventService.emit IS a function. Calling it...');
      try {
        await this.eventService.emit(event);
      } catch (error) {
        // DEBUG REMOVED
        // console.error('[StateService.emitEvent] Error during event emission:', error);
      }
      // DEBUG REMOVED
      // } else {
      //   console.error('[StateService.emitEvent] this.eventService.emit IS NOT a function. Type:', typeof (this.eventService as any).emit);
      //   console.error('[StateService.emitEvent] eventService object:', this.eventService);
      // }
    // DEBUG REMOVED
    // } else {
      // console.log('[StateService.emitEvent] this.eventService is undefined/null.');
    }
  }

  /**
   * Updates the internal state node and emits a transform event.
   * Made async to ensure event emission is awaited.
   */
  private async updateState(updates: Partial<StateNode>, source: string): Promise<void> {
    const oldStateSnapshot = cloneDeep(this.currentState); // Store state BEFORE update

    try {
      const newStateNode = this.stateFactory.updateState(this.currentState, updates); 
      this.currentState = newStateNode; 
    } catch (error) {
      throw error; 
    }

    // Emit specific event type with details
    const event: StateTransformEvent = {
      type: 'transform',
      stateId: this.getStateId() || 'unknown',
      source,
      timestamp: Date.now(),
      location: {
        file: this.getCurrentFilePath() || undefined
      },
      details: {
        operation: source, // Use source as the operation identifier
        before: oldStateSnapshot, // Pass the state before the change
        after: cloneDeep(this.currentState) // Pass the state after the change
      }
    };
    
    // Pass the specifically typed event to emitEvent
    await this.emitEvent(event); // Await the emit
  }

  // Text variables
  getTextVar(name: string): TextVariable | undefined {
    let foundVariable: TextVariable | undefined = undefined;
    // Explicitly iterate and check the value during iteration
    if (this.currentState?.variables?.text) {
        for (const [key, variableObject] of this.currentState.variables.text.entries()) {
            if (key === name) {
                foundVariable = variableObject;
                break;
            }
        }
    }
    
    // Log the result of a direct Map.get() for comparison
    const variableViaGet = this.currentState.variables.text.get(name); 
    
    // Return the variable found during iteration
    return foundVariable; 
  }

  async setTextVar(name: string, value: string, metadata?: Partial<VariableMetadata>): Promise<TextVariable> {
    this.checkMutable();
    // Create the rich variable object using the factory
    const variable = createTextVariable(name, value, {
      origin: VariableOrigin.DIRECT_DEFINITION,
      ...metadata // Merge provided metadata, overwriting defaults if needed
    });
    // Create a new map, set the variable, and update state
    const text = new Map(this.currentState.variables.text);
    text.set(name, cloneDeep(variable)); // Explicitly cloneDeep the variable object itself
    // NOTE: updateState is now async, but setTextVar remains sync. 
    // This means the event emission might not complete before setTextVar returns.
    // This matches previous behavior but might need review if callers expect sync events.
    await this.updateState({
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

  async setDataVar(name: string, value: JsonValue, metadata?: Partial<VariableMetadata>): Promise<DataVariable> {
    this.checkMutable();
    // Create the rich variable object
    const variable = createDataVariable(name, value, {
      origin: VariableOrigin.DIRECT_DEFINITION,
      ...metadata
    });
    // Create a new map, set the variable, and update state
    const data = new Map(this.currentState.variables.data);
    data.set(name, variable);
    await this.updateState({
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

  async setPathVar(name: string, value: IFilesystemPathState | IUrlPathState, metadata?: Partial<VariableMetadata>): Promise<IPathVariable> {
    this.checkMutable();
    // Create the rich variable object using the factory
    const variable = createPathVariable(name, value, { 
      origin: VariableOrigin.DIRECT_DEFINITION,
      ...metadata
    });
    // Create a new map, set the variable, and update state
    const path = new Map(this.currentState.variables.path);
    path.set(name, variable);
    await this.updateState({
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

  async setCommandVar(name: string, value: ICommandDefinition, metadata?: Partial<VariableMetadata>): Promise<CommandVariable> {
    this.checkMutable();
    // Create the rich variable object
    const variable = createCommandVariable(name, value, {
        origin: VariableOrigin.DIRECT_DEFINITION,
        ...metadata
    });
    // Create a new map, set the variable, and update state
    const commands = new Map(this.currentState.commands);
    commands.set(name, variable);
    await this.updateState({ commands }, `setCommandVar:${name}`); // Update the whole commands map
    return variable; // Return the created object
  }

  getAllCommands(): Map<string, CommandVariable> {
    return new Map(this.currentState.commands);
  }

  /**
   * Gets a command definition by name (preferred over getCommandVar).
   * 
   * @param name - The command name.
   * @returns The command definition or undefined.
   */
  getCommand(name: string): ICommandDefinition | undefined {
    const commandVar = this.getCommandVar(name);
    return commandVar?.value;
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

  transformNode(index: number, replacement: MeldNode | MeldNode[]): void {
    this.checkMutable();
    if (!this._transformationEnabled) {
      logger.debug('Transformation is disabled, skipping node transformation.');
      return; // No transformation if disabled
    }

    // Initialize transformed nodes if they don't exist
    if (!this.currentState.transformedNodes) {
      // Use updateState to initialize
      this.updateState({ transformedNodes: [...this.currentState.nodes] }, 'transformNode:init');
      // Note: currentState is updated by updateState, so we need to read it again if we proceed
    }

    // Re-read currentState as updateState modified it
    const currentTransformedNodes = this.currentState.transformedNodes || [];
    const transformedNodes = [...currentTransformedNodes];

    if (index < 0 || index >= transformedNodes.length) {
      // Log error and return, or throw error based on policy
      logger.error('Invalid index provided for transformNode', { index, length: transformedNodes.length });
      // Consider throwing an error: throw new RangeError('Index out of bounds for transformNode');
      return;
    }

    // Replace node(s) at the specified index
    if (Array.isArray(replacement)) {
      transformedNodes.splice(index, 1, ...replacement);
    } else {
      transformedNodes.splice(index, 1, replacement);
    }

    // Update the state with the new transformed nodes array
    this.updateState({ transformedNodes }, `transformNode:index-${index}`);
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
    return this._transformationEnabled;
  }

  /**
   * Enable/disable transformation with specific options.
   * Replaces the old enableTransformation.
   * @param enabled - Whether transformation should be globally enabled.
   */
  setTransformationEnabled(enabled: boolean): void {
    this.checkMutable();
    this._transformationEnabled = enabled;
    this._transformationOptions = { 
      ...this._transformationOptions, 
      enabled 
    };

    if (this._transformationEnabled && !this.currentState.transformedNodes) {
      this.updateState({ transformedNodes: [...this.currentState.nodes] }, 'setTransformationEnabled:init');
    } else if (!this._transformationEnabled) {
    }
  }

  /**
   * Sets detailed transformation options.
   * @param options - Options controlling transformation behavior.
   */
  setTransformationOptions(options: TransformationOptions): void {
    this.checkMutable();
    this._transformationEnabled = options.enabled;
    this._transformationOptions = { ...options };

    if (this._transformationEnabled && !this.currentState.transformedNodes) {
      this.updateState({ transformedNodes: [...this.currentState.nodes] }, 'setTransformationOptions:init');
    } else if (!this._transformationEnabled) {
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
    
    // Use factory pattern consistently - pass the trackingServiceClientFactory instead of service
    const childState = new StateService(
      this.stateFactory,
      this.eventService,
      this.trackingServiceClientFactory,
      this // Pass self as parent
    );
    
    // No need to manually copy variables here anymore as the StateFactory
    // handles initial state based on parent in createState.
    // We rely on the options passed to createChildState if specific copying is needed.
    
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
      childState.setTransformationEnabled(true); 
      childState.setTransformationOptions(this._transformationOptions);
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

  // Make the method async and await the updateState call
  async mergeChildState(childState: IStateService): Promise<void> {
    this.checkMutable();

    if (!this.isStateService(childState)) {
      logger.error('Cannot merge state: Provided object is not a StateService instance.');
      return;
    }

    const childNode = childState.getInternalStateNode();

    // Delegate the actual state merging logic to the factory
    const mergedNode = this.stateFactory.mergeStates(this.currentState, childNode);

    // Update the current state with the merged result
    // Use updateState to ensure events and potentially other logic are handled
    await this.updateState(mergedNode, `mergeChild:${childNode.stateId}`);

    // Register relationship with tracking service
    this.ensureFactoryInitialized();
    
    if (this.trackingClient) {
      try {
        this.trackingClient.registerRelationship({
          sourceId: this.currentState.stateId,
          targetId: childNode.stateId,
          type: 'merge-source',
          timestamp: Date.now(),
          source: 'merge'
        });
      } catch (error) {
        logger.warn('Error registering merge relationship with trackingClient', { error });
      }
    } else if (this.trackingService) {
      // Fallback to direct service if client is not available
      this.trackingService.registerRelationship({
        sourceId: this.currentState.stateId,
        targetId: childNode.stateId,
        type: 'merge-source',
        timestamp: Date.now(),
        source: 'merge'
      });
    }
  }

  /**
   * Creates a deep clone of this state service
   */
  clone(): IStateService {
    // Fix: Use the StateFactory to create the cloned StateNode
    const clonedNode = this.stateFactory.createClonedState(this.currentState);

    // Fix: Create a new StateService instance using the constructor,
    // passing the factory and event service, but *not* a parent state.
    // This ensures the new service is properly initialized but independent.
    const clonedService = new StateService(
      this.stateFactory,
      this.eventService,
      this.trackingServiceClientFactory // Pass the factory
      // No parent state passed here
    );

    // Manually set the internal state and copy flags for the new instance
    clonedService._setInternalStateNode(clonedNode);
    clonedService._isImmutable = this._isImmutable;
    clonedService._transformationEnabled = this._transformationEnabled;
    clonedService._transformationOptions = { ...this._transformationOptions };

    // Register cloned state with tracking service
    this.ensureFactoryInitialized();
    const originalId = this.getStateId();
    const cloneId = clonedService.getStateId(); // Get ID from the cloned service

    if (originalId && cloneId) {
      if (this.trackingClient) {
        try {
          // Explicitly register the CLONED state
          this.trackingClient.registerState({
            id: cloneId,
            parentId: undefined, // Clones have no parent
            source: clonedNode.source || 'clone', // Use source from cloned node
            filePath: clonedService.getCurrentFilePath() || undefined,
            transformationEnabled: clonedService.isTransformationEnabled(),
            createdAt: Date.now(), // Use current time for clone creation
          });
          // Register clone relationship
          this.trackingClient.registerRelationship({
            sourceId: originalId,
            targetId: cloneId,
            type: 'clone-original',
            timestamp: Date.now(),
            source: 'clone'
          });
        } catch (error) {
          logger.warn('Failed to register clone operation with tracking client', { error });
        }
      } else if (this.trackingService) {
        // Fallback to direct service
        try {
          // Register cloned state if method exists
          if (this.trackingService.registerState) {
             this.trackingService.registerState({
                id: cloneId,
                parentId: undefined,
                source: clonedNode.source || 'clone',
                filePath: clonedService.getCurrentFilePath() || undefined,
                transformationEnabled: clonedService.isTransformationEnabled(),
                createdAt: Date.now(),
                // Fix: Remove clonedFrom as it's not in StateMetadata
                // clonedFrom: originalId
             });
          }
          // Add clone relationship
          // Fix: Use 'clone-original' relationship type if supported by addRelationship
          // Assuming direct service might not support 'clone-original', use parent-child as fallback?
          // OR rely on the registerState call potentially setting the clonedFrom implicitly?
          // For now, let's assume addRelationship takes the standard types and comment out direct setting
          // this.trackingService.addRelationship(originalId, cloneId, 'clone'); 
          logger.debug('Tracking service fallback for clone relationship might need review based on addRelationship capabilities.');
        } catch (error) {
          logger.warn('Failed to register clone operation with tracking service', { error });
        }
      }
    }

    logger.debug('[StateService.clone] Cloned service details:', {
      instanceHasMethod: typeof clonedService.getCurrentFilePath === 'function',
      internalStateFilePath: clonedService.currentState?.filePath,
      internalStateId: clonedService.currentState?.stateId
    });
    return clonedService;
  }

  /**
   * Sets the internal state node directly. 
   * Used internally by clone to initialize the cloned service.
   * @param node The StateNode object to set.
   */
  private _setInternalStateNode(node: StateNode): void {
    this.currentState = node;
    // Optional: Re-initialize flags based on node if needed, but clone handles them explicitly now.
  }

  private checkMutable(): void {
    if (this._isImmutable) {
      throw new Error('Cannot modify immutable state');
    }
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
      enabled: false,
      preserveOriginal: true,
      transformNested: true
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
   * Implement the new interface method
   */
  getInternalStateNode(): StateNode {
    return this.currentState;
  }

  // Implement generic getVariable
  getVariable(name: string, type?: VariableType): MeldVariable | undefined {
    if (type) {
      switch (type) {
        case VariableType.TEXT: return this.getTextVar(name);
        case VariableType.DATA: return this.getDataVar(name);
        case VariableType.PATH: return this.getPathVar(name);
        case VariableType.COMMAND: return this.getCommandVar(name);
        default: return undefined;
      }
    } else {
      // Check in order if type not specified
      return this.getTextVar(name) 
          ?? this.getDataVar(name) 
          ?? this.getPathVar(name) 
          ?? this.getCommandVar(name) 
          ?? undefined;
    }
  }

  // Implement generic setVariable
  async setVariable(variable: MeldVariable): Promise<MeldVariable> {
    this.checkMutable();
    switch (variable.type) {
      case VariableType.TEXT:
        // Pass variable.value (string) to setTextVar
        return await this.setTextVar(variable.name, variable.value, variable.metadata);
      case VariableType.DATA:
        // Pass variable.value (JsonValue) to setDataVar
        return await this.setDataVar(variable.name, variable.value, variable.metadata);
      case VariableType.PATH:
        // Pass variable.value (IFilesystemPathState | IUrlPathState) to setPathVar
        return await this.setPathVar(variable.name, variable.value, variable.metadata);
      case VariableType.COMMAND:
        // Pass variable.value (ICommandDefinition) to setCommandVar
        return await this.setCommandVar(variable.name, variable.value, variable.metadata);
      default:
        // Handle unexpected variable type if necessary, e.g., throw an error
        // or log a warning. For exhaustive check, cast to `never`.
        const exhaustiveCheck: never = variable;
        throw new Error(`Unhandled variable type: ${(exhaustiveCheck as any)?.type}`);
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
  async removeVariable(name: string, type?: VariableType): Promise<boolean> {
    this.checkMutable();
    let removed = false;
    if (type === undefined || type === VariableType.TEXT) {
      const text = new Map(this.currentState.variables.text);
      if (text.delete(name)) {
        await this.updateState({ variables: { ...this.currentState.variables, text }}, `removeVariable:${name}(text)`);
        removed = true;
      }
    }
    if (type === undefined || type === VariableType.DATA) {
      const data = new Map(this.currentState.variables.data);
      if (data.delete(name)) {
        await this.updateState({ variables: { ...this.currentState.variables, data }}, `removeVariable:${name}(data)`);
        removed = true;
      }
    }
    if (type === undefined || type === VariableType.PATH) {
      const path = new Map(this.currentState.variables.path);
      if (path.delete(name)) {
        await this.updateState({ variables: { ...this.currentState.variables, path }}, `removeVariable:${name}(path)`);
        removed = true;
      }
    }
    if (type === undefined || type === VariableType.COMMAND) {
      const commands = new Map(this.currentState.commands);
      if (commands.delete(name)) {
        await this.updateState({ commands }, `removeVariable:${name}(command)`);
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