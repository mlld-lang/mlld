import type { MeldNode, TextNode } from '@core/ast/types/index';
import { stateLogger as logger } from '@core/utils/logger';
import type { IStateService, TransformationOptions } from '@services/state/StateService/IStateService';
import type { StateNode } from '@services/state/StateService/types';
import { StateFactory } from '@services/state/StateService/StateFactory';
import type { IStateEventService, StateEvent, StateTransformEvent } from '@services/state/StateEventService/IStateEventService';
import { inject, container, injectable } from 'tsyringe';
import type { DependencyContainer } from 'tsyringe';
import { Service } from '@core/ServiceProvider';
import { StateTrackingServiceClientFactory } from '@services/state/StateTrackingService/factories/StateTrackingServiceClientFactory';
import type { IStateTrackingServiceClient } from '@services/state/StateTrackingService/interfaces/IStateTrackingServiceClient';
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
  VariableCopyOptions
} from '@core/types';
import { 
  VariableOrigin,
  createTextVariable,
  createDataVariable,
  createPathVariable,
  createCommandVariable
} from '@core/types';
import { isTextVariable, isDataVariable, isPathVariable, isCommandVariable } from '@core/types/guards';
import cloneDeep from 'lodash/cloneDeep';
import * as crypto from 'crypto';
import { VariableType } from '@core/types';
import type { StateChanges } from '@core/directives/DirectiveHandler';
import assert from 'node:assert';
import type { IStateTrackingService } from '@tests/utils/debug/StateTrackingService/IStateTrackingService';

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
  private stateFactory: StateFactory;
  private currentState!: StateNode;
  private _isImmutable: boolean = false;
  private eventService?: IStateEventService;
  private parentService?: IStateService;
  private container: DependencyContainer;
  
  // Factory pattern properties
  private trackingServiceClientFactory?: StateTrackingServiceClientFactory;
  private trackingClient?: IStateTrackingServiceClient;
  private factoryInitialized: boolean = false;

  /**
   * Creates a new StateService instance using dependency injection
   * 
   * @param stateFactory - Factory for creating state nodes (required)
   * @param container - Dependency container for resolving dependencies (required)
   * @param eventService - Service for handling state events and notifications (optional)
   * @param trackingServiceClientFactory - Factory for creating tracking service clients (optional)
   * @param injectedParentState - Optional parent state service to inherit from (used for nested imports)
   * @param directParentState - Keep direct parentState for potential root-level creation (though DI is preferred)
   */
  constructor(
    // Required dependencies first
    @inject(StateFactory) stateFactory: StateFactory,
    @inject('DependencyContainer') container: DependencyContainer,
    // Optional dependencies 
    @inject('IStateEventService', { isOptional: true }) eventService?: IStateEventService,
    @inject(StateTrackingServiceClientFactory, { isOptional: true }) trackingServiceClientFactory?: StateTrackingServiceClientFactory,
    // Optional parent state (either passed directly for root or injected for child)
    @inject('ParentStateServiceForChild', { isOptional: true }) injectedParentState?: IStateService,
    // Keep direct parentState for potential root-level creation (though DI is preferred)
    directParentState?: IStateService 
  ) {
    // Assign required dependencies
    this.stateFactory = stateFactory;
    this.container = container;
    
    // Assign optional dependencies
    this.eventService = eventService;
    this.trackingServiceClientFactory = trackingServiceClientFactory;
    
    // Determine parent: Prioritize injected parent (from child container resolution)
    this.parentService = injectedParentState || directParentState;
    
    // Initialize tracking client factory if provided
    if (this.trackingServiceClientFactory) {
        this.factoryInitialized = true;
        this.initializeTrackingClient();
    } else {
        this.factoryInitialized = false;
    }
    
    // Initialize state with parent if provided
    // Ensure stateFactory is assigned before calling initializeState
    this.initializeState(this.parentService);
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
      this.trackingServiceClientFactory = this.container.resolve(StateTrackingServiceClientFactory);
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
    } catch (error) {
      logger.warn('Failed to create tracking client', { error });
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
    
    // console.log('DEBUG: [initializeState] Initializing state', {
    //   hasParentService: !!parentService,
    //   parentServiceId: parentService?.getStateId(),
    //   parentNodeId: parentNode?.stateId,
    //   hasStateFactory: !!this.stateFactory,
    //   hasTrackingServiceFactory: !!this.trackingServiceClientFactory,
    //   factoryInitialized: this.factoryInitialized
    // });

    this.currentState = this.stateFactory.createState({
      source: 'new',
      parentState: parentNode ? {
        stateId: parentNode.stateId,
        variables: parentNode.variables,
        commands: parentNode.commands,
        imports: parentNode.imports,
        // Add required properties with defaults
        nodes: [],
        transformationOptions: {
          enabled: false,
          preserveOriginal: true,
          transformNested: true
        },
        createdAt: Date.now(),
        modifiedAt: Date.now()
      } : undefined
    });
    
    // Register state with tracking service if available
    this.ensureFactoryInitialized();
    
    const parentId = parentService ? parentService.getStateId() : undefined;
    
    // console.log('DEBUG: [initializeState] State created', {
    //   stateId: this.currentState.stateId,
    //   source: this.currentState.source,
    //   parentId,
    //   hasTrackingClient: !!this.trackingClient,
    //   factoryInitializedAfterEnsure: this.factoryInitialized
    // });
    
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
          // console.log('DEBUG: [initializeState] Registering parent-child relationship', {
          //   parentId,
          //   childId: this.currentState.stateId,
          //   source: this.currentState.source || 'new'
          // });
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
        // console.log('DEBUG: [initializeState] Error using trackingClient.registerState', {
        //   error,
        //   stateId: this.currentState.stateId,
        //   trackingClientMethods: Object.keys(this.trackingClient),
        //   trackingClientType: typeof this.trackingClient
        // });
        logger.warn('Error using trackingClient.registerState, will fall back to direct service if available', { error });
      }
    }
    
    // Fall back to direct tracking service if available
    if (this.trackingServiceClientFactory) {
      // console.log('DEBUG: [initializeState] Attempting to create new tracking client', {
      //   hasFactory: !!this.trackingServiceClientFactory,
      //   factoryMethods: Object.keys(this.trackingServiceClientFactory)
      // });

      const client = this.trackingServiceClientFactory.createClient();
      client.registerState({
        id: this.currentState.stateId,
        parentId,
        filePath: this.currentState.filePath,
        createdAt: this.currentState.createdAt,
        transformationEnabled: this.isTransformationEnabled(),
        source: this.currentState.source || 'new'
      });
      
      // Explicitly register parent-child relationship if parent exists
      if (parentService && parentId) {
        client.registerRelationship({
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
      const oldStateId = this.currentState?.stateId;
      const newStateId = newStateNode?.stateId;
      const oldTransformedNodes = this.currentState?.transformedNodes;
      const newTransformedNodes = newStateNode?.transformedNodes;
      logger.debug(`[StateService updateState] BEFORE assignment`, {
          source,
          oldStateId,
          oldTransformedNodesLength: oldTransformedNodes?.length,
          oldTransformedFirstNodeId: oldTransformedNodes?.[0]?.nodeId,
          updatesKeys: Object.keys(updates),
          hasUpdateTransformedNodes: updates.hasOwnProperty('transformedNodes'),
          updateTransformedNodesLength: (updates as any).transformedNodes?.length
      });
      this.currentState = newStateNode; 
      logger.debug(`[StateService updateState] AFTER assignment`, {
          source,
          newStateId,
          currentStateIdNow: this.currentState?.stateId,
          currentStateTransformedNodesLength: this.currentState?.transformedNodes?.length,
          currentStateTransformedFirstNodeId: this.currentState?.transformedNodes?.[0]?.nodeId,
          areNodesSameObject: oldTransformedNodes === newTransformedNodes, // Should be false
          areStateNodesSameObject: oldStateSnapshot === this.currentState // Should be false
      });
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

  async setTextVar(name: string, value: string, metadata?: Partial<VariableMetadata>): Promise<void> {
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

  async setDataVar(name: string, value: JsonValue, metadata?: Partial<VariableMetadata>): Promise<void> {
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

  async setPathVar(name: string, value: IFilesystemPathState | IUrlPathState, metadata?: Partial<VariableMetadata>): Promise<void> {
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
  }

  getAllPathVars(): Map<string, IPathVariable> {
    return new Map(this.currentState.variables.path);
  }

  // Commands
  getCommandVar(name: string): CommandVariable | undefined {
    return this.currentState.commands.get(name);
  }

  async setCommandVar(name: string, value: ICommandDefinition, metadata?: Partial<VariableMetadata>): Promise<void> {
    this.checkMutable();
    const variable = createCommandVariable(name, value, {
        origin: VariableOrigin.DIRECT_DEFINITION,
        ...metadata
    });
    const commands = new Map(this.currentState.commands);
    commands.set(name, variable);
    await this.updateState({ commands }, `setCommandVar:${name}`);
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
    const transformEnabled = this.isTransformationEnabled();
    const transformedNodesArray = this.currentState.transformedNodes;
    const transformedNodesExist = !!transformedNodesArray;
    const originalNodes = this.currentState.nodes;
    const stateId = this.getStateId();
    
    // +++ Add detailed logging before return +++
    const originalLength = originalNodes?.length;
    const transformedLength = transformedNodesArray?.length;
    
    const originalLastType = (typeof originalLength === 'number' && originalLength > 0) 
        ? originalNodes[originalLength - 1]?.type ?? 'N/A' 
        : 'N/A';
    const transformedLastType = (typeof transformedLength === 'number' && transformedLength > 0 && transformedNodesArray)
        ? transformedNodesArray[transformedLength - 1]?.type ?? 'N/A'
        : 'N/A';

    process.stdout.write(
        `>>> [getTransformedNodes PRE-RETURN] StateID: ${stateId}\n` +
        `    TransformEnabled: ${transformEnabled}, TransformedExists: ${transformedNodesExist}\n` +
        `    Original Nodes: Length=${originalLength ?? 'null'}, LastType=${originalLastType}\n` +
        `    Transformed Nodes: Length=${transformedLength ?? 'null'}, LastType=${transformedLastType}\n`
    );
    // +++ End logging +++
    
    if (transformEnabled && transformedNodesExist) {
      const arrayToReturn = transformedNodesArray!.slice();
      process.stdout.write(`>>> [getTransformedNodes RETURN] RETURNING SLICE (Transformed): ${JSON.stringify(arrayToReturn.slice(0, 3).map(n=>({type: n.type, nodeId: n.nodeId})))}\n\n`);
      return arrayToReturn;
    } else {
      const arrayToReturn = originalNodes.slice(); 
      process.stdout.write(`>>> [getTransformedNodes RETURN] RETURNING SLICE (Original): ${JSON.stringify(arrayToReturn.slice(0, 3).map(n=>({type: n.type, nodeId: n.nodeId})))}\n\n`);
      return arrayToReturn;
    }
  }

  async setTransformedNodes(nodes: MeldNode[]): Promise<void> {
    this.checkMutable();
    if (this.isTransformationEnabled()) {
      await this.updateState({ transformedNodes: [...nodes] }, 'setTransformedNodes');
    } else {
      logger.warn('Attempted to set transformed nodes while transformation is disabled.');
    }
  }

  async addNode(node: MeldNode): Promise<void> {
    this.checkMutable();
    // Clone everything except the nodeId
    const { nodeId, ...rest } = node;
    // Create new node with original nodeId
    const nodeClone = {
      ...cloneDeep(rest),
      nodeId
    };
    
    const nodes = [...this.currentState.nodes, nodeClone];
    let transformedNodesUpdate: Partial<StateNode> = {};

    if (this.isTransformationEnabled()) {
      const currentTransformed = this.currentState.transformedNodes ? [...this.currentState.transformedNodes] : [...this.currentState.nodes];
      transformedNodesUpdate = { transformedNodes: [...currentTransformed, nodeClone] };
    }

    await this.updateState({ nodes, ...transformedNodesUpdate }, `addNode:${node.nodeId}`);
  }

  async transformNode(index: number, replacement: MeldNode | MeldNode[] | undefined): Promise<void> {
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

    let replacementClone;
    if (Array.isArray(replacement)) {
      // Clone array of nodes while preserving nodeIds
      replacementClone = replacement.map(node => {
        const { nodeId, ...rest } = node;
        return {
          ...cloneDeep(rest),
          nodeId
        };
      });
    } else if (replacement !== undefined) {
      // Clone single node while preserving nodeId
      const { nodeId, ...rest } = replacement;
      replacementClone = {
        ...cloneDeep(rest),
        nodeId
      };
    } else {
      replacementClone = undefined;
    }

    if (Array.isArray(replacementClone)) {
      baseTransformedNodes.splice(index, 1, ...replacementClone);
    } else if (replacementClone !== undefined) { 
      baseTransformedNodes.splice(index, 1, replacementClone);
    } else {
      baseTransformedNodes.splice(index, 1);
    }

    await this.updateState({ transformedNodes: baseTransformedNodes }, `transformNode:index-${index}`);
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

  async setTransformationEnabled(enabled: boolean): Promise<void> {
    this.checkMutable();
    const newOptions = { 
      ...this.currentState.transformationOptions, 
      enabled 
    };
    await this.updateState({ transformationOptions: newOptions }, 'setTransformationEnabled');
  }

  async setTransformationOptions(options: TransformationOptions): Promise<void> {
    this.checkMutable();
    await this.updateState({ transformationOptions: { ...options } }, 'setTransformationOptions');
  }

  getTransformationOptions(): TransformationOptions {
    return { ...this.currentState.transformationOptions };
  }

  async appendContent(content: string): Promise<void> {
    this.checkMutable();
    const textNode: TextNode = {
      type: 'Text',
      nodeId: crypto.randomUUID(),
      location: { start: { line: -1, column: -1 }, end: { line: -1, column: -1 } },
      content
    };
    await this.addNode(textNode);
  }

  // Imports
  async addImport(path: string): Promise<void> {
    this.checkMutable();
    const imports = new Set(this.currentState.imports);
    imports.add(path);
    await this.updateState({ imports }, `addImport:${path}`);
  }

  async removeImport(path: string): Promise<void> {
    this.checkMutable();
    const imports = new Set(this.currentState.imports);
    imports.delete(path);
    await this.updateState({ imports }, `removeImport:${path}`);
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

  async setCurrentFilePath(path: string): Promise<void> {
    this.checkMutable();
    await this.updateState({ filePath: path }, 'setCurrentFilePath');
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

  createChildState(options?: Partial<VariableCopyOptions>): IStateService {
    // Add debug info about parent state
    const parentStateId = this.getStateId();
    const parentFilePath = this.getCurrentFilePath();
    const parentStateVars = {
      textVarCount: this.currentState.variables.text.size,
      dataVarCount: this.currentState.variables.data.size,
      pathVarCount: this.currentState.variables.path.size,
      commandCount: this.currentState.commands.size,
      importCount: this.currentState.imports.size
    };

    // console.log('DEBUG: [createChildState] Creating child state', { 
    //   parentStateId, 
    //   parentFilePath,
    //   options,
    //   parentStateVars,
    //   parentStateSource: this.currentState.source,
    //   parentStateCreatedAt: this.currentState.createdAt,
    //   parentStateModifiedAt: this.currentState.modifiedAt,
    //   parentStateTransformationEnabled: this.isTransformationEnabled()
    // });

    // Create child node with source from state factory
    const childNode = this.stateFactory.createChildState(this.currentState, { 
      source: 'child' // Use a fixed source since it's not part of VariableCopyOptions
    });
    
    // Create a child container to scope the parent state registration
    const childContainer = this.container.createChildContainer();
    
    // Register this service as the parent in the child container
    childContainer.register<IStateService>('ParentStateServiceForChild', {
      useValue: this
    });
    
    // Register the child container itself (needed by StateService constructor)
    childContainer.registerInstance('DependencyContainer', childContainer);
    
    // Resolve a new StateService instance from the child container
    const childService = childContainer.resolve<StateService>(StateService);
    
    // Set the child's state node
    childService._setInternalStateNode(childNode);

    // Add debug info about child state
    const childStateId = childService.getStateId();
    const childFilePath = childService.getCurrentFilePath();
    const childStateVars = {
      textVarCount: childNode.variables.text.size,
      dataVarCount: childNode.variables.data.size,
      pathVarCount: childNode.variables.path.size,
      commandCount: childNode.commands.size,
      importCount: childNode.imports.size
    };

    // console.log('DEBUG: [createChildState] Child state created', {
    //   childStateId,
    //   childFilePath,
    //   childStateVars,
    //   childStateSource: childNode.source,
    //   childStateCreatedAt: childNode.createdAt,
    //   childStateModifiedAt: childNode.modifiedAt,
    //   childStateTransformationEnabled: childService.isTransformationEnabled(),
    //   childStateParentId: childService.getParentState()?.getStateId()
    // });

    // Add stack trace for debugging
    // console.log('DEBUG: [createChildState] Stack trace:', new Error().stack);
    
    return childService;
  }

  async mergeChildState(childState: IStateService): Promise<void> {
    this.checkMutable();

    if (!this.isStateService(childState)) {
      logger.error('Cannot merge state: Provided object is not a StateService instance.');
      return;
    }

    const childNode = childState.getInternalStateNode();
    const updates: Partial<Omit<StateNode, 'stateId' | 'createdAt' | 'parentServiceRef'>> = {
      variables: childNode.variables,
      commands: childNode.commands,
      imports: childNode.imports,
      // Add nodes to the updates
      nodes: [...this.currentState.nodes, ...childState.getNodes()],
      // Handle transformed nodes if transformation is enabled
      transformedNodes: this.isTransformationEnabled() 
        ? [...(this.currentState.transformedNodes || []), ...childState.getTransformedNodes()]
        : this.currentState.transformedNodes,
      source: 'merge',
      modifiedAt: Date.now()
    };
    
    await this.updateState(updates, `mergeChild:${childNode.stateId}`);

    this.ensureFactoryInitialized();
    this.initializeTrackingClient();

    const childId = childState.getStateId();
    if (childId && this.trackingClient) {
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
    }
  }

  clone(): IStateService {
    const clonedNode = this.stateFactory.createClonedState(this.currentState);

    const clonedService = new StateService(
      this.stateFactory,
      this.container,
      this.eventService,
      this.trackingServiceClientFactory,
      this.parentService
    );

    clonedService._setInternalStateNode(clonedNode);
    clonedService._isImmutable = this._isImmutable;

    this.ensureFactoryInitialized();
    this.initializeTrackingClient();

    const originalId = this.getStateId();
    const cloneId = clonedService.getStateId();

    if (originalId && cloneId && this.trackingClient) {
      try {
        this.trackingClient.registerState({
          id: cloneId,
          parentId: this.parentService?.getStateId(),
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
    // Create a new factory instance
    const factory = new StateTrackingServiceClientFactory(trackingService);
    this.trackingServiceClientFactory = factory;
    
    // Register existing state if not already registered
    if (this.currentState.stateId) {
      // Ensure factory is initialized and client is created
      this.ensureFactoryInitialized();
      
      // Try to use the client from the factory
      if (this.trackingClient) {
        try {
          this.trackingClient.registerState({
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
  }

  /**
   * Gets the minimal state data needed for parent-child relationships.
   * @internal
   */
  getInternalStateNode(): Pick<StateNode, 'stateId' | 'variables' | 'commands' | 'imports'> {
    return {
      stateId: this.currentState.stateId,
      variables: this.currentState.variables,
      commands: this.currentState.commands,
      imports: this.currentState.imports
    };
  }

  /**
   * Gets a variable by name, optionally specifying the expected type.
   * Looks locally first, then traverses up the parent chain.
   */
  getVariable(name: string, type?: VariableType): MeldVariable | undefined {
    let variable: MeldVariable | undefined = undefined;
    const stateId = this.getStateId(); // Get ID once

    if (type) {
      // process.stdout.write(`DEBUG [getVariable LOOKUP] StateID: ${stateId}, Type: ${type}, Name: '${name}'\n`);
      let targetMap: Map<string, MeldVariable> | undefined;
      let mapName: string = 'unknown';
      switch (type) {
        case VariableType.TEXT: targetMap = this.currentState.variables.text as Map<string, MeldVariable>; mapName='Text'; break;
        case VariableType.DATA: targetMap = this.currentState.variables.data as Map<string, MeldVariable>; mapName='Data'; break;
        case VariableType.PATH: targetMap = this.currentState.variables.path as Map<string, MeldVariable>; mapName='Path'; break;
        case VariableType.COMMAND: targetMap = this.currentState.commands as Map<string, MeldVariable>; mapName='Command'; break;
      }
      if (targetMap) {
          // process.stdout.write(`DEBUG [getVariable SIZE] Type: ${mapName}, StateID: ${stateId}. Map size: ${targetMap.size}\n`);
          let keysFound = '';
          try {
            for (const key of targetMap.keys()) {
              keysFound += key + ', ';
            }
          } catch (e) { keysFound = 'ERROR_ITERATING_KEYS'; }
          // process.stdout.write(`DEBUG [getVariable ITERATED_KEYS] Type: ${mapName}, StateID: ${stateId}. Keys: [${keysFound}]\n`);
          
          // +++ Log Instance Check +++
          let isSameInstance = false;
          if (mapName === 'Text') isSameInstance = Object.is(targetMap, this.currentState.variables.text);
          else if (mapName === 'Data') isSameInstance = Object.is(targetMap, this.currentState.variables.data);
          else if (mapName === 'Path') isSameInstance = Object.is(targetMap, this.currentState.variables.path);
          else if (mapName === 'Command') isSameInstance = Object.is(targetMap, this.currentState.commands);
          // process.stdout.write(`DEBUG [getVariable INSTANCE_CHECK] Type: ${mapName}, StateID: ${stateId}. Is targetMap same instance as currentState map? ${isSameInstance}\n`);
          // +++ End Instance Check +++

          const hasKey = targetMap.has(name);
          // process.stdout.write(`DEBUG [getVariable CHECK] Type: ${mapName}, StateID: ${stateId}. Map has key '${name}'? ${hasKey}\n`);
          const valueFromGet = targetMap.get(name);
          // process.stdout.write(`DEBUG [getVariable GET] Type: ${mapName}, StateID: ${stateId}. Value from .get('${name}'): ${valueFromGet !== undefined ? 'FOUND' : 'UNDEFINED'}\n`);
          variable = valueFromGet;
    } else {
          // process.stdout.write(`DEBUG [getVariable CHECK] Type: ${mapName}, StateID: ${stateId}. Target map is undefined!\n`);
      }

    } else {
      // process.stdout.write(`DEBUG [getVariable LOOKUP] StateID: ${stateId}, Type: ANY, Name: '${name}'\n`);
      let textMap = this.currentState.variables.text;
      let hasKey = textMap.has(name);
      // process.stdout.write(`DEBUG [getVariable CHECK-ANY] Type: TEXT, StateID: ${stateId}. Map has key '${name}'? ${hasKey}\n`);
      const valueFromText = textMap.get(name);
      variable = valueFromText;
      
      if (!variable) {
          let dataMap = this.currentState.variables.data;
          hasKey = dataMap.has(name);
          // process.stdout.write(`DEBUG [getVariable CHECK-ANY] Type: DATA, StateID: ${stateId}. Map has key '${name}'? ${hasKey}\n`);
          const valueFromData = dataMap.get(name);
          variable = valueFromData;
      }
      if (!variable) {
          let pathMap = this.currentState.variables.path;
          hasKey = pathMap.has(name);
          // process.stdout.write(`DEBUG [getVariable CHECK-ANY] Type: PATH, StateID: ${stateId}. Map has key '${name}'? ${hasKey}\n`);
          const valueFromPath = pathMap.get(name);
          variable = valueFromPath;
      }
      if (!variable) {
          let commandMap = this.currentState.commands;
          hasKey = commandMap.has(name);
          // process.stdout.write(`DEBUG [getVariable CHECK-ANY] Type: COMMAND, StateID: ${stateId}. Map has key '${name}'? ${hasKey}\n`);
          const valueFromCommand = commandMap.get(name);
          variable = valueFromCommand;
      }
    }

    // If not found locally, check parent
    if (!variable && this.parentService) {
      // process.stdout.write(`DEBUG [getVariable PARENT] StateID: ${stateId}, Var '${name}' not local, checking parent: ${this.parentService.getStateId()}\n`);
      return this.parentService.getVariable(name, type);
    }
    
    // Type mismatch check
    if (variable && type && variable.type !== type) {
        // process.stdout.write(`DEBUG [getVariable TYPE-MISMATCH] StateID: ${stateId}, Var '${name}', Found: ${variable.type}, Expected: ${type}\n`);
        return undefined; 
    }

    // process.stdout.write(`DEBUG [getVariable FINAL] StateID: ${stateId}, Var '${name}', Found: ${!!variable} (Type: ${variable?.type})\n`);
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

    // +++ Log variable being set +++
    // process.stdout.write(`DEBUG [setVariable ENTRY] Setting '${name}' (Type: ${type}). StateID: ${this.getStateId()}\n`);

    if (isTextVariable(variableClone)) {
        const textMap = new Map(newVariables.text);
        textMap.set(name, variableClone);
        newVariables = { ...newVariables, text: textMap };
        // +++ Log map content BEFORE updateState +++
        // process.stdout.write(`DEBUG [setVariable PRE-UPDATE] textMap for '${name}' has key? ${textMap.has(name)}\n`);
    } else if (isDataVariable(variableClone)) {
        const dataMap = new Map(newVariables.data);
        dataMap.set(name, variableClone);
        newVariables = { ...newVariables, data: dataMap };
        // process.stdout.write(`DEBUG [setVariable PRE-UPDATE] dataMap for '${name}' has key? ${dataMap.has(name)}\n`);
    } else if (isPathVariable(variableClone)) {
        const pathMap = new Map(newVariables.path);
        pathMap.set(name, variableClone);
        newVariables = { ...newVariables, path: pathMap };
        // process.stdout.write(`DEBUG [setVariable PRE-UPDATE] pathMap for '${name}' has key? ${pathMap.has(name)}\n`);
    } else if (isCommandVariable(variableClone)) {
        newCommands = new Map(newCommands);
        newCommands.set(name, variableClone);
        // process.stdout.write(`DEBUG [setVariable PRE-UPDATE] commands map for '${name}' has key? ${newCommands.has(name)}\n`);
    } else {
        logger.error('Attempted to set unknown variable type', { variable });
        throw new Error(`Unsupported variable type: ${ (variable as any)?.type }`);
    }

    await this.updateState({ variables: newVariables, commands: newCommands }, `setVariable:${name}`);
    
    // +++ Log map content AFTER updateState (accessing the updated this.currentState) +++
    let found = false;
    if (type === VariableType.TEXT) found = this.currentState.variables.text.has(name);
    else if (type === VariableType.DATA) found = this.currentState.variables.data.has(name);
    else if (type === VariableType.PATH) found = this.currentState.variables.path.has(name);
    else if (type === VariableType.COMMAND) found = this.currentState.commands.has(name);
    // process.stdout.write(`DEBUG [setVariable POST-UPDATE] StateID: ${this.getStateId()}. Var '${name}' found in correct map? ${found}\n`);
    
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
    return this.parentService;
  }

  /**
   * Applies the given state changes to the current state, returning a new state instance.
   * @param changes The state changes to apply.
   * @returns A new IStateService instance reflecting the applied changes.
   * @throws MeldError if changes are invalid or cannot be applied.
   */
  async applyStateChanges(changes: StateChanges): Promise<IStateService> {
    this.checkMutable();

    // Create a new state instance based on the current one to apply changes to
    const newStateService = this.clone();

    // <<< Refactor to use changes.variables >>>
    let setOperations = 0;
    if (changes.variables) {
      for (const [name, variable] of Object.entries(changes.variables)) {
        if (variable === undefined || variable === null) {
          // Handle potential removals if needed in the future (e.g., if value is explicitly null/undefined)
          // logger.debug(`Skipping removal for variable via StateChanges (not implemented): ${name}`, { stateId: newStateService.getStateId() });
          // For now, we only handle setting variables.
          logger.debug(`Applying set change for variable: ${name} (Type: ${(variable as any)?.type})`, { stateId: newStateService.getStateId() });
          // Assume variable is a valid MeldVariable structure if not null/undefined
          // Type assertion might be needed if 'any' causes issues, but Record<string, any> forces it.
          await newStateService.setVariable(variable as MeldVariable);
          setOperations++;
        } else {
          // Handle setting the variable
          logger.debug(`Applying set change for variable: ${name} (Type: ${(variable as any)?.type})`, { stateId: newStateService.getStateId() });
          // Assume variable is a valid MeldVariable structure
          await newStateService.setVariable(variable as MeldVariable);
          setOperations++;
        }
      }
    }
    // <<< End Refactor >>>

    // No need to call updateState here, as clone() creates a new node
    // and setVariable/removeVariable on the cloned instance already update its internal node
    // We might want to emit a specific 'stateChangesApplied' event here if needed.

    logger.debug('Finished applying state changes.', { 
      stateId: newStateService.getStateId(), 
      // removals: changes.remove?.length ?? 0, // Removed this part
      sets: setOperations 
    });

    // Return the new state instance with changes applied
    return newStateService;
  }
} 