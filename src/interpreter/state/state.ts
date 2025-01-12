import { MeldNode } from 'meld-spec';

function logStateOp(context: string, details: Record<string, unknown>) {
  console.log(`[State] ${context}:`, {
    timestamp: new Date().toISOString(),
    ...details
  });
}

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

  addNode(node: MeldNode): void {
    this.checkMutable();
    logStateOp('Adding node', {
      nodeType: node.type,
      hasLocation: !!node.location,
      currentNodeCount: this.nodes.length
    });
    this.nodes.push(node);
  }

  getNodes(): MeldNode[] {
    logStateOp('Getting nodes', {
      nodeCount: this.nodes.length
    });
    return this.nodes;
  }

  setText(name: string, value: string): void {
    this.checkMutable();
    const parentValue = this.parentState?.getText(name);
    logStateOp('Setting text variable', {
      name,
      value,
      hadParentValue: !!parentValue,
      parentValue,
      overwriting: this.textVars.has(name)
    });
    if (!parentValue || this.textVars.has(name)) {
      this.textVars.set(name, value);
    }
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
    const parentValue = this.parentState?.getDataVar(name);
    logStateOp('Setting data variable', {
      name,
      value,
      hadParentValue: !!parentValue,
      overwriting: this.dataVars.has(name)
    });
    if (!parentValue || this.dataVars.has(name)) {
      this.dataVars.set(name, value);
    }
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
    const parentValue = this.parentState?.getPathVar(name);
    logStateOp('Setting path variable', {
      name,
      value,
      hadParentValue: !!parentValue,
      overwriting: this.pathVars.has(name)
    });
    if (!parentValue || this.pathVars.has(name)) {
      this.pathVars.set(name, value);
    }
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
    logStateOp('Adding import', {
      path,
      currentImports: Array.from(this.imports)
    });
    this.imports.add(path);
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
        isImmutable: current.isImmutable
      });
      current = current.parentState;
      depth++;
    }

    console.log('[State] Full state chain:', chain);
  }
} 