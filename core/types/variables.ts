/**
 * Core types for Meld variables, based on the refined specification.
 */

import type { SourceLocation, JsonValue } from './common.js';
import type { IFilesystemPathState, IUrlPathState } from './paths.js';
import type { ICommandDefinition } from './define.js';

// =========================================================================
// CORE VARIABLE TYPES
// =========================================================================

/**
 * Enum defining the supported variable types in Meld.
 *
 * @remarks All service leads agreed on the discriminated union pattern with
 * this enum as the discriminant for type safety.
 */
export enum VariableType {
  TEXT = 'text',
  DATA = 'data',
  PATH = 'path',
  COMMAND = 'command'
}

/**
 * Base interface for all Meld variables.
 * Uses discriminated union pattern for type safety.
 *
 * @remarks Implemented as requested by all service leads to enable
 * exhaustive type checking and prevent type errors at compile time.
 */
export interface BaseVariable<T> {
  /** Discriminant for type checking */
  type: VariableType;
  
  /** Name of the variable */
  name: string;
  
  /** The actual value of the variable */
  value: T;
  
  /** Optional metadata for tracking and debugging */
  metadata?: VariableMetadata;
}

/**
 * Metadata for tracking variable history and provenance.
 *
 * @remarks Enhanced based on StateManagement service lead feedback to track
 * variable origin and transformation status.
 */
export interface VariableMetadata {
  /** Source location where the variable was defined */
  definedAt?: SourceLocation;
  
  /** When the variable was created */
  createdAt: number;
  
  /** When the variable was last modified */
  modifiedAt: number;
  
  /** History of changes to the variable */
  history?: VariableChange[];
  
  /** Source of the variable (direct definition, import, transformation) */
  origin: VariableOrigin;
  
  /** Additional context-specific metadata */
  context?: Record<string, unknown>;
}

/**
 * Identifies the origin of a variable.
 *
 * @remarks Added based on StateManagement service lead feedback to track
 * where variables come from, which helps with debugging and import handling.
 */
export enum VariableOrigin {
  DIRECT_DEFINITION = 'direct',
  IMPORT = 'import',
  TRANSFORMATION = 'transformation',
  SYSTEM = 'system'
}

/**
 * Represents a change to a variable's value.
 */
export interface VariableChange {
  /** Previous value before the change */
  previousValue: any;
  
  /** New value after the change */
  newValue: any;
  
  /** When the change occurred */
  timestamp: number;
  
  /** Source location where the change was triggered */
  location?: SourceLocation;
  
  /** Reason for the change */
  reason?: string;
}

// =========================================================================
// SPECIFIC VARIABLE TYPES
// =========================================================================

/**
 * Text variable - stores simple string values.
 * Referenced with {{varName}} syntax.
 */
export interface TextVariable extends BaseVariable<string> {
  type: VariableType.TEXT;
}

/**
 * Data variable - stores structured data (objects, arrays, or primitives).
 * Referenced with {{varName}} or {{varName.field}} syntax.
 */
export interface DataVariable extends BaseVariable<JsonValue> {
  type: VariableType.DATA;
}

/**
 * Path variable - stores filesystem paths OR URL states with validation.
 * Referenced with $varName syntax.
 *
 * @remarks Revised to handle both filesystem paths and URLs using a
 * discriminated union for the 'value' property.
 */
export interface IPathVariable extends BaseVariable<IFilesystemPathState | IUrlPathState> {
  type: VariableType.PATH;
  // The 'value' field now holds a union representing detailed state
  // for either filesystem path or URL.
}

/**
 * Command variable - stores a structured command definition.
 * Referenced with @commandName syntax.
 *
 * @remarks Revised so 'value' holds the detailed ICommandDefinition
 * derived from the @define directive spec.
 */
export interface CommandVariable extends BaseVariable<ICommandDefinition> {
  type: VariableType.COMMAND;
}

// =========================================================================
// VARIABLE UNION TYPES
// =========================================================================

/**
 * Union type of all variable types for type-safe handling.
 */
export type MeldVariable =
  | TextVariable
  | DataVariable
  | IPathVariable // Use the revised path variable type
  | CommandVariable; 