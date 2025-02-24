import type { MeldNode, TextNode } from 'meld-spec';
import { stateLogger as logger } from '@core/utils/logger.js';
import type { IStateService } from './IStateService.js';
import type { StateNode, CommandDefinition } from './types.js';
import { StateFactory } from './StateFactory.js';
import type { IStateEventService, StateEvent } from '../StateEventService/IStateEventService.js';
import type { IStateTrackingService } from '@tests/utils/debug/StateTrackingService/IStateTrackingService.js';

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

      // Add parent-child relationship if there is a parent
      if (parentId) {
        this.trackingService.addRelationship(
          parentId,
          this.currentState.stateId!,
          'parent-child'
        );
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

    // If not found by reference, try matching by properties
    if (index === -1) {
      index = transformedNodes.findIndex(node => {
        // Type guard to ensure we only compare nodes with content
        if (node.type !== original.type) return false;
        if (!('content' in node) || !('content' in original)) return false;
        if (!node.location || !original.location) return false;

        return (
          (node as TextNode).content === (original as TextNode).content &&
          node.location.start.line === original.location.start.line &&
          node.location.start.column === original.location.start.column &&
          node.location.end.line === original.location.end.line &&
          node.location.end.column === original.location.end.column
        );
      });
    }

    if (index !== -1) {
      transformedNodes[index] = transformed;
    } else {
      // If not found, check if it's in the original nodes array
      const originalIndex = this.currentState.nodes.findIndex(node => node === original);
      
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
    if (enable && !this.currentState.transformedNodes) {
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
      // Add merge-source relationship without removing the existing parent-child relationship
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

    // Copy flags
    cloned._isImmutable = this._isImmutable;
    cloned._transformationEnabled = this._transformationEnabled;

    // Copy service references
    if (this.eventService) {
      cloned.setEventService(this.eventService);
    }
    if (this.trackingService) {
      cloned.setTrackingService(this.trackingService);
      
      // Register the cloned state with tracking service
      this.trackingService.registerState({
        id: cloned.currentState.stateId!,
        source: 'clone',
        parentId: this.currentState.stateId,
        filePath: cloned.currentState.filePath,
        transformationEnabled: cloned._transformationEnabled
      });

      // Add clone relationship as parent-child since 'clone' is not a valid relationship type
      this.trackingService.addRelationship(
        this.currentState.stateId!,
        cloned.currentState.stateId!,
        'parent-child' // Changed from 'clone' to 'parent-child'
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
} 