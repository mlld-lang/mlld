import { MeldNode } from 'meld-spec';
import { adjustLocation } from '../utils/location';

function logStateOp(context: string, details: Record<string, unknown>) {
  console.log(`[State] ${context}:`, {
    timestamp: new Date().toISOString(),
    ...details
  });
}

export class InterpreterState {
  public parentState?: InterpreterState;
  private nodes: MeldNode[] = [];
  private textVars: Map<string, string> = new Map();
  private dataVars: Map<string, unknown> = new Map();
  private pathVars: Map<string, string> = new Map();
  private imports: Set<string> = new Set();
  public isImmutable: boolean = false;
  private currentFilePath?: string;
  private localChanges: Set<string> = new Set();
  private commands: Map<string, { command: string; options?: any }> = new Map();

  constructor(parentState?: InterpreterState) {
    this.parentState = parentState;
    if (parentState) {
      this.currentFilePath = parentState.currentFilePath;
    }
    logStateOp('Created new state', {
      hasParent: !!parentState,
      parentVars: parentState ? {
        text: Array.from(parentState.getAllTextVars().keys()),
        data: Array.from(parentState.getAllDataVars().keys()),
        path: Array.from(parentState.getAllPathVars().keys())
      } : null
    });
  }

  private checkMutable(): void {
    if (this.isImmutable) {
      logStateOp('Attempted mutation of immutable state', {
        operation: new Error().stack?.split('\n')[2]
      });
      throw new Error('Cannot modify immutable state');
    }
  }

  private trackChange(type: string, name: string): void {
    this.localChanges.add(`${type}:${name}`);
  }

  addNode(node: MeldNode): void {
    this.checkMutable();
    logStateOp('Adding node', {
      nodeType: node.type,
      hasLocation: !!node.location,
      currentNodeCount: this.nodes.length
    });

    this.nodes.push(node);
    this.trackChange('node', String(this.nodes.length));
  }

  getNodes(): MeldNode[] {
    logStateOp('Getting nodes', {
      nodeCount: this.nodes.length
    });
    return this.nodes;
  }

  setTextVar(name: string, value: string): void {
    this.checkMutable();
    logStateOp('Setting text variable', {
      name,
      value,
      overwriting: this.textVars.has(name)
    });
    this.textVars.set(name, value);
    this.trackChange('text', name);
  }

  getText(name: string): string | undefined {
    const localValue = this.textVars.get(name);
    const parentValue = this.parentState?.getText(name);
    logStateOp('Getting text variable', {
      name,
      hasLocalValue: !!localValue,
      hasParentValue: !!parentValue,
      returnedValue: localValue ?? parentValue
    });
    return localValue ?? parentValue;
  }

  setDataVar(name: string, value: unknown): void {
    this.checkMutable();
    logStateOp('Setting data variable', {
      name,
      value,
      overwriting: this.dataVars.has(name)
    });
    this.dataVars.set(name, value);
    this.trackChange('data', name);
  }

  getDataVar(name: string): unknown | undefined {
    const localValue = this.dataVars.get(name);
    const parentValue = this.parentState?.getDataVar(name);
    logStateOp('Getting data variable', {
      name,
      hasLocalValue: !!localValue,
      hasParentValue: !!parentValue,
      returnedValue: localValue ?? parentValue
    });
    return localValue ?? parentValue;
  }

  setPathVar(name: string, value: string): void {
    this.checkMutable();
    logStateOp('Setting path variable', {
      name,
      value,
      overwriting: this.pathVars.has(name)
    });
    this.pathVars.set(name, value);
    this.trackChange('path', name);
  }

  getPathVar(name: string): string | undefined {
    const localValue = this.pathVars.get(name);
    const parentValue = this.parentState?.getPathVar(name);
    logStateOp('Getting path variable', {
      name,
      hasLocalValue: !!localValue,
      hasParentValue: !!parentValue,
      returnedValue: localValue ?? parentValue
    });
    return localValue ?? parentValue;
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
    logStateOp('Getting all text variables', {
      localCount: this.textVars.size,
      parentCount: this.parentState?.getAllTextVars().size ?? 0,
      totalCount: allVars.size,
      keys: Array.from(allVars.keys())
    });
    return allVars;
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
    logStateOp('Getting all data variables', {
      localCount: this.dataVars.size,
      parentCount: this.parentState?.getAllDataVars().size ?? 0,
      totalCount: allVars.size,
      keys: Array.from(allVars.keys())
    });
    return allVars;
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
    logStateOp('Getting all path variables', {
      localCount: this.pathVars.size,
      parentCount: this.parentState?.getAllPathVars().size ?? 0,
      totalCount: allVars.size,
      keys: Array.from(allVars.keys())
    });
    return allVars;
  }

  addImport(path: string): void {
    this.checkMutable();
    logStateOp('Adding import', {
      path,
      currentImports: Array.from(this.imports)
    });
    this.imports.add(path);
    this.trackChange('import', path);
  }

  hasImport(path: string): boolean {
    const hasLocal = this.imports.has(path);
    const hasParent = !!this.parentState?.hasImport(path);
    logStateOp('Checking import', {
      path,
      hasLocal,
      hasParent,
      result: hasLocal || hasParent
    });
    return hasLocal || hasParent;
  }

  getParentState(): InterpreterState | undefined {
    return this.parentState;
  }

  setImmutable(): void {
    logStateOp('Setting state immutable', {
      nodeCount: this.nodes.length,
      varCounts: {
        text: this.textVars.size,
        data: this.dataVars.size,
        path: this.pathVars.size
      }
    });
    this.isImmutable = true;
  }

  getCurrentFilePath(): string | undefined {
    return this.currentFilePath;
  }

  setCurrentFilePath(path: string): void {
    this.checkMutable();
    this.currentFilePath = path;
    this.trackChange('file', path);
  }

  logStateChain(): void {
    let current: InterpreterState | undefined = this;
    let depth = 0;
    const chain = [];

    while (current) {
      chain.push({
        depth,
        nodeCount: current.nodes.length,
        vars: {
          text: Array.from(current.textVars.keys()),
          data: Array.from(current.dataVars.keys()),
          path: Array.from(current.pathVars.keys())
        },
        isImmutable: current.isImmutable,
        localChanges: Array.from(current.localChanges)
      });
      current = current.parentState;
      depth++;
    }

    console.log('[State] Full state chain:', chain);
  }

  mergeChildState(childState: InterpreterState): void {
    this.checkMutable();
    logStateOp('Merging child state', {
      childLocalChanges: Array.from(childState.localChanges),
      childStateDetails: {
        nodeCount: childState.nodes.length,
        commandCount: childState.commands.size,
        textVarCount: childState.textVars.size,
        dataVarCount: childState.dataVars.size,
        pathVarCount: childState.pathVars.size
      }
    });

    try {
      // Only merge variables that were actually changed in the child state
      for (const change of childState.localChanges) {
        const parts = change.split(':');
        if (parts.length !== 2) {
          logStateOp('Skipping invalid change format', { change });
          continue;
        }
        const [type, name] = parts;

        switch (type) {
          case 'text':
            const textValue = childState.textVars.get(name);
            if (textValue !== undefined) {
              this.setTextVar(name, textValue);
            }
            break;
          case 'data':
            const dataValue = childState.dataVars.get(name);
            if (dataValue !== undefined) {
              this.setDataVar(name, dataValue);
            }
            break;
          case 'path':
            const pathValue = childState.pathVars.get(name);
            if (pathValue !== undefined) {
              this.setPathVar(name, pathValue);
            }
            break;
          case 'import':
            this.imports.add(name);
            break;
          case 'node':
            // For nodes, we merge all nodes since they're ordered and dependent
            // This is done once when we see the first node change
            if (!this.localChanges.has('nodes_merged')) {
              // When merging nodes, preserve their locations
              this.nodes.push(...childState.nodes);
              this.localChanges.add('nodes_merged');
              logStateOp('Merged nodes from child state', {
                mergedCount: childState.nodes.length,
                totalNodes: this.nodes.length,
                nodesWithLocations: childState.nodes.filter(n => n.location).length
              });
            }
            break;
          case 'command':
            const cmd = childState.commands.get(name);
            if (cmd !== undefined) {
              this.setCommand(cmd.command, name, cmd.options);
              logStateOp('Merged command from child state', {
                commandName: name,
                command: cmd.command
              });
            }
            break;
          case 'file':
            if (childState.currentFilePath !== undefined) {
              this.setCurrentFilePath(childState.currentFilePath);
              logStateOp('Updated current file path', {
                newPath: childState.currentFilePath
              });
            }
            break;
          default:
            logStateOp('Unknown change type', { type, name });
        }
      }
    } catch (error) {
      logStateOp('Error during state merge', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      throw new Error(`Failed to merge child state: ${error instanceof Error ? error.message : String(error)}`);
    }

    logStateOp('Completed child state merge', {
      finalState: {
        nodeCount: this.nodes.length,
        commandCount: this.commands.size,
        textVarCount: this.textVars.size,
        dataVarCount: this.dataVars.size,
        pathVarCount: this.pathVars.size,
        localChanges: Array.from(this.localChanges)
      }
    });
  }

  getLocalTextVars(): Map<string, string> {
    return new Map(this.textVars);
  }

  getLocalDataVars(): Map<string, unknown> {
    return new Map(this.dataVars);
  }

  getLocalPathVars(): Map<string, string> {
    return new Map(this.pathVars);
  }

  hasLocalChanges(): boolean {
    return this.localChanges.size > 0;
  }

  getLocalChanges(): Set<string> {
    return new Set(this.localChanges);
  }

  getCommand(name: string = 'default'): { command: string; options?: any } | undefined {
    return this.commands.get(name) || this.parentState?.getCommand(name);
  }

  setCommand(command: string, name: string = 'default', options?: any): void {
    this.commands.set(name, { command, options });
    this.localChanges.add(`command:${name}`);
  }

  mergeToParent(): void {
    if (!this.parentState) {
      throw new Error('Cannot merge to parent: no parent state exists');
    }
    this.parentState.mergeChildState(this);
  }

  setFilePath(path: string): void {
    this.checkMutable();
    logStateOp('Setting file path', {
      path,
      previousPath: this.currentFilePath
    });
    this.currentFilePath = path;
    this.trackChange('file', path);
  }

  getFilePath(): string | undefined {
    return this.currentFilePath;
  }
} 