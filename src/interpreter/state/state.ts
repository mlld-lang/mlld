import type { MeldNode } from 'meld-spec';

export class InterpreterState {
  private nodes: MeldNode[] = [];
  private textVars: Map<string, string> = new Map();
  private dataVars: Map<string, any> = new Map();
  private pathVars: Map<string, string> = new Map();
  private commands: Map<string, { output: string; options?: Record<string, unknown> }> = new Map();
  private imports: Set<string> = new Set();
  private currentFilePath: string | null = null;
  private _isImmutable: boolean = false;
  private localChanges: Set<string> = new Set();
  public parentState?: InterpreterState;

  constructor(parentState?: InterpreterState) {
    this.parentState = parentState;
  }

  // Text variables
  getText(name: string): string | undefined {
    return this.textVars.get(name) ?? this.parentState?.getText(name);
  }

  setTextVar(name: string, value: string): void {
    if (this._isImmutable) {
      throw new Error('Cannot modify immutable state');
    }
    this.textVars.set(name, value);
    this.localChanges.add(`text:${name}`);
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
    return this.dataVars.get(name) ?? this.parentState?.getDataVar(name);
  }

  setDataVar(name: string, value: any): void {
    if (this._isImmutable) {
      throw new Error('Cannot modify immutable state');
    }
    this.dataVars.set(name, value);
    this.localChanges.add(`data:${name}`);
  }

  getAllDataVars(): Map<string, any> {
    return new Map(this.dataVars);
  }

  // Path variables
  getPathVar(name: string): string | undefined {
    return this.pathVars.get(name) ?? this.parentState?.getPathVar(name);
  }

  setPathVar(name: string, value: string): void {
    if (this._isImmutable) {
      throw new Error('Cannot modify immutable state');
    }
    this.pathVars.set(name, value);
    this.localChanges.add(`path:${name}`);
  }

  // Commands
  getCommand(name: string): any {
    return this.commands.get(name) ?? this.parentState?.getCommand(name);
  }

  setCommand(name: string, command: string, options?: Record<string, unknown>): void {
    if (this._isImmutable) {
      throw new Error('Cannot modify immutable state');
    }
    this.commands.set(name, { command, options });
    this.localChanges.add(`command:${name}`);
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
  }

  // Imports
  addImport(path: string): void {
    if (this._isImmutable) {
      throw new Error('Cannot modify immutable state');
    }
    this.imports.add(path);
    this.localChanges.add(`import:${path}`);
  }

  getImports(): Set<string> {
    return new Set(this.imports);
  }

  // File path
  getCurrentFilePath(): string {
    return this.currentFilePath ?? '';
  }

  setCurrentFilePath(path: string): void {
    if (this._isImmutable) {
      throw new Error('Cannot modify immutable state');
    }
    this.currentFilePath = path;
    this.localChanges.add(`file:${path}`);
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
    this._isImmutable = true;
  }

  get isImmutable(): boolean {
    return this._isImmutable;
  }

  // State merging
  mergeChildState(childState: InterpreterState): void {
    this.checkMutable();
    
    // Merge text variables
    for (const [key, value] of childState.textVars) {
      this.textVars.set(key, value);
    }

    // Merge data variables
    for (const [key, value] of childState.dataVars) {
      this.dataVars.set(key, value);
    }

    // Merge path variables
    for (const [key, value] of childState.pathVars) {
      this.pathVars.set(key, value);
    }

    // Merge commands
    for (const [key, value] of childState.commands) {
      this.commands.set(key, value);
    }

    // Merge nodes (avoiding duplicates)
    const existingNodeIds = new Set(this.nodes.map(n => JSON.stringify(n)));
    for (const node of childState.nodes) {
      const nodeId = JSON.stringify(node);
      if (!existingNodeIds.has(nodeId)) {
        this.nodes.push(node);
      }
    }

    // Merge imports
    for (const imp of childState.imports) {
      this.imports.add(imp);
    }

    // Update file path if child has one
    if (childState.currentFilePath) {
      this.currentFilePath = childState.currentFilePath;
    }
  }

  private checkMutable(): void {
    if (this.isImmutable) {
      throw new Error('Cannot modify immutable state');
    }
  }

  // Clone state
  clone(): InterpreterState {
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