import type { MeldNode } from 'meld-spec';
import { stateLogger as logger } from '../../core/utils/logger';
import { IStateService } from './IStateService';

export class StateService implements IStateService {
  private nodes: MeldNode[] = [];
  private textVars: Map<string, string> = new Map();
  private dataVars: Map<string, any> = new Map();
  private pathVars: Map<string, string> = new Map();
  private commands: Map<string, { command: string; options?: Record<string, unknown> }> = new Map();
  private imports: Set<string> = new Set();
  private currentFilePath: string | null = null;
  private _isImmutable: boolean = false;
  private localChanges: Set<string>;
  private parentState?: IStateService;

  constructor(parentState?: IStateService) {
    this.parentState = parentState;
    this.localChanges = new Set();
    logger.debug('Created new state service instance', {
      hasParent: !!parentState
    });
  }

  getTextVar(name: string): string | undefined {
    const value = this.textVars.get(name) ?? this.parentState?.getTextVar(name);
    logger.debug('Getting text variable', { name, found: !!value });
    return value;
  }

  setTextVar(name: string, value: string): void {
    this.checkMutable();
    this.textVars.set(name, value);
    this.localChanges.add(`text:${name}`);
    logger.debug('Set text variable', { name, value });
  }

  getAllTextVars(): Map<string, string> {
    return new Map(this.textVars);
  }

  getLocalTextVars(): Map<string, string> {
    return new Map(Array.from(this.textVars.entries())
      .filter(([key]) => !this.imports.has(key)));
  }

  getDataVar(name: string): any {
    const value = this.dataVars.get(name) ?? this.parentState?.getDataVar(name);
    logger.debug('Getting data variable', { name, found: !!value });
    return value;
  }

  setDataVar(name: string, value: any): void {
    this.checkMutable();
    this.dataVars.set(name, value);
    this.localChanges.add(`data:${name}`);
    logger.debug('Set data variable', { name, valueType: typeof value });
  }

  getAllDataVars(): Map<string, any> {
    return new Map(this.dataVars);
  }

  getLocalDataVars(): Map<string, any> {
    return new Map(Array.from(this.dataVars.entries())
      .filter(([key]) => !this.imports.has(key)));
  }

  getPathVar(name: string): string | undefined {
    const value = this.pathVars.get(name) ?? this.parentState?.getPathVar(name);
    logger.debug('Getting path variable', { name, found: !!value });
    return value;
  }

  setPathVar(name: string, value: string): void {
    this.checkMutable();
    this.pathVars.set(name, value);
    this.localChanges.add(`path:${name}`);
    logger.debug('Set path variable', { name, value });
  }

  getAllPathVars(): Map<string, string> {
    return new Map(this.pathVars);
  }

  getCommand(name: string): { command: string; options?: Record<string, unknown> } | undefined {
    const command = this.commands.get(name) ?? this.parentState?.getCommand(name);
    logger.debug('Getting command', { name, found: !!command });
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
    logger.debug('Set command', { name, command });
  }

  getNodes(): MeldNode[] {
    return [...this.nodes];
  }

  addNode(node: MeldNode): void {
    this.checkMutable();
    this.nodes.push(node);
    this.localChanges.add(`node:${this.nodes.length}`);
    logger.debug('Added node', {
      type: node.type,
      location: node.location
    });
  }

  appendContent(content: string): void {
    this.checkMutable();
    this.nodes.push({
      type: 'Text',
      content,
      location: {
        start: { line: 0, column: 0 },
        end: { line: 0, column: 0 }
      }
    });
    this.localChanges.add(`node:${this.nodes.length}`);
    logger.debug('Appended content', { contentLength: content.length });
  }

  addImport(path: string): void {
    this.checkMutable();
    this.imports.add(path);
    this.localChanges.add(`import:${path}`);
    logger.debug('Added import', { path });
  }

  removeImport(path: string): void {
    this.checkMutable();
    this.imports.delete(path);
    this.localChanges.delete(`import:${path}`);
    logger.debug('Removed import', { path });
  }

  hasImport(path: string): boolean {
    return this.imports.has(path) || !!this.parentState?.hasImport(path);
  }

  getImports(): Set<string> {
    return new Set(this.imports);
  }

  getCurrentFilePath(): string {
    return this.currentFilePath ?? '';
  }

  setCurrentFilePath(path: string): void {
    this.checkMutable();
    this.currentFilePath = path;
    this.localChanges.add(`file:${path}`);
    logger.debug('Set current file path', { path });
  }

  hasLocalChanges(): boolean {
    return this.localChanges.size > 0;
  }

  getLocalChanges(): string[] {
    return Array.from(this.localChanges);
  }

  setImmutable(): void {
    logger.debug('Making state immutable', {
      changes: Array.from(this.localChanges)
    });
    this._isImmutable = true;
  }

  get isImmutable(): boolean {
    return this._isImmutable;
  }

  createChildState(): IStateService {
    return new StateService(this);
  }

  mergeChildState(childState: IStateService): void {
    logger.debug('Merging child state', {
      parentChanges: Array.from(this.localChanges),
      childChanges: childState.getLocalChanges()
    });

    // Merge text variables
    for (const [key, value] of childState.getAllTextVars()) {
      this.setTextVar(key, value);
    }

    // Merge data variables
    for (const [key, value] of childState.getAllDataVars()) {
      this.setDataVar(key, value);
    }

    // Merge path variables
    for (const [key, value] of childState.getAllPathVars()) {
      this.setPathVar(key, value);
    }

    // Merge commands
    for (const [key, value] of new Map(Array.from(childState.getNodes().map(node => 
      ['command', node])))) {
      this.setCommand(key, value as any);
    }

    // Merge imports
    for (const importPath of childState.getImports()) {
      this.addImport(importPath);
    }

    // Merge nodes
    for (const node of childState.getNodes()) {
      this.addNode(node);
    }

    logger.debug('Merged child state', {
      resultingChanges: Array.from(this.localChanges)
    });
  }

  clone(): IStateService {
    logger.debug('Cloning state');
    const newState = new StateService();
    
    // Copy all variables and state
    for (const [key, value] of this.textVars) {
      newState.setTextVar(key, value);
    }
    for (const [key, value] of this.dataVars) {
      newState.setDataVar(key, value);
    }
    for (const [key, value] of this.pathVars) {
      newState.setPathVar(key, value);
    }
    for (const [key, value] of this.commands) {
      newState.setCommand(key, value);
    }
    for (const importPath of this.imports) {
      newState.addImport(importPath);
    }
    for (const node of this.nodes) {
      newState.addNode(node);
    }

    if (this.currentFilePath) {
      newState.setCurrentFilePath(this.currentFilePath);
    }
    if (this._isImmutable) {
      newState.setImmutable();
    }

    return newState;
  }

  private checkMutable(): void {
    if (this.isImmutable) {
      logger.error('Attempted to modify immutable state');
      throw new Error('Cannot modify immutable state');
    }
  }
} 