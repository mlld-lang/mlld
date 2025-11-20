import type { GuardBlockNode, GuardDirectiveNode, GuardFilterKind, GuardScope } from '@core/types/guard';
import type { SourceLocation } from '@core/types';

export interface GuardDefinition {
  id: string;
  name?: string;
  filterKind: GuardFilterKind;
  filterValue: string;
  scope: GuardScope;
  modifier: string;
  block: GuardBlockNode;
  location?: SourceLocation | null;
  registrationOrder: number;
}

export interface SerializedGuardDefinition {
  name?: string;
  filterKind: GuardFilterKind;
  filterValue: string;
  scope: GuardScope;
  modifier: string;
  block: GuardBlockNode;
  location?: SourceLocation | null;
  registrationOrder?: number;
}

export class GuardRegistry {
  private readonly parent?: GuardRegistry;
  private readonly root: GuardRegistry;
  private nextRegistrationOrder: number;
  private readonly guards: GuardDefinition[] = [];
  private readonly dataIndex: Map<string, GuardDefinition[]>;
  private readonly opIndex: Map<string, GuardDefinition[]>;
  private readonly definitions = new Map<string, GuardDefinition>();
  private readonly namedDefinitions = new Map<string, GuardDefinition>();
  private readonly guardNames: Set<string>;

  constructor(parent?: GuardRegistry) {
    this.parent = parent;
    this.root = parent?.root ?? this;
    if (this.isRoot()) {
      this.nextRegistrationOrder = 1;
      this.dataIndex = new Map();
      this.opIndex = new Map();
      this.guardNames = new Set();
    } else {
      this.nextRegistrationOrder = 0;
      this.dataIndex = this.root.dataIndex;
      this.opIndex = this.root.opIndex;
      this.guardNames = this.root.guardNames;
    }
  }

  createChild(): GuardRegistry {
    return new GuardRegistry(this);
  }

  register(node: GuardDirectiveNode, location?: SourceLocation | null): GuardDefinition {
    const filterNode = node.values.filter?.[0];
    if (!filterNode) {
      throw new Error('Guard directive missing filter');
    }

    const guardName = node.values.name?.[0]?.identifier;
    if (guardName) {
      if (this.guardNames.has(guardName)) {
        throw new Error(`Guard with name ${guardName} already exists`);
      }
    }

    const block = node.values.guard?.[0];
    if (!block) {
      throw new Error('Guard directive missing body');
    }

    const registrationOrder = this.allocateRegistrationOrder();
    const guardId = guardName ?? `<unnamed-guard-${registrationOrder}>`;
    if (this.definitions.has(guardId) || this.parent?.hasDefinition(guardId)) {
      throw new Error(`Guard definition already exists for ${guardName ?? filterNode.value}`);
    }

    const definition: GuardDefinition = {
      id: guardId,
      name: guardName,
      filterKind: filterNode.filterKind,
      filterValue: filterNode.value,
      scope: filterNode.scope,
      modifier: block.modifier ?? 'default',
      block,
      location: location ?? node.location,
      registrationOrder
    };

    this.registerDefinition(definition);
    this.guardNames.add(guardName ?? guardId);
    return definition;
  }

  getDataGuards(label: string): GuardDefinition[] {
    return this.collectGuards(label, 'data');
  }

  getOperationGuards(op: string): GuardDefinition[] {
    return this.collectGuards(op, 'operation');
  }

  serializeOwn(): SerializedGuardDefinition[] {
    const results: SerializedGuardDefinition[] = [];
    for (const def of this.definitions.values()) {
      results.push(this.serializeDefinition(def));
    }
    return results;
  }

  importSerialized(defs: SerializedGuardDefinition[]): void {
    for (const def of defs) {
      const guardName = def.name;
      if (guardName && this.getByName(guardName)) {
        continue;
      }
      const registrationOrder = this.allocateRegistrationOrder();
      const guardId = guardName ?? `<unnamed-guard-${registrationOrder}>`;
      if (this.hasDefinition(guardId)) {
        continue;
      }
      const copy: GuardDefinition = {
        id: guardId,
        name: guardName,
        filterKind: def.filterKind,
        filterValue: def.filterValue,
        scope: def.scope,
        modifier: def.modifier,
        block: def.block,
        location: def.location,
        registrationOrder: def.registrationOrder ?? registrationOrder
      };
      this.registerDefinition(copy);
      if (guardName) {
        this.guardNames.add(guardName);
      }
    }
  }

  listOwn(): GuardDefinition[] {
    return Array.from(this.definitions.values());
  }

  getAllGuards(): GuardDefinition[] {
    if (!this.isRoot()) {
      return this.root.getAllGuards();
    }
    return this.guards.slice();
  }

  getByName(name: string): GuardDefinition | undefined {
    return this.namedDefinitions.get(name) ?? this.parent?.getByName(name);
  }

  serializeByNames(names: readonly string[]): SerializedGuardDefinition[] {
    const results: SerializedGuardDefinition[] = [];
    for (const name of names) {
      const def = this.getByName(name);
      if (def) {
        results.push(this.serializeDefinition(def));
      }
    }
    return results;
  }

  private serializeDefinition(def: GuardDefinition): SerializedGuardDefinition {
    return {
      name: def.name,
      filterKind: def.filterKind,
      filterValue: def.filterValue,
      scope: def.scope,
      modifier: def.modifier,
      block: def.block,
      location: def.location,
      registrationOrder: def.registrationOrder
    };
  }

  private collectGuards(value: string, kind: GuardFilterKind): GuardDefinition[] {
    const index = kind === 'operation' ? this.opIndex : this.dataIndex;
    const matches = index.get(value) ?? [];
    return matches.slice().sort((a, b) => a.registrationOrder - b.registrationOrder);
  }

  private hasDefinition(id: string): boolean {
    return this.definitions.has(id) || (this.parent?.hasDefinition(id) ?? false);
  }

  private registerDefinition(definition: GuardDefinition): void {
    this.definitions.set(definition.id, definition);
    this.guards.push(definition);
    if (!this.isRoot()) {
      this.root.guards.push(definition);
    }
    if (definition.name) {
      this.namedDefinitions.set(definition.name, definition);
    }
    const index = definition.filterKind === 'operation' ? this.opIndex : this.dataIndex;
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
