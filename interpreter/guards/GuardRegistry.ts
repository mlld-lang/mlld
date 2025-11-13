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
}

export interface SerializedGuardDefinition {
  name?: string;
  filterKind: GuardFilterKind;
  filterValue: string;
  scope: GuardScope;
  modifier: string;
  block: GuardBlockNode;
  location?: SourceLocation | null;
}

export class GuardRegistry {
  private readonly parent?: GuardRegistry;
  private readonly dataGuards = new Map<string, GuardDefinition[]>();
  private readonly opGuards = new Map<string, GuardDefinition[]>();
  private readonly definitions = new Map<string, GuardDefinition>();
  private readonly namedDefinitions = new Map<string, GuardDefinition>();

  constructor(parent?: GuardRegistry) {
    this.parent = parent;
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
      if (this.namedDefinitions.has(guardName) || this.parent?.getByName(guardName)) {
        throw new Error(`Guard with name ${guardName} already exists`);
      }
    }

    const guardId = this.buildGuardId(guardName, filterNode);
    if (this.definitions.has(guardId) || this.parent?.hasDefinition(guardId)) {
      throw new Error(`Guard definition already exists for ${guardName ?? filterNode.value}`);
    }

    const block = node.values.guard?.[0];
    if (!block) {
      throw new Error('Guard directive missing body');
    }

    const definition: GuardDefinition = {
      id: guardId,
      name: guardName,
      filterKind: filterNode.filterKind,
      filterValue: filterNode.value,
      scope: filterNode.scope,
      modifier: block.modifier ?? 'default',
      block,
      location: location ?? node.location
    };

    const targetMap = definition.filterKind === 'operation' ? this.opGuards : this.dataGuards;
    const key = definition.filterValue;
    const entry = targetMap.get(key);
    if (entry) {
      entry.push(definition);
    } else {
      targetMap.set(key, [definition]);
    }
    this.definitions.set(guardId, definition);
    if (guardName) {
      this.namedDefinitions.set(guardName, definition);
    }
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
      const guardId = this.buildGuardId(def.name, { filterKind: def.filterKind, value: def.filterValue });
      if (this.hasDefinition(guardId)) {
        continue;
      }
      const copy: GuardDefinition = {
        id: guardId,
        name: def.name,
        filterKind: def.filterKind,
        filterValue: def.filterValue,
        scope: def.scope,
        modifier: def.modifier,
        block: def.block,
        location: def.location
      };
      const targetMap = def.filterKind === 'operation' ? this.opGuards : this.dataGuards;
      const list = targetMap.get(def.filterValue);
      if (list) {
        list.push(copy);
      } else {
        targetMap.set(def.filterValue, [copy]);
      }
      this.definitions.set(guardId, copy);
      if (copy.name) {
        this.namedDefinitions.set(copy.name, copy);
      }
    }
  }

  listOwn(): GuardDefinition[] {
    return Array.from(this.definitions.values());
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
      location: def.location
    };
  }

  private collectGuards(value: string, kind: GuardFilterKind): GuardDefinition[] {
    const targetMap = kind === 'operation' ? this.opGuards : this.dataGuards;
    const local = targetMap.get(value) ?? [];
    const parentDefs = this.parent ? this.parent.collectGuards(value, kind) : [];
    return [...parentDefs, ...local];
  }

  private hasDefinition(id: string): boolean {
    return this.definitions.has(id) || (this.parent?.hasDefinition(id) ?? false);
  }

  private buildGuardId(name: string | undefined, filter: { filterKind: GuardFilterKind; value: string }): string {
    if (name) {
      return `name:${name}`;
    }
    return `${filter.filterKind}:${filter.value}:${Math.random().toString(36).slice(2)}`;
  }
}
