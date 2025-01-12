import type { MeldNode } from 'meld-spec';
import type { LocationData } from '../subInterpreter.js';

export interface StateConfig {
  parentState?: InterpreterState;
  baseLocation?: LocationData;
}

export class InterpreterState {
  private nodes: MeldNode[] = [];
  private textVars: Map<string, string> = new Map();
  private dataVars: Map<string, any> = new Map();
  private pathVars: Map<string, string> = new Map();
  private commands: Map<string, Function> = new Map();
  private imports: Set<string> = new Set();
  private parentState?: InterpreterState;
  private baseLocation?: LocationData;

  constructor(config?: StateConfig) {
    this.parentState = config?.parentState;
    this.baseLocation = config?.baseLocation;
  }

  addNode(node: MeldNode): void {
    // Adjust node location if we have a base location
    if (this.baseLocation && node.location) {
      node.location.start.line += this.baseLocation.line - 1;
      node.location.end.line += this.baseLocation.line - 1;
      if (node.location.start.line === this.baseLocation.line) {
        node.location.start.column += this.baseLocation.column - 1;
      }
      if (node.location.end.line === this.baseLocation.line) {
        node.location.end.column += this.baseLocation.column - 1;
      }
    }
    this.nodes.push(node);
  }

  getNodes(): MeldNode[] {
    return this.nodes;
  }

  // Text variables
  setTextVar(name: string, value: string): void {
    this.textVars.set(name, value);
  }

  getTextVar(name: string): string | undefined {
    return this.textVars.get(name) ?? this.parentState?.getTextVar(name);
  }

  getAllTextVars(): Map<string, string> {
    return new Map(this.textVars);
  }

  // Data variables
  setDataVar(name: string, value: any): void {
    this.dataVars.set(name, value);
  }

  getDataVar(name: string): any {
    return this.dataVars.get(name) ?? this.parentState?.getDataVar(name);
  }

  getAllDataVars(): Map<string, any> {
    return new Map(this.dataVars);
  }

  hasDataVar(name: string): boolean {
    return this.dataVars.has(name) || !!this.parentState?.hasDataVar(name);
  }

  // Path variables
  setPathVar(name: string, value: string): void {
    this.pathVars.set(name, value);
  }

  getPathVar(name: string): string | undefined {
    return this.pathVars.get(name) ?? this.parentState?.getPathVar(name);
  }

  // Commands
  setCommand(name: string, command: Function): void {
    this.commands.set(name, command);
  }

  getCommand(name: string): Function | undefined {
    return this.commands.get(name) ?? this.parentState?.getCommand(name);
  }

  getAllCommands(): Map<string, Function> {
    return new Map(this.commands);
  }

  // Import tracking
  addImport(path: string): void {
    this.imports.add(path);
  }

  hasImport(path: string): boolean {
    return this.imports.has(path) || !!this.parentState?.hasImport(path);
  }

  // State merging
  mergeChildState(childState: InterpreterState): void {
    // Merge nodes
    for (const node of childState.getNodes()) {
      this.addNode(node);
    }

    // Merge variables
    childState.getAllTextVars().forEach((value, key) => {
      this.setTextVar(key, value);
    });

    childState.getAllDataVars().forEach((value, key) => {
      this.setDataVar(key, value);
    });

    childState.getAllCommands().forEach((value, key) => {
      this.setCommand(key, value);
    });
  }

  // Cloning
  clone(): InterpreterState {
    const cloned = new InterpreterState({
      parentState: this.parentState,
      baseLocation: this.baseLocation
    });

    // Clone all state
    cloned.nodes = [...this.nodes];
    cloned.textVars = new Map(this.textVars);
    cloned.dataVars = new Map(this.dataVars);
    cloned.pathVars = new Map(this.pathVars);
    cloned.commands = new Map(this.commands);
    cloned.imports = new Set(this.imports);

    return cloned;
  }
} 