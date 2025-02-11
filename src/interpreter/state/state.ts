import type { MeldNode } from 'meld-spec';
import { interpreterLogger } from '../../utils/logger';

export class InterpreterState {
  private nodes: MeldNode[] = [];
  private textVars: Map<string, string> = new Map();
  private dataVars: Map<string, any> = new Map();
  private pathVars: Map<string, string> = new Map();
  private commands: Map<string, { command: string; options?: Record<string, unknown> }> = new Map();
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
  getCommand(name: string): { command: string; options?: Record<string, unknown> } | undefined {
    const command = this.commands.get(name) ?? this.parentState?.getCommand(name);
    interpreterLogger.debug('Getting command', { name, found: !!command });
    return command;
  }

  setCommand(name: string, command: string | { command: string; options?: Record<string, unknown> }): void {
    this.checkMutable();
    if (typeof command === 'string') {
      this.commands.set(name, { command });
    } else {
      this.commands.set(name, command);
    }
    this.localChanges.add(`command:${name}`);
    interpreterLogger.debug('Set command', { name, command });
  }

  getCommandWithOptions(name: string): { command: string; options?: Record<string, unknown> } | undefined {
    return this.getCommand(name);
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

  removeImport(path: string): void {
    this.checkMutable();
    this.imports.delete(path);
    this.localChanges.delete(`import:${path}`);
    interpreterLogger.debug('Removed import', { path });
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
    interpreterLogger.debug('Merging child state', {
      parentChanges: Array.from(this.localChanges),
      childChanges: Array.from(childState.localChanges)
    });

    // Merge text variables
    for (const [key, value] of childState.textVars) {
      this.setTextVar(key, value);
    }

    // Merge data variables
    for (const [key, value] of childState.dataVars) {
      this.setDataVar(key, value);
    }

    // Merge path variables
    for (const [key, value] of childState.pathVars) {
      this.setPathVar(key, value);
    }

    // Merge commands
    for (const [key, value] of childState.commands) {
      this.setCommand(key, value);
    }

    // Merge imports
    for (const importPath of childState.imports) {
      this.addImport(importPath);
    }

    // Merge nodes
    for (const node of childState.nodes) {
      this.addNode(node);
    }

    interpreterLogger.debug('Merged child state', {
      resultingChanges: Array.from(this.localChanges)
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