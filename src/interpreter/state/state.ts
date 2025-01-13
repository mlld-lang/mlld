import type { MeldNode } from 'meld-spec';
import { interpreterLogger } from '../../utils/logger';

export class InterpreterState {
  private nodes: MeldNode[] = [];
  private textVars: Map<string, string> = new Map();
  private dataVars: Map<string, any> = new Map();
  private pathVars: Map<string, string> = new Map();
  private commands: Map<string, { output: string; options?: Record<string, unknown> }> = new Map();
  private imports: Set<string> = new Set();
  private currentFilePath: string | null = null;
  private _isImmutable: boolean = false;
  private localChanges: Set<string>;
  public parentState?: InterpreterState;

  constructor(parentState?: InterpreterState) {
    this.parentState = parentState;
    this.localChanges = new Set();
    interpreterLogger.debug('Created new interpreter state', {
      hasParent: !!parentState
    });
  }

  // Text variables
  getText(name: string): string | undefined {
    const value = this.textVars.get(name) ?? this.parentState?.getText(name);
    interpreterLogger.debug('Getting text variable', { name, found: !!value });
    return value;
  }

  getTextVar(name: string): string | undefined {
    return this.getText(name);
  }

  setTextVar(name: string, value: string): void {
    this.checkMutable();
    this.textVars.set(name, value);
    this.localChanges.add(`text:${name}`);
    interpreterLogger.debug('Set text variable', { name, value });
  }

  getAllTextVars(): Map<string, string> {
    return new Map(this.textVars);
  }

  getLocalTextVars(): Map<string, string> {
    return new Map(Array.from(this.textVars.entries())
      .filter(([key]) => !this.imports.has(key)));
  }

  // Data variables
  getDataVar(name: string): any {
    const value = this.dataVars.get(name) ?? this.parentState?.getDataVar(name);
    interpreterLogger.debug('Getting data variable', { name, found: !!value });
    return value;
  }

  setDataVar(name: string, value: any): void {
    this.checkMutable();
    this.dataVars.set(name, value);
    this.localChanges.add(`data:${name}`);
    interpreterLogger.debug('Set data variable', { name, valueType: typeof value });
  }

  getAllDataVars(): Map<string, any> {
    return new Map(this.dataVars);
  }

  getLocalDataVars(): Map<string, any> {
    return new Map(Array.from(this.dataVars.entries())
      .filter(([key]) => !this.imports.has(key)));
  }

  // Path variables
  getPathVar(name: string): string | undefined {
    const value = this.pathVars.get(name) ?? this.parentState?.getPathVar(name);
    interpreterLogger.debug('Getting path variable', { name, found: !!value });
    return value;
  }

  setPathVar(name: string, value: string): void {
    this.checkMutable();
    this.pathVars.set(name, value);
    this.localChanges.add(`path:${name}`);
    interpreterLogger.debug('Set path variable', { name, value });
  }

  // Commands
  getCommand(name: string): string | undefined {
    const value = this.commands.get(name);
    if (value !== undefined) {
      return value.output;
    }
    const parentValue = this.parentState?.getCommand(name);
    interpreterLogger.debug('Getting command', { name, found: !!value || !!parentValue });
    return parentValue;
  }

  setCommand(name: string, command: string | { output: string; options?: Record<string, unknown> }): void {
    this.checkMutable();
    if (typeof command === 'string') {
      this.commands.set(name, { output: command });
    } else {
      this.commands.set(name, command);
    }
    this.localChanges.add(`command:${name}`);
    interpreterLogger.debug('Set command', { name, command });
  }

  getCommandWithOptions(command: string): { output: string; options?: Record<string, unknown> } | undefined {
    return this.commands.get(command);
  }

  // Nodes
  getNodes(): MeldNode[] {
    return [...this.nodes];
  }

  addNode(node: MeldNode): void {
    this.checkMutable();
    this.nodes.push(node);
    this.localChanges.add(`node:${this.nodes.length}`);
    interpreterLogger.debug('Added node', { 
      type: node.type,
      location: node.location
    });
  }

  // Imports
  addImport(path: string): void {
    this.checkMutable();
    this.imports.add(path);
    this.localChanges.add(`import:${path}`);
    interpreterLogger.debug('Added import', { path });
  }

  hasImport(path: string): boolean {
    return this.imports.has(path) || !!this.parentState?.hasImport(path);
  }

  getImports(): Set<string> {
    return new Set(this.imports);
  }

  // File path
  getCurrentFilePath(): string {
    return this.currentFilePath ?? '';
  }

  setCurrentFilePath(path: string): void {
    this.checkMutable();
    this.currentFilePath = path;
    this.localChanges.add(`file:${path}`);
    interpreterLogger.debug('Set current file path', { path });
  }

  // Local changes tracking
  hasLocalChanges(): boolean {
    return this.localChanges.size > 0;
  }

  getLocalChanges(): string[] {
    return Array.from(this.localChanges);
  }

  // Mutability control
  setImmutable(): void {
    interpreterLogger.debug('Making state immutable', {
      changes: Array.from(this.localChanges)
    });
    this._isImmutable = true;
  }

  get isImmutable(): boolean {
    return this._isImmutable;
  }

  // State merging
  mergeChildState(childState: InterpreterState): void {
    this.mergeIntoParent(childState);
  }

  mergeIntoParent(childState: InterpreterState): void {
    interpreterLogger.info('Merging child state', {
      childChanges: Array.from(childState.localChanges),
      childHasParent: !!childState.parentState,
      isParentImmutable: this.isImmutable
    });

    this.checkMutable();
    
    // Merge text variables
    for (const [key, value] of childState.textVars) {
      this.textVars.set(key, value);
      this.localChanges.add(`text:${key}`);
    }

    // Merge data variables
    for (const [key, value] of childState.dataVars) {
      this.dataVars.set(key, value);
      this.localChanges.add(`data:${key}`);
    }

    // Merge path variables
    for (const [key, value] of childState.pathVars) {
      this.pathVars.set(key, value);
      this.localChanges.add(`path:${key}`);
    }

    // Merge commands
    for (const [key, value] of childState.commands) {
      this.commands.set(key, value);
      this.localChanges.add(`command:${key}`);
    }

    // Merge nodes (avoiding duplicates)
    const existingNodeIds = new Set(this.nodes.map(n => JSON.stringify(n)));
    for (const node of childState.nodes) {
      const nodeId = JSON.stringify(node);
      if (!existingNodeIds.has(nodeId)) {
        this.nodes.push(node);
        this.localChanges.add(`node:${this.nodes.length}`);
      }
    }

    // Merge imports
    for (const imp of childState.imports) {
      this.imports.add(imp);
      this.localChanges.add(`import:${imp}`);
    }

    // Update file path if child has one
    if (childState.currentFilePath) {
      this.currentFilePath = childState.currentFilePath;
    }

    interpreterLogger.debug('Child state merged', {
      totalNodes: this.nodes.length,
      totalTextVars: this.textVars.size,
      totalDataVars: this.dataVars.size,
      totalImports: this.imports.size
    });
  }

  private checkMutable(): void {
    if (this.isImmutable) {
      interpreterLogger.error('Attempted to modify immutable state');
      throw new Error('Cannot modify immutable state');
    }
  }

  // Clone state
  clone(): InterpreterState {
    interpreterLogger.debug('Cloning state');
    const newState = new InterpreterState();
    newState.textVars = new Map(this.textVars);
    newState.dataVars = new Map(this.dataVars);
    newState.pathVars = new Map(this.pathVars);
    newState.commands = new Map(this.commands);
    newState.imports = new Set(this.imports);
    newState.currentFilePath = this.currentFilePath;
    newState._isImmutable = this._isImmutable;
    newState.localChanges = new Set(this.localChanges);
    return newState;
  }
} 