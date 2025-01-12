import type { MeldNode } from 'meld-spec';

interface MeldState {
  textVariables: Map<string, string>;
  dataVariables: Map<string, any>;
  pathVariables: Map<string, string>;
  definedCommands: Map<string, Function>;
  nodes: MeldNode[];
  imports: Set<string>;
}

export class InterpreterState implements MeldState {
  textVariables: Map<string, string>;
  dataVariables: Map<string, any>;
  pathVariables: Map<string, string>;
  definedCommands: Map<string, Function>;
  nodes: MeldNode[];
  imports: Set<string>;

  constructor() {
    this.textVariables = new Map();
    this.dataVariables = new Map();
    this.pathVariables = new Map();
    this.definedCommands = new Map();
    this.imports = new Set();
    this.nodes = [];
  }

  // Text variables
  setTextVar(name: string, value: string): void {
    this.textVariables.set(name, value);
  }

  getTextVar(name: string): string | undefined {
    return this.textVariables.get(name);
  }

  // Data variables
  setDataVar(name: string, value: any): void {
    this.dataVariables.set(name, value);
  }

  getDataVar(name: string): any {
    return this.dataVariables.get(name);
  }

  // Path variables
  setPathVar(name: string, value: string): void {
    this.pathVariables.set(name, value);
  }

  getPathVar(name: string): string | undefined {
    return this.pathVariables.get(name);
  }

  // Commands
  setCommand(name: string, command: Function): void {
    this.definedCommands.set(name, command);
  }

  getCommand(name: string): Function | undefined {
    return this.definedCommands.get(name);
  }

  // Imports
  addImport(path: string): void {
    this.imports.add(path);
  }

  hasImport(path: string): boolean {
    return this.imports.has(path);
  }

  // Nodes
  addNode(node: MeldNode): void {
    this.nodes.push(node);
  }

  getNodes(): MeldNode[] {
    return [...this.nodes];
  }

  // Clone state
  clone(): InterpreterState {
    const newState = new InterpreterState();
    
    // Clone text variables
    this.textVariables.forEach((value, key) => {
      newState.setTextVar(key, value);
    });
    
    // Clone data variables
    this.dataVariables.forEach((value, key) => {
      newState.setDataVar(key, JSON.parse(JSON.stringify(value)));
    });
    
    // Clone path variables
    this.pathVariables.forEach((value, key) => {
      newState.setPathVar(key, value);
    });
    
    // Clone commands
    this.definedCommands.forEach((value, key) => {
      newState.setCommand(key, value);
    });
    
    // Clone imports
    this.imports.forEach(path => {
      newState.addImport(path);
    });

    // Clone nodes
    this.nodes.forEach(node => {
      newState.addNode(node);
    });
    
    return newState;
  }
} 