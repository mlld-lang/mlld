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
  MeldPath
} from '@core/types';
import { 
  VariableOrigin,
  createTextVariable,
  createDataVariable,
  createPathVariable,
  createCommandVariable
} from '@core/types';
import { isTextVariable, isDataVariable, isPathVariable, isCommandVariable } from '@core/types/guards.js';
import { cloneDeep } from 'lodash';
import * as crypto from 'crypto';
import { VariableType } from '@core/types';

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
   * @param parentState - Optional parent state service to inherit from (used for nested imports)
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
  private initializeState(parentService?: IStateService): void {
    const parentNode = parentService?.getInternalStateNode(); 
    this.currentState = this.stateFactory.createState({
      source: 'new',
      parentState: parentNode
    });
    
    // Register state with tracking service if available
    this.ensureFactoryInitialized();
    
    const parentId = parentService ? parentService.getStateId() : undefined;
    
    // Try to use the client from the factory first
    if (this.trackingClient) {
      try {
        this.trackingClient.registerState({
          id: this.currentState.stateId,
          parentId,
          filePath: this.currentState.filePath,
          createdAt: this.currentState.createdAt,
          transformationEnabled: this.isTransformationEnabled(),
          source: this.currentState.source || 'new'
        });
        
        // Explicitly register parent-child relationship if parent exists
        if (parentService && parentId) {
          this.trackingClient.registerRelationship({
            sourceId: parentId,
            targetId: this.currentState.stateId,
            type: 'parent-child',
            timestamp: Date.now(),
            source: this.currentState.source || 'new'
          });
        }
        
        return; // Successfully used the client, no need to try other methods
      } catch (error) {
        logger.warn('Error using trackingClient.registerState, will fall back to direct service if available', { error });
      }
    }
    
    // Fall back to direct tracking service if available
    if (this.trackingService) {
      this.trackingService.registerState({
        id: this.currentState.stateId,
        parentId,
        filePath: this.currentState.filePath,
        createdAt: this.currentState.createdAt,
        transformationEnabled: this.isTransformationEnabled(),
        source: this.currentState.source || 'new'
      });
      
      // Explicitly register parent-child relationship if parent exists
      if (parentService && parentId) {
        this.trackingService.registerRelationship({
          sourceId: parentId,
          targetId: this.currentState.stateId,
          type: 'parent-child',
          timestamp: Date.now(),
          source: this.currentState.source || 'new'
        });
      }
    }
  }

  setEventService(eventService: IStateEventService): void {
    this.eventService = eventService;
  }

  private async emitEvent(event: StateEvent): Promise<void> {
    if (this.eventService) {
      try {
        await this.eventService.emit(event);
      } catch (error) {
        // console.error('[StateService.emitEvent] Error during event emission:', error);
      }
    }
  }

  /**
   * Updates the internal state node and emits a transform event.
   * Made async to ensure event emission is awaited.
   */
  private async updateState(updates: Partial<Omit<StateNode, 'stateId' | 'createdAt' | 'parentServiceRef'>>, source: string): Promise<void> {
    this.checkMutable();
    const oldStateSnapshot = cloneDeep(this.currentState);

    try {
      const newStateNode = this.stateFactory.updateState(this.currentState, updates); 
      this.currentState = newStateNode; 
    } catch (error) {
      logger.error(`Error updating state from source '${source}'`, { error, updates });
      throw error; 
    }

    const event: StateTransformEvent = {
      type: 'transform',
      stateId: this.getStateId() || 'unknown',
      source,
      timestamp: this.currentState.modifiedAt,
      location: {
        file: this.getCurrentFilePath() || undefined
      },
      details: {
        operation: source,
        before: oldStateSnapshot,
        after: cloneDeep(this.currentState)
      }
    };
    
    await this.emitEvent(event);
  }

  // Text variables
  getTextVar(name: string): TextVariable | undefined {
    let foundVariable: TextVariable | undefined = undefined;
    if (this.currentState?.variables?.text) {
        for (const [key, variableObject] of this.currentState.variables.text.entries()) {
            if (key === name) {
                foundVariable = variableObject;
                break;
            }
        }
    }
    
    const variableViaGet = this.currentState.variables.text.get(name); 
    
    return foundVariable; 
  }

  async setTextVar(name: string, value: string, metadata?: Partial<VariableMetadata>): Promise<TextVariable> {
    this.checkMutable();
    const variable = createTextVariable(name, value, {
      origin: VariableOrigin.DIRECT_DEFINITION,
      ...metadata
    });
    const text = new Map(this.currentState.variables.text);
    text.set(name, cloneDeep(variable));
    await this.updateState({
      variables: {
        ...this.currentState.variables,
        text
      }
    }, `setTextVar:${name}`);
    
    const checkVar = this.getTextVar(name);
    process.stdout.write(`DEBUG: [StateService.setTextVar POST-UPDATE] Var '${name}' read back: ${checkVar ? JSON.stringify(checkVar.value) : 'NOT FOUND'}. State ID: ${this.getStateId()}\n`);

    return variable;
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
    const variable = createDataVariable(name, value, {
      origin: VariableOrigin.DIRECT_DEFINITION,
      ...metadata
    });
    const data = new Map(this.currentState.variables.data);
    data.set(name, variable);
    await this.updateState({
      variables: {
        ...this.currentState.variables,
        data
      }
    }, `setDataVar:${name}`);
    return variable;
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
    const variable = createPathVariable(name, value, { 
      origin: VariableOrigin.DIRECT_DEFINITION,
      ...metadata
    });
    const path = new Map(this.currentState.variables.path);
    path.set(name, variable);
    await this.updateState({
      variables: {
        ...this.currentState.variables,
        path
      }
    }, `setPathVar:${name}`);
    return variable;
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
    const variable = createCommandVariable(name, value, {
        origin: VariableOrigin.DIRECT_DEFINITION,
        ...metadata
    });
    const commands = new Map(this.currentState.commands);
    commands.set(name, variable);
    await this.updateState({ commands }, `setCommandVar:${name}`);
    return variable;
  }

  getAllCommands(): Map<string, CommandVariable> {
    return new Map(this.currentState.commands);
  }

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
    if (this.isTransformationEnabled() && this.currentState.transformedNodes) {
      return [...this.currentState.transformedNodes];
    }
    return [...this.currentState.nodes];
  }

  setTransformedNodes(nodes: MeldNode[]): void {
    this.checkMutable();
    if (this.isTransformationEnabled()) {
      this.updateState({ transformedNodes: [...nodes] }, 'setTransformedNodes');
    } else {
      logger.warn('Attempted to set transformed nodes while transformation is disabled.');
    }
  }

  addNode(node: MeldNode): void {
    this.checkMutable();
    const nodeClone = cloneDeep(node);
    const nodes = [...this.currentState.nodes, nodeClone];
    let transformedNodesUpdate: Partial<StateNode> = {};

    if (this.isTransformationEnabled()) {
      const currentTransformed = this.currentState.transformedNodes ? [...this.currentState.transformedNodes] : [...this.currentState.nodes];
      transformedNodesUpdate = { transformedNodes: [...currentTransformed, nodeClone] };
    }

    this.updateState({ nodes, ...transformedNodesUpdate }, `addNode:${node.nodeId}`);
  }

  transformNode(index: number, replacement: MeldNode | MeldNode[] | undefined): void {
    this.checkMutable();
    if (!this.isTransformationEnabled()) {
      logger.debug('Transformation is disabled, skipping node transformation.');
      return;
    }

    const baseTransformedNodes = this.currentState.transformedNodes 
        ? [...this.currentState.transformedNodes] 
        : [...this.currentState.nodes];

    if (index < 0 || index >= baseTransformedNodes.length) {
      logger.error('Invalid index provided for transformNode', { index, length: baseTransformedNodes.length });
      return;
    }

    const replacementClone = cloneDeep(replacement);
    if (Array.isArray(replacementClone)) {
      baseTransformedNodes.splice(index, 1, ...replacementClone);
    } else if (replacementClone !== undefined) { 
      baseTransformedNodes.splice(index, 1, replacementClone);
    } else {
      baseTransformedNodes.splice(index, 1);
    }

    this.updateState({ transformedNodes: baseTransformedNodes }, `transformNode:index-${index}`);
  }

  isTransformationEnabled(): boolean {
    return this.currentState.transformationOptions.enabled;
  }

  shouldTransform(type: string): boolean {
    const options = this.currentState.transformationOptions;
    if (!options.enabled) return false;
    if (options.directiveTypes && options.directiveTypes.length > 0) {
      return options.directiveTypes.includes(type);
    }
    return true;
  }

  setTransformationEnabled(enabled: boolean): void {
    this.checkMutable();
    const newOptions = { 
      ...this.currentState.transformationOptions, 
      enabled 
    };
    this.updateState({ transformationOptions: newOptions }, 'setTransformationEnabled');
  }

  setTransformationOptions(options: TransformationOptions): void {
    this.checkMutable();
    this.updateState({ transformationOptions: { ...options } }, 'setTransformationOptions');
  }

  getTransformationOptions(): TransformationOptions {
    return { ...this.currentState.transformationOptions };
  }

  appendContent(content: string): void {
    this.checkMutable();
    const textNode: TextNode = {
      type: 'Text',
      content,
      location: { start: { line: -1, column: -1 }, end: { line: -1, column: -1 } },
      nodeId: crypto.randomUUID()
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
  hasLocalChanges(): boolean {
    return true;
  }

  getLocalChanges(): string[] {
    return ['state'];
  }

  setImmutable(): void {
    this._isImmutable = true;
  }

  get isImmutable(): boolean {
    return this._isImmutable;
  }

  createChildState(options?: Partial<{ /* VariableCopyOptions TBD */ }>): IStateService {
    this.checkMutable();
    
    const childNode = this.stateFactory.createChildState(this, { 
    });

    const childService = new StateService(
      this.stateFactory,
      this.eventService,
      this.trackingServiceClientFactory,
      this
    );

    childService._setInternalStateNode(childNode);

    this.ensureFactoryInitialized();
    const childId = childService.getStateId();
    if (childId) {
    if (this.trackingClient) {
      try {
        this.trackingClient.registerRelationship({
          sourceId: this.currentState.stateId,
                    targetId: childId,
          type: 'parent-child',
          timestamp: Date.now(),
          source: 'parent'
        });
        if (this.trackingClient.registerEvent) {
          this.trackingClient.registerEvent({
            stateId: this.currentState.stateId,
            type: 'created-child',
            timestamp: Date.now(),
                        details: { childId: childId },
            source: 'parent'
          });
        }
      } catch (error) {
        logger.warn('Failed to register child state creation with tracking client', { error });
      }
    } else if (this.trackingService) {
      try {
                this.trackingService.addRelationship(this.currentState.stateId, childId, 'parent-child');
      } catch (error) {
        logger.warn('Failed to register parent-child relationship with tracking service', { error });
            }
      }
    }
    
    return childService;
  }

  async mergeChildState(childState: IStateService): Promise<void> {
    this.checkMutable();

    if (!this.isStateService(childState)) {
      logger.error('Cannot merge state: Provided object is not a StateService instance.');
      return;
    }

    const childNode = childState.getInternalStateNode();

    const mergedNode = this.stateFactory.mergeStates(this.currentState, childNode);

    const updates: Partial<Omit<StateNode, 'stateId' | 'createdAt' | 'parentServiceRef'>> = {
        variables: mergedNode.variables,
        commands: mergedNode.commands,
        imports: mergedNode.imports,
        nodes: mergedNode.nodes,
        transformedNodes: mergedNode.transformedNodes,
        filePath: mergedNode.filePath,
        transformationOptions: mergedNode.transformationOptions,
        source: mergedNode.source,
        modifiedAt: mergedNode.modifiedAt
    };
    await this.updateState(updates, `mergeChild:${childNode.stateId}`);

    this.ensureFactoryInitialized();
    const childId = childState.getStateId();
    if (childId) {
    if (this.trackingClient) {
      try {
        this.trackingClient.registerRelationship({
          sourceId: this.currentState.stateId,
            targetId: childId,
          type: 'merge-source',
          timestamp: Date.now(),
          source: 'merge'
        });
      } catch (error) {
        logger.warn('Error registering merge relationship with trackingClient', { error });
      }
    } else if (this.trackingService) {
      this.trackingService.registerRelationship({
        sourceId: this.currentState.stateId,
          targetId: childId,
        type: 'merge-source',
        timestamp: Date.now(),
        source: 'merge'
      });
      }
    }
  }

  clone(): IStateService {
    const clonedNode = this.stateFactory.createClonedState(this.currentState);

    const clonedService = new StateService(
      this.stateFactory,
      this.eventService,
      this.trackingServiceClientFactory,
      clonedNode.parentServiceRef
    );

    clonedService._setInternalStateNode(clonedNode);
    clonedService._isImmutable = this._isImmutable;

    this.ensureFactoryInitialized();
    const originalId = this.getStateId();
    const cloneId = clonedService.getStateId();

    if (originalId && cloneId) {
      if (this.trackingClient) {
        try {
          this.trackingClient.registerState({
            id: cloneId,
            parentId: clonedNode.parentServiceRef?.getStateId(),
            source: clonedNode.source || 'clone',
            filePath: clonedService.getCurrentFilePath() || undefined,
            transformationEnabled: clonedService.isTransformationEnabled(),
            createdAt: clonedNode.createdAt,
          });
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
        try {
          if (this.trackingService.registerState) {
             this.trackingService.registerState({
                id: cloneId,
                parentId: clonedNode.parentServiceRef?.getStateId(),
                source: clonedNode.source || 'clone',
                filePath: clonedService.getCurrentFilePath() || undefined,
                transformationEnabled: clonedService.isTransformationEnabled(),
                createdAt: clonedNode.createdAt,
             });
          }
          logger.debug('Tracking service fallback for clone relationship might need review.');
        } catch (error) {
          logger.warn('Failed to register clone operation with tracking service', { error });
        }
      }
    }

    return clonedService;
  }

  private _setInternalStateNode(node: StateNode): void {
    this.currentState = node;
  }

  private checkMutable(): void {
    if (this._isImmutable) {
      throw new Error('Cannot modify immutable state');
    }
  }

  getStateId(): string | undefined {
    return this.currentState.stateId;
  }

  getCommandOutput(command: string): string | undefined {
    if (!this.isTransformationEnabled() || !this.currentState.transformedNodes) {
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
    // Reset to a fresh state using the same initialization logic
    this.initializeState(); // Re-initializes currentState
    
    // Reset flags
    this._isImmutable = false;
    // No need to reset transformation options here as initializeState creates a fresh node with defaults
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
            transformationEnabled: this.isTransformationEnabled(),
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
          transformationEnabled: this.isTransformationEnabled(),
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

  /**
   * Gets a variable by name, optionally specifying the expected type.
   * Looks locally first, then traverses up the parent chain.
   */
  getVariable(name: string, type?: VariableType): MeldVariable | undefined {
    let variable: MeldVariable | undefined = undefined;

    // Look locally
    if (type) {
      switch (type) {
        case VariableType.TEXT: variable = this.currentState.variables.text.get(name); break;
        case VariableType.DATA: variable = this.currentState.variables.data.get(name); break;
        case VariableType.PATH: variable = this.currentState.variables.path.get(name); break;
        case VariableType.COMMAND: variable = this.currentState.commands.get(name); break;
      }
    } else {
      // Check in preferred order if no type specified
      variable =
        this.currentState.variables.text.get(name) ??
        this.currentState.variables.data.get(name) ??
        this.currentState.variables.path.get(name) ??
        this.currentState.commands.get(name);
    }

    // If not found locally, check parent
    if (!variable && this.currentState.parentServiceRef) {
      // Add logging
      process.stdout.write(`DEBUG: [StateService.getVariable] \\"${name}\\" not found locally (State ID: ${this.getStateId()}), checking parent (Parent ID: ${this.currentState.parentServiceRef.getStateId()})...\\n`);
      // Recursive call to parent
      return this.currentState.parentServiceRef.getVariable(name, type);
    }
    
    // If found locally, ensure the type matches if a specific type was requested
    // (This check might be redundant if the initial lookup used the type correctly, but keeps logic clear)
    if (variable && type && variable.type !== type) {
        // logger.debug(`Variable \'${name}\' found locally but type mismatch (Found: ${variable.type}, Expected: ${type}). State ID: ${this.getStateId()}`);
        return undefined; // Type mismatch
    }

    // Return the found variable (or undefined if not found anywhere)
    return variable;
  }

  /**
   * Sets a variable using a pre-constructed MeldVariable object.
   */
  async setVariable(variable: MeldVariable): Promise<MeldVariable> {
    this.checkMutable();
    const variableClone = cloneDeep(variable);
    const { name, type } = variableClone;
    let newVariables = { ...this.currentState.variables };
    let newCommands = this.currentState.commands;

    if (isTextVariable(variableClone)) {
        const textMap = new Map(newVariables.text);
        textMap.set(name, variableClone);
        newVariables = { ...newVariables, text: textMap };
    } else if (isDataVariable(variableClone)) {
        const dataMap = new Map(newVariables.data);
        dataMap.set(name, variableClone);
        newVariables = { ...newVariables, data: dataMap };
    } else if (isPathVariable(variableClone)) {
        const pathMap = new Map(newVariables.path);
        pathMap.set(name, variableClone);
        newVariables = { ...newVariables, path: pathMap };
    } else if (isCommandVariable(variableClone)) {
        newCommands = new Map(newCommands);
        newCommands.set(name, variableClone);
    } else {
        // Handle potential future variable types or throw error
        logger.error('Attempted to set unknown variable type', { variable });
        throw new Error(`Unsupported variable type: ${ (variable as any)?.type }`);
    }

    // Use generic source name for the event
    await this.updateState({ variables: newVariables, commands: newCommands }, `setVariable:${name}`);
    
    // Return the original (or cloned) variable object as per interface
    return variableClone;
  }

  /**
   * Checks if a variable exists, optionally specifying the type.
   * Looks locally first, then traverses up the parent chain.
   */
  hasVariable(name: string, type?: VariableType): boolean {
     // Use getVariable which handles the parent lookup logic
     return !!this.getVariable(name, type);
  }

  /**
   * Removes a variable, optionally specifying the type.
   * Only removes from the local state, does not affect parents.
   */
  async removeVariable(name: string, type?: VariableType): Promise<boolean> {
    this.checkMutable();
    let removed = false;
    let newVariables = { ...this.currentState.variables };
    let newCommands = this.currentState.commands;
    const sourceAction = `removeVariable:${name}${type ? ":" + type : ""}`;

    const varExistsLocally = (mapName: keyof StateNode['variables'] | 'commands') => {
        if (mapName === 'commands') return this.currentState.commands.has(name);
        return this.currentState.variables?.[mapName]?.has(name) ?? false;
    };

    if (type) {
        // Remove specific type
        switch (type) {
            case VariableType.TEXT: 
                if (varExistsLocally('text')) {
                    const textMap = new Map(newVariables.text);
                    removed = textMap.delete(name);
                    newVariables = { ...newVariables, text: textMap };
                }
                break;
            case VariableType.DATA: 
                 if (varExistsLocally('data')) {
                    const dataMap = new Map(newVariables.data);
                    removed = dataMap.delete(name);
                    newVariables = { ...newVariables, data: dataMap };
                }
                break;
            case VariableType.PATH: 
                 if (varExistsLocally('path')) {
                    const pathMap = new Map(newVariables.path);
                    removed = pathMap.delete(name);
                    newVariables = { ...newVariables, path: pathMap };
                }
                break;
            case VariableType.COMMAND: 
                 if (varExistsLocally('commands')) {
                    newCommands = new Map(newCommands);
                    removed = newCommands.delete(name);
                 }
                 break;
        }
    } else {
        // Remove first found type in order
        if (varExistsLocally('text')) {
             const textMap = new Map(newVariables.text);
             removed = textMap.delete(name);
             newVariables = { ...newVariables, text: textMap };
        } else if (varExistsLocally('data')) {
             const dataMap = new Map(newVariables.data);
             removed = dataMap.delete(name);
             newVariables = { ...newVariables, data: dataMap };
        } else if (varExistsLocally('path')) {
             const pathMap = new Map(newVariables.path);
             removed = pathMap.delete(name);
             newVariables = { ...newVariables, path: pathMap };
        } else if (varExistsLocally('commands')) {
             newCommands = new Map(newCommands);
             removed = newCommands.delete(name);
        }
    }

    if (removed) {
        await this.updateState({ variables: newVariables, commands: newCommands }, sourceAction);
    }
    return removed;
  }

  // Add getParentState method to satisfy interface
  getParentState(): IStateService | undefined {
    return this.currentState.parentServiceRef;
  }
} 