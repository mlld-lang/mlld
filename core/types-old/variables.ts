/**
 * Core types for Meld variables, based on the refined specification.
 */

import type { SourceLocation, JsonValue } from './common';
import type { IFilesystemPathState, IUrlPathState } from './paths';
import type { ICommandDefinition } from './define';

// Re-export path state types
export type { IFilesystemPathState, IUrlPathState };

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
  COMMAND = 'command',
  IMPORT = 'import'
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

/**
 * Import variable - stores an import definition.
 * Referenced with @importName syntax.
 */
export interface ImportVariable extends BaseVariable<unknown> {
  type: VariableType.IMPORT;
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
  | CommandVariable
  | ImportVariable; // Add import variable type

/**
 * Structure representing a variable definition for state changes.
 * Used when returning results from directive handlers.
 */
export type VariableDefinition = {
  type: VariableType;
  value: any; // Use 'any' for flexibility or refine later
  metadata?: VariableMetadata; // Make metadata optional
};

// =========================================================================
// FACTORY FUNCTIONS
// =========================================================================

/**
 * Factory functions for creating variables with proper typing.
 */
export const createTextVariable = (
  name: string,
  value: string,
  metadata?: Partial<VariableMetadata>
): TextVariable => ({
  type: VariableType.TEXT,
  name,
  value,
  metadata: {
    createdAt: Date.now(),
    modifiedAt: Date.now(),
    origin: VariableOrigin.DIRECT_DEFINITION,
    ...metadata
  }
});

export const createDataVariable = (
  name: string,
  value: JsonValue,
  metadata?: Partial<VariableMetadata>
): DataVariable => ({
  type: VariableType.DATA,
  name,
  value,
  metadata: {
    createdAt: Date.now(),
    modifiedAt: Date.now(),
    origin: VariableOrigin.DIRECT_DEFINITION,
    ...metadata
  }
});

// Updated createPathVariable factory
export const createPathVariable = (
  name: string,
  value: IFilesystemPathState | IUrlPathState, // Accepts the union state
  metadata?: Partial<VariableMetadata>
): IPathVariable => ({
  type: VariableType.PATH,
  name,
  value, // Store the provided state directly
  metadata: {
    createdAt: Date.now(),
    modifiedAt: Date.now(),
    origin: VariableOrigin.DIRECT_DEFINITION,
    ...metadata
  }
});

// Updated createCommandVariable factory
export const createCommandVariable = (
  name: string,
  value: ICommandDefinition, // Accepts the structured definition
  metadata?: Partial<VariableMetadata>
): CommandVariable => ({
  type: VariableType.COMMAND,
  name,
  value, // Store the provided definition directly
  metadata: {
    createdAt: Date.now(),
    modifiedAt: Date.now(),
    origin: VariableOrigin.DIRECT_DEFINITION,
    ...metadata
  }
}); 

// New createImportVariable factory
export const createImportVariable = (
  name: string,
  value: unknown,
  metadata?: Partial<VariableMetadata>
): ImportVariable => ({
  type: VariableType.IMPORT,
  name,
  value,
  metadata: {
    createdAt: Date.now(),
    modifiedAt: Date.now(),
    origin: VariableOrigin.DIRECT_DEFINITION,
    ...metadata
  }
});