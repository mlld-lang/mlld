import type { TypedDirectiveNode } from './base';
import type { SourceLocation, VariableReferenceNode } from './primitives';
import type { RecordDefinition } from './record';

export type ShelfSlotCardinality = 'singular' | 'collection';
export type ShelfMergeMode = 'replace' | 'append' | 'upsert';

export interface ShelfScopeSlotRef {
  shelfName: string;
  slotName: string;
}

export interface NormalizedShelfScope {
  __mlldShelfScope: true;
  readSlots: ShelfScopeSlotRef[];
  writeSlots: ShelfScopeSlotRef[];
  readAliases: Record<string, unknown>;
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
  );
}
