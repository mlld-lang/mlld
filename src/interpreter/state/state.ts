import { MeldNode } from 'meld-spec';

export class InterpreterState {
  private parentState?: InterpreterState;
  private nodes: MeldNode[] = [];
  private textVars: Map<string, string> = new Map();
  private dataVars: Map<string, unknown> = new Map();
  private pathVars: Map<string, string> = new Map();
  private commands: Map<string, string> = new Map();
  private imports: Set<string> = new Set();
  private isImmutable: boolean = false;

  constructor(parentState?: InterpreterState) {
    this.parentState = parentState;
  }

  addNode(node: MeldNode): void {
    this.nodes.push(node);
  }

  getNodes(): MeldNode[] {
    return this.nodes;
  }

  setText(name: string, value: string): void {
    this.checkMutable();
    if (!this.parentState?.getText(name) || this.textVars.has(name)) {
      this.textVars.set(name, value);
    }
  }

  getText(name: string): string | undefined {
    return this.textVars.get(name) || this.parentState?.getText(name);
  }

  setTextVar(name: string, value: string): void {
    this.setText(name, value);
  }

  getTextVar(name: string): string | undefined {
    return this.getText(name);
  }

  getAllTextVars(): Map<string, string> {
    const allVars = new Map<string, string>();
    if (this.parentState) {
      for (const [key, value] of this.parentState.getAllTextVars()) {
        allVars.set(key, value);
      }
    }
    for (const [key, value] of this.textVars) {
      allVars.set(key, value);
    }
    return allVars;
  }

  setDataVar(name: string, value: unknown): void {
    this.checkMutable();
    if (!this.parentState?.getDataVar(name) || this.dataVars.has(name)) {
      this.dataVars.set(name, structuredClone(value));
    }
  }

  getDataVar(name: string): unknown | undefined {
    return this.dataVars.get(name) || this.parentState?.getDataVar(name);
  }

  getAllDataVars(): Map<string, unknown> {
    const allVars = new Map<string, unknown>();
    if (this.parentState) {
      for (const [key, value] of this.parentState.getAllDataVars()) {
        allVars.set(key, value);
      }
    }
    for (const [key, value] of this.dataVars) {
      allVars.set(key, value);
    }
    return allVars;
  }

  setPathVar(name: string, value: string): void {
    this.checkMutable();
    if (!this.parentState?.getPathVar(name) || this.pathVars.has(name)) {
      this.pathVars.set(name, value);
    }
  }

  getPathVar(name: string): string | undefined {
    return this.pathVars.get(name) || this.parentState?.getPathVar(name);
  }

  getAllPathVars(): Map<string, string> {
    const allVars = new Map<string, string>();
    if (this.parentState) {
      for (const [key, value] of this.parentState.getAllPathVars()) {
        allVars.set(key, value);
      }
    }
    for (const [key, value] of this.pathVars) {
      allVars.set(key, value);
    }
    return allVars;
  }

  setCommand(name: string, command: string): void {
    this.checkMutable();
    if (!this.parentState?.getCommand(name) || this.commands.has(name)) {
      this.commands.set(name, command);
    }
  }

  getCommand(name: string): string | undefined {
    return this.commands.get(name) || this.parentState?.getCommand(name);
  }

  getAllCommands(): Map<string, string> {
    const allCommands = new Map<string, string>();
    if (this.parentState) {
      for (const [key, value] of this.parentState.getAllCommands()) {
        allCommands.set(key, value);
      }
    }
    for (const [key, value] of this.commands) {
      allCommands.set(key, value);
    }
    return allCommands;
  }

  addImport(path: string): void {
    this.imports.add(path);
  }

  hasImport(path: string): boolean {
    return this.imports.has(path) || !!this.parentState?.hasImport(path);
  }

  getParentState(): InterpreterState | undefined {
    return this.parentState;
  }

  mergeFrom(other: InterpreterState): void {
    this.checkMutable();
    
    for (const [key, value] of other.getAllTextVars()) {
      this.setTextVar(key, value);
    }
    for (const [key, value] of other.getAllDataVars()) {
      this.setDataVar(key, structuredClone(value));
    }
    for (const [key, value] of other.getAllPathVars()) {
      this.setPathVar(key, value);
    }
    for (const [key, value] of other.getAllCommands()) {
      this.setCommand(key, value);
    }

    this.nodes.push(...other.getNodes().map(node => structuredClone(node)));

    for (const importPath of other.imports) {
      this.addImport(importPath);
    }
  }

  clone(): InterpreterState {
    const cloned = new InterpreterState(this.parentState);
    cloned.mergeFrom(this);
    return cloned;
  }

  setImmutable(): void {
    this.isImmutable = true;
  }

  private checkMutable(): void {
    if (this.isImmutable) {
      throw new Error('Cannot modify an immutable state');
    }
  }
} 