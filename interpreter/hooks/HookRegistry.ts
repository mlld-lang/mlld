import type {
  HookBodyNode,
  HookDirectiveNode,
  HookFilterKind,
  HookTiming
} from '@core/types/hook';
import type { SourceLocation } from '@core/types';
import { normalizeNamedOperationSelector } from '@core/policy/operation-labels';

const KNOWN_OPERATION_TYPES = [
  'exe',
  'var',
  'for',
  'for:iteration',
  'for:batch',
  'loop',
  'import',
  'show',
  'log',
  'output',
  'append',
  'run'
] as const;

const KNOWN_OPERATION_TYPE_SET = new Set<string>(KNOWN_OPERATION_TYPES);
const KNOWN_OPERATION_TYPE_LIST = KNOWN_OPERATION_TYPES.join(', ');

export interface RegisterHookOptions {
  emitWarning?: (message: string) => void;
}

export interface HookDefinition {
  id: string;
  name?: string;
  filterKind: HookFilterKind;
  filterValue: string;
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
      this.operationIndex = new Map();
      this.dataIndex = new Map();
      this.hookNames = new Set();
    } else {
      this.nextRegistrationOrder = 0;
      this.operationIndex = this.root.operationIndex;
      this.dataIndex = this.root.dataIndex;
      this.hookNames = this.root.hookNames;
    }
  }

  createChild(): HookRegistry {
    return new HookRegistry(this);
  }

  register(
    node: HookDirectiveNode,
    location?: SourceLocation | null,
    options?: RegisterHookOptions
  ): HookDefinition {
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

    this.validateFilter(filterNode.filterKind, filterNode.value, options?.emitWarning);

    const definition: HookDefinition = {
      id: hookId,
      name: hookName,
      filterKind: filterNode.filterKind,
      filterValue: filterNode.value,
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
    const index = kind === 'operation' ? this.operationIndex : this.dataIndex;
    const normalizedValue = this.normalizeIndexedFilterValue(kind, value);

    const matches = index.get(normalizedValue) ?? [];
    return matches.slice().sort((a, b) => a.registrationOrder - b.registrationOrder);
  }

  private matchesTiming(def: HookDefinition, timing: HookTiming): boolean {
    return def.timing === timing;
  }

  private hasDefinition(id: string): boolean {
    return this.definitions.has(id) || (this.parent?.hasDefinition(id) ?? false);
  }

  private validateFilter(
    _filterKind: HookFilterKind,
    _filterValue: string,
    _emitWarning?: (message: string) => void
  ): void {
    // Custom labels (e.g., op:tool:w) are valid operation filters —
    // they match against exe/operation labels, not just built-in operation types.
  }

  private registerDefinition(definition: HookDefinition): void {
    definition.filterValue = this.normalizeIndexedFilterValue(definition.filterKind, definition.filterValue);
    this.definitions.set(definition.id, definition);
    this.hooks.push(definition);
    if (!this.isRoot()) {
      this.root.hooks.push(definition);
    }
    if (definition.name) {
      this.namedDefinitions.set(definition.name, definition);
    }

    const index = definition.filterKind === 'operation' ? this.operationIndex : this.dataIndex;
    const list = index.get(definition.filterValue);
    if (list) {
      list.push(definition);
    } else {
      index.set(definition.filterValue, [definition]);
    }
  }

  private normalizeIndexedFilterValue(kind: HookFilterKind, value: string): string {
    if (kind !== 'operation') {
      return value;
    }
    return normalizeNamedOperationSelector(value) ?? value.toLowerCase();
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
