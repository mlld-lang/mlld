import type {
  HookBodyNode,
  HookDirectiveNode,
  HookFilterKind,
  HookScope,
  HookTiming
} from '@core/types/hook';
import type { SourceLocation } from '@core/types';

export interface HookDefinition {
  id: string;
  name?: string;
  filterKind: HookFilterKind;
  filterValue: string;
  scope: HookScope;
  timing: HookTiming;
  argPattern?: string | null;
  body: HookBodyNode;
  location?: SourceLocation | null;
  registrationOrder: number;
}

export class HookRegistry {
  private readonly parent?: HookRegistry;
  private readonly root: HookRegistry;
  private nextRegistrationOrder: number;
  private readonly hooks: HookDefinition[] = [];
  private readonly functionIndex: Map<string, HookDefinition[]>;
  private readonly operationIndex: Map<string, HookDefinition[]>;
  private readonly dataIndex: Map<string, HookDefinition[]>;
  private readonly definitions = new Map<string, HookDefinition>();
  private readonly namedDefinitions = new Map<string, HookDefinition>();
  private readonly hookNames: Set<string>;

  constructor(parent?: HookRegistry) {
    this.parent = parent;
    this.root = parent?.root ?? this;
    if (this.isRoot()) {
      this.nextRegistrationOrder = 1;
      this.functionIndex = new Map();
      this.operationIndex = new Map();
      this.dataIndex = new Map();
      this.hookNames = new Set();
    } else {
      this.nextRegistrationOrder = 0;
      this.functionIndex = this.root.functionIndex;
      this.operationIndex = this.root.operationIndex;
      this.dataIndex = this.root.dataIndex;
      this.hookNames = this.root.hookNames;
    }
  }

  createChild(): HookRegistry {
    return new HookRegistry(this);
  }

  register(node: HookDirectiveNode, location?: SourceLocation | null): HookDefinition {
    const filterNode = node.values.filter?.[0];
    if (!filterNode) {
      throw new Error('Hook directive missing filter');
    }

    const hookName = node.values.name?.[0]?.identifier;
    if (hookName && this.hookNames.has(hookName)) {
      throw new Error(`Hook with name ${hookName} already exists`);
    }

    const bodyNode = node.values.body?.[0];
    if (!bodyNode) {
      throw new Error('Hook directive missing body');
    }

    const registrationOrder = this.allocateRegistrationOrder();
    const hookId = hookName ?? `<unnamed-hook-${registrationOrder}>`;
    if (this.definitions.has(hookId) || this.parent?.hasDefinition(hookId)) {
      throw new Error(`Hook definition already exists for ${hookName ?? filterNode.value}`);
    }

    const definition: HookDefinition = {
      id: hookId,
      name: hookName,
      filterKind: filterNode.filterKind,
      filterValue: filterNode.value,
      scope: filterNode.scope,
      timing: node.meta.timing ?? 'before',
      argPattern: filterNode.argPattern ?? null,
      body: bodyNode,
      location: location ?? node.location,
      registrationOrder
    };

    this.registerDefinition(definition);
    this.hookNames.add(hookName ?? hookId);
    return definition;
  }

  getFunctionHooks(fnName: string, timing: HookTiming): HookDefinition[] {
    return this.collectHooks(fnName, 'function').filter(def => this.matchesTiming(def, timing));
  }

  getOperationHooks(opType: string, timing: HookTiming): HookDefinition[] {
    return this.collectHooks(opType, 'operation').filter(def => this.matchesTiming(def, timing));
  }

  getDataHooks(label: string, timing: HookTiming): HookDefinition[] {
    return this.collectHooks(label, 'data').filter(def => this.matchesTiming(def, timing));
  }

  listOwn(): HookDefinition[] {
    return Array.from(this.definitions.values());
  }

  getAllHooks(): HookDefinition[] {
    if (!this.isRoot()) {
      return this.root.getAllHooks();
    }
    return this.hooks.slice();
  }

  getByName(name: string): HookDefinition | undefined {
    return this.namedDefinitions.get(name) ?? this.parent?.getByName(name);
  }

  private collectHooks(value: string, kind: HookFilterKind): HookDefinition[] {
    const index =
      kind === 'function'
        ? this.functionIndex
        : kind === 'operation'
          ? this.operationIndex
          : this.dataIndex;

    const matches = index.get(value) ?? [];
    return matches.slice().sort((a, b) => a.registrationOrder - b.registrationOrder);
  }

  private matchesTiming(def: HookDefinition, timing: HookTiming): boolean {
    return def.timing === timing;
  }

  private hasDefinition(id: string): boolean {
    return this.definitions.has(id) || (this.parent?.hasDefinition(id) ?? false);
  }

  private registerDefinition(definition: HookDefinition): void {
    this.definitions.set(definition.id, definition);
    this.hooks.push(definition);
    if (!this.isRoot()) {
      this.root.hooks.push(definition);
    }
    if (definition.name) {
      this.namedDefinitions.set(definition.name, definition);
    }

    const index =
      definition.filterKind === 'function'
        ? this.functionIndex
        : definition.filterKind === 'operation'
          ? this.operationIndex
          : this.dataIndex;
    const list = index.get(definition.filterValue);
    if (list) {
      list.push(definition);
    } else {
      index.set(definition.filterValue, [definition]);
    }
  }

  private allocateRegistrationOrder(): number {
    if (!this.isRoot()) {
      return this.root.allocateRegistrationOrder();
    }
    const order = this.nextRegistrationOrder;
    this.nextRegistrationOrder += 1;
    return order;
  }

  private isRoot(): boolean {
    return this.root === this;
  }
}
