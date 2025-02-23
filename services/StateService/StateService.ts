import type { MeldNode, TextNode } from 'meld-spec';
import { stateLogger as logger } from '@core/utils/logger.js';
import type { IStateService } from './IStateService.js';
import type { StateNode, CommandDefinition } from './types.js';
import { StateFactory } from './StateFactory.js';
import type { IStateEventService, StateEvent } from '../StateEventService/IStateEventService.js';
import type { IStateTrackingService } from '../StateTrackingService/IStateTrackingService.js';

export class StateService implements IStateService {
  private stateFactory: StateFactory;
  private currentState: StateNode;
  private _isImmutable: boolean = false;
  private _transformationEnabled: boolean = false;
  private eventService?: IStateEventService;
  private trackingService?: IStateTrackingService;

  constructor(parentState?: IStateService) {
    this.stateFactory = new StateFactory();
    this.currentState = this.stateFactory.createState({
      source: 'new',
      parentState: parentState ? (parentState as StateService).currentState : undefined
    });

    // If parent has services, inherit them
    if (parentState) {
      const parent = parentState as StateService;
      if (parent.eventService) {
        this.eventService = parent.eventService;
      }
      if (parent.trackingService) {
        this.trackingService = parent.trackingService;
      }
    }

    // Initialize state ID first
    this.currentState.stateId = crypto.randomUUID();

    // Register state with tracking service if available
    if (this.trackingService) {
      const parentId = parentState ? (parentState as StateService).currentState.stateId : undefined;
      
      // Register the state with the pre-generated ID
      this.trackingService.registerState({
        id: this.currentState.stateId,
        source: 'new',
        parentId,
        filePath: this.currentState.filePath,
        transformationEnabled: this._transformationEnabled
      });

      // Add relationship if this is a child state and parent has an ID
      if (parentId) {
        try {
          this.trackingService.addRelationship(parentId, this.currentState.stateId, 'parent-child');
        } catch (error) {
          logger.warn('Failed to add child relationship', { error, parentId, childId: this.currentState.stateId });
        }
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
    
    // Find the original node by comparing content and location
    const index = transformedNodes.findIndex(node => 
      node.type === original.type && 
      JSON.stringify(node.location) === JSON.stringify(original.location) &&
      (node as any).content === (original as any).content
    );

    if (index !== -1) {
      transformedNodes[index] = transformed;
    } else {
      // If not found, check if it's in the original nodes array
      const originalIndex = this.currentState.nodes.findIndex(node =>
        node.type === original.type &&
        JSON.stringify(node.location) === JSON.stringify(original.location) &&
        (node as any).content === (original as any).content
      );
      
      if (originalIndex === -1) {
        throw new Error('Cannot transform node: original node not found');
      }
      
      transformedNodes.push(transformed);
    }
    
    this.updateState({ transformedNodes }, 'transformNode');
  }

  isTransformationEnabled(): boolean {
    return this._transformationEnabled;
  }

  enableTransformation(enable: boolean): void {
    this._transformationEnabled = enable;
    if (enable && (!this.currentState.transformedNodes || this.currentState.transformedNodes.length === 0)) {
      // Initialize transformed nodes with current nodes when enabling transformation
      this.updateState({ transformedNodes: [...this.currentState.nodes] }, 'enableTransformation');
    }
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
  hasLocalChanges(): boolean {
    return true; // In immutable model, any non-empty state has local changes
  }

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
    const child = new StateService(this);
    logger.debug('Created child state', {
      parentPath: this.getCurrentFilePath(),
      childPath: child.getCurrentFilePath()
    });

    // Emit create event
    this.emitEvent({
      type: 'create',
      stateId: child.currentState.filePath || 'unknown',
      source: 'createChildState',
      timestamp: Date.now(),
      location: {
        file: this.getCurrentFilePath() || undefined
      }
    });

    return child;
  }

  mergeChildState(childState: IStateService): void {
    this.checkMutable();
    const child = childState as StateService;
    this.currentState = this.stateFactory.mergeStates(this.currentState, child.currentState);

    // Add merge relationship if tracking enabled
    if (this.trackingService && child.currentState.stateId) {
      this.trackingService.addRelationship(
        this.currentState.stateId!,
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
    const cloned = new StateService();
    
    // Create a completely new state without parent reference
    cloned.currentState = this.stateFactory.createState({
      source: 'clone',
      filePath: this.currentState.filePath
    });

    // Copy all state
    cloned.updateState({
      variables: {
        text: new Map(this.currentState.variables.text),
        data: new Map(this.currentState.variables.data),
        path: new Map(this.currentState.variables.path)
      },
      commands: new Map(this.currentState.commands),
      nodes: [...this.currentState.nodes],
      transformedNodes: this.currentState.transformedNodes ? [...this.currentState.transformedNodes] : undefined,
      imports: new Set(this.currentState.imports)
    }, 'clone');

    // Copy flags
    cloned._isImmutable = this._isImmutable;
    cloned._transformationEnabled = this._transformationEnabled;

    // Copy service references
    if (this.eventService) {
      cloned.setEventService(this.eventService);
    }
    if (this.trackingService) {
      cloned.setTrackingService(this.trackingService);
      
      // Add clone relationship as parent-child since we don't track clones separately anymore
      this.trackingService.addRelationship(
        this.currentState.stateId!,
        cloned.currentState.stateId!,
        'parent-child'
      );
    }

    // Emit clone event
    this.emitEvent({
      type: 'clone',
      stateId: cloned.currentState.stateId || 'unknown',
      source: 'clone',
      timestamp: Date.now(),
      location: {
        file: this.getCurrentFilePath() || undefined
      }
    });

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
    if (source !== 'clone' && source !== 'createChildState') {
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
  }

  // Add new methods for state tracking
  setTrackingService(trackingService: IStateTrackingService): void {
    this.trackingService = trackingService;
    
    // Register existing state if not already registered
    if (this.currentState.stateId) {
      try {
        this.trackingService.registerState({
          id: this.currentState.stateId,
          source: 'implicit',
          filePath: this.currentState.filePath,
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
} 