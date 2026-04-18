import type { TypedDirectiveNode } from './base';
import type { SourceLocation, VariableReferenceNode } from './primitives';
import type { RecordDefinition } from './record';

export type ShelfSlotCardinality = 'singular' | 'collection';
export type ShelfMergeMode = 'replace' | 'append' | 'upsert';

const SHELF_SLOT_REF_VALUE_SYMBOL = Symbol.for('mlld.ShelfSlotRefValue');
const SHELF_SLOT_REF_METADATA = Symbol('mlld.ShelfSlotRefMetadata');
const SHELF_SLOT_REF_CURRENT = Symbol('mlld.ShelfSlotRefCurrent');
const shelfSlotRefOwnerKeychain = new WeakMap<object, unknown>();

export interface ShelfScopeSlotRef {
  shelfName: string;
  slotName: string;
}

export interface ShelfSlotRefSnapshot<T = unknown> {
  text: string;
  data: T;
  mx?: unknown;
  metadata?: Record<string, unknown>;
  internal?: Record<string, unknown>;
  type?: string;
}

export class ShelfSlotRefValue<T = unknown> {
  constructor(ref: ShelfScopeSlotRef, current: ShelfSlotRefSnapshot<T>) {
    Object.defineProperty(this, SHELF_SLOT_REF_VALUE_SYMBOL, {
      value: true,
      enumerable: false,
      configurable: false
    });
    Object.defineProperty(this, SHELF_SLOT_REF_METADATA, {
      value: {
        shelfName: ref.shelfName,
        slotName: ref.slotName
      } satisfies ShelfScopeSlotRef,
      enumerable: false,
      configurable: false
    });
    Object.defineProperty(this, SHELF_SLOT_REF_CURRENT, {
      value: current,
      enumerable: false,
      configurable: true,
      writable: false
    });
  }

  get kind(): 'shelf-slot-ref' {
    return 'shelf-slot-ref';
  }

  get shelfName(): string {
    return (this as unknown as Record<symbol, ShelfScopeSlotRef>)[SHELF_SLOT_REF_METADATA].shelfName;
  }

  get slotName(): string {
    return (this as unknown as Record<symbol, ShelfScopeSlotRef>)[SHELF_SLOT_REF_METADATA].slotName;
  }

  get current(): ShelfSlotRefSnapshot<T> {
    return (this as unknown as Record<symbol, ShelfSlotRefSnapshot<T>>)[SHELF_SLOT_REF_CURRENT];
  }

  get text(): string {
    return this.current.text;
  }

  get data(): T {
    return this.current.data;
  }

  get mx(): unknown {
    return this.current.mx;
  }

  get metadata(): Record<string, unknown> | undefined {
    return this.current.metadata;
  }

  get internal(): Record<string, unknown> | undefined {
    return this.current.internal;
  }

  toString(): string {
    return this.text;
  }

  valueOf(): string {
    return this.text;
  }

  [Symbol.toPrimitive](): string {
    return this.text;
  }

  toJSON(): T {
    return this.data;
  }
}

export function createShelfSlotRefValue<T = unknown>(
  ref: ShelfScopeSlotRef,
  current: ShelfSlotRefSnapshot<T>
): ShelfSlotRefValue<T> {
  return new ShelfSlotRefValue(ref, current);
}

export function stashShelfSlotRefOwner(
  value: unknown,
  owner: unknown
): void {
  if (!value || typeof value !== 'object') {
    return;
  }

  if (owner === undefined) {
    shelfSlotRefOwnerKeychain.delete(value);
    return;
  }

  shelfSlotRefOwnerKeychain.set(value, owner);
}

export function getShelfSlotRefOwner(
  value: unknown
): unknown {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  return shelfSlotRefOwnerKeychain.get(value);
}

export function isShelfSlotRefValue<T = unknown>(value: unknown): value is ShelfSlotRefValue<T> {
  return Boolean(
    value &&
    typeof value === 'object' &&
    (value as Record<symbol, unknown>)[SHELF_SLOT_REF_VALUE_SYMBOL] === true
  );
}

export function getShelfSlotRefSnapshot<T = unknown>(
  value: unknown
): ShelfSlotRefSnapshot<T> | undefined {
  return isShelfSlotRefValue<T>(value) ? value.current : undefined;
}

export interface NormalizedShelfScope {
  __mlldShelfScope: true;
  readSlots: ShelfScopeSlotRef[];
  writeSlots: ShelfScopeSlotRef[];
  readAliases: Record<string, unknown>;
  readSlotBindings: ShelfScopeSlotBinding[];
  writeSlotBindings: ShelfScopeSlotBinding[];
}

export interface ShelfScopeSlotBinding {
  ref: ShelfScopeSlotRef;
  alias?: string;
}

export interface ShelfSlotDefinition {
  name: string;
  record: string;
  cardinality: ShelfSlotCardinality;
  optional: boolean;
  merge: ShelfMergeMode;
  from?: string;
  location?: SourceLocation;
}

export interface ShelfDefinition {
  name: string;
  slots: Record<string, ShelfSlotDefinition>;
  location?: SourceLocation;
}

export interface SerializedShelfDefinition {
  __shelf: true;
  definition: ShelfDefinition;
  records?: Record<string, RecordDefinition>;
}

export interface ShelfSlotDirectiveValue {
  name: string;
  record: string;
  cardinality: ShelfSlotCardinality;
  optional: boolean;
  merge?: ShelfMergeMode;
  from?: string;
  expanded?: boolean;
  location?: SourceLocation;
}

export interface ShelfDirectiveNode extends TypedDirectiveNode<'shelf', 'shelf'> {
  values: {
    identifier: VariableReferenceNode[];
    slots: ShelfSlotDirectiveValue[];
  };
  raw: {
    identifier: string;
  };
  meta: {
    slotCount: number;
  };
}

export function isNormalizedShelfScope(value: unknown): value is NormalizedShelfScope {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Partial<NormalizedShelfScope>;
  return (
    candidate.__mlldShelfScope === true
    && Array.isArray(candidate.readSlots)
    && Array.isArray(candidate.writeSlots)
    && Boolean(candidate.readAliases)
    && typeof candidate.readAliases === 'object'
    && !Array.isArray(candidate.readAliases)
    && Array.isArray(candidate.readSlotBindings)
    && Array.isArray(candidate.writeSlotBindings)
  );
}
