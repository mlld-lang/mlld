import type { SourceLocation } from './primitives';
import type { RecordDefinition } from './record';
import { createObjectVariable, type Variable, type VariableSource } from './variable';

export type SessionDeclarationId = string;

export type SessionPrimitiveType = 'string' | 'number' | 'boolean' | 'object' | 'array';

export interface SessionPrimitiveSlotType {
  kind: 'primitive';
  name: SessionPrimitiveType;
  isArray: boolean;
  optional: boolean;
}

export interface SessionRecordSlotType {
  kind: 'record';
  name: string;
  definition: RecordDefinition;
  isArray: boolean;
  optional: boolean;
}

export type SessionSlotType = SessionPrimitiveSlotType | SessionRecordSlotType;

export interface SessionSlotBinding {
  name: string;
  type: SessionSlotType;
  location?: SourceLocation;
}

export interface SessionDefinition {
  id: SessionDeclarationId;
  canonicalName: string;
  originPath?: string;
  slots: Record<string, SessionSlotBinding>;
  location?: SourceLocation;
}

export interface SessionFrameInstance {
  readonly sessionId: string;
  readonly definition: SessionDefinition;
  hasSlot(name: string): boolean;
  getSlot(name: string): unknown;
  setSlot(name: string, value: unknown): void;
  clearSlot(name: string): void;
  snapshot(): Record<string, unknown>;
}

export interface SessionScopedAttachment {
  definition: SessionDefinition;
  seed?: unknown;
}

export type SessionWriteOperation =
  | 'seed'
  | 'set'
  | 'write'
  | 'update'
  | 'append'
  | 'increment'
  | 'clear';

export interface SerializedSessionDefinition {
  __session: true;
  definition: SessionDefinition;
  records?: Record<string, RecordDefinition>;
}

export interface SessionWriteRecord {
  sessionId: string;
  declarationId: SessionDeclarationId;
  sessionName: string;
  originPath?: string;
  path: string;
  operation: SessionWriteOperation;
  previous?: unknown;
  value?: unknown;
  timestamp: string;
  index: number;
}

export type SessionFinalStateSnapshot = Record<string, unknown>;
export type SessionFinalStateMap = Record<string, SessionFinalStateSnapshot>;

export interface SessionFinalStateRecord {
  frameId: string;
  declarationId: SessionDeclarationId;
  name: string;
  originPath?: string;
  finalState: SessionFinalStateSnapshot;
}

export interface SessionOverlayRead {
  found: boolean;
  value?: unknown;
}

export interface SessionBufferedWrite {
  path?: string;
  value?: unknown;
  clear?: boolean;
  commit(): void;
  discard(): void;
}

export interface SessionWriteBuffer {
  stage(entry: SessionBufferedWrite): void;
  commit(): void;
  discard(): void;
  clear(): void;
  readOverlay(path: string): SessionOverlayRead | undefined;
}

const SESSION_VARIABLE_SOURCE: VariableSource = {
  directive: 'var',
  syntax: 'object',
  hasInterpolation: false,
  isMultiLine: true
};

export function createSessionSchemaVariable(
  name: string,
  definition: SessionDefinition,
  source: VariableSource = SESSION_VARIABLE_SOURCE
): Variable {
  return createObjectVariable(name, definition as unknown as Record<string, unknown>, false, source, {
    internal: {
      isSessionSchema: true,
      sessionSchema: definition
    }
  });
}

export function serializeSessionDefinition(
  env: { getRecordDefinition(name: string): RecordDefinition | undefined },
  definition: SessionDefinition
): SerializedSessionDefinition {
  const recordNames = Array.from(new Set(
    Object.values(definition.slots)
      .filter((slot): slot is SessionSlotBinding & { type: SessionRecordSlotType } => slot.type.kind === 'record')
      .map(slot => slot.type.name)
  ));

  const records = Object.fromEntries(
    recordNames
      .map(recordName => [recordName, env.getRecordDefinition(recordName)])
      .filter((entry): entry is [string, RecordDefinition] => Boolean(entry[1]))
  );

  return {
    __session: true,
    definition,
    ...(Object.keys(records).length > 0 ? { records } : {})
  };
}

export function isSerializedSessionDefinition(value: unknown): value is SerializedSessionDefinition {
  return Boolean(
    value &&
    typeof value === 'object' &&
    (value as SerializedSessionDefinition).__session === true &&
    (value as SerializedSessionDefinition).definition
  );
}
