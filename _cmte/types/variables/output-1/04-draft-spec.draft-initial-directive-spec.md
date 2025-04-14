I'll provide a comprehensive TypeScript type specification proposal for Meld's internal variable handling system based on the requirements and architectural context provided.

```typescript
/**
 * Core types for Meld's internal variable handling system.
 * 
 * This proposal provides a comprehensive type system for managing variables
 * within the Meld interpreter, including storage, resolution, and validation.
 */

// =========================================================================
// CORE VARIABLE TYPES
// =========================================================================

/**
 * Enum defining the supported variable types in Meld.
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
 * @decision Used discriminated union with 'type' property to enable
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
 * @decision Made metadata optional to avoid performance overhead
 * in production while enabling debugging capabilities when needed.
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
}

/**
 * Source location information for tracking variable definitions.
 */
export interface SourceLocation {
  /** File path where the variable was defined */
  filePath: string;
  
  /** Line number in the file */
  line: number;
  
  /** Column number in the file */
  column: number;
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
 * JSON-compatible value types supported in data variables.
 */
export type JsonValue = 
  | string
  | number
  | boolean
  | null
  | JsonObject
  | JsonArray;

/**
 * JSON object type for data variables.
 */
export interface JsonObject {
  [key: string]: JsonValue;
}

/**
 * JSON array type for data variables.
 */
export type JsonArray = JsonValue[];

/**
 * Data variable - stores structured data (objects, arrays, or primitives).
 * Referenced with {{varName}} or {{varName.field}} syntax.
 */
export interface DataVariable extends BaseVariable<JsonValue> {
  type: VariableType.DATA;
}

/**
 * Path variable - stores filesystem paths with validation.
 * Referenced with $varName syntax.
 * 
 * @decision Added isAbsolute flag to track whether a path has been
 * fully resolved to an absolute path, which simplifies validation
 * and helps prevent path traversal issues.
 */
export interface PathVariable extends BaseVariable<string> {
  type: VariableType.PATH;
  
  /** Whether the path is absolute or relative */
  isAbsolute: boolean;
}

/**
 * Command variable - stores command definitions.
 * Referenced with @commandName syntax.
 */
export interface CommandVariable extends BaseVariable<CommandDefinition> {
  type: VariableType.COMMAND;
}

/**
 * Command definition structure.
 */
export interface CommandDefinition {
  /** Unique identifier for the command */
  id: string;
  
  /** Parameters accepted by the command */
  parameters: CommandParameter[];
  
  /** Function to execute the command */
  execute: CommandExecuteFunction;
  
  /** Documentation for the command */
  documentation?: string;
}

/**
 * Parameter definition for commands.
 */
export interface CommandParameter {
  /** Name of the parameter */
  name: string;
  
  /** Type of the parameter */
  type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'any';
  
  /** Optional default value */
  defaultValue?: any;
  
  /** Whether the parameter is required */
  required: boolean;
  
  /** Documentation for the parameter */
  documentation?: string;
}

/**
 * Command execution function type.
 */
export type CommandExecuteFunction = (
  params: Record<string, any>,
  context: CommandExecutionContext
) => Promise<any>;

/**
 * Context provided during command execution.
 */
export interface CommandExecutionContext {
  /** Current state service */
  state: IStateService;
  
  /** File system service */
  fileSystem: IFileSystemService;
  
  /** Path service */
  pathService: IPathService;
  
  /** Resolution service */
  resolutionService: IResolutionService;
  
  /** Source location of command invocation */
  location?: SourceLocation;
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
  | PathVariable
  | CommandVariable;

// =========================================================================
// STATE STORAGE
// =========================================================================

/**
 * Interface for state storage service.
 * 
 * @decision Implemented both type-specific and generic methods to
 * balance type safety with flexibility. Type-specific methods provide
 * compile-time safety, while generic methods enable more dynamic usage.
 */
export interface IStateService {
  // Type-specific getters
  getTextVar(name: string): TextVariable | undefined;
  getDataVar(name: string): DataVariable | undefined;
  getPathVar(name: string): PathVariable | undefined;
  getCommandVar(name: string): CommandVariable | undefined;
  
  // Type-specific setters
  setTextVar(name: string, value: string, metadata?: VariableMetadata): TextVariable;
  setDataVar(name: string, value: JsonValue, metadata?: VariableMetadata): DataVariable;
  setPathVar(name: string, value: string, isAbsolute: boolean, metadata?: VariableMetadata): PathVariable;
  setCommandVar(name: string, value: CommandDefinition, metadata?: VariableMetadata): CommandVariable;
  
  // Generic methods
  getVariable(name: string, type?: VariableType): MeldVariable | undefined;
  setVariable(variable: MeldVariable): MeldVariable;
  
  // Variable existence checks
  hasVariable(name: string, type?: VariableType): boolean;
  
  // Variable removal
  removeVariable(name: string, type?: VariableType): boolean;
  
  // State management
  createChildState(): IStateService;
  clone(): IStateService;
  
  // Original and transformed nodes
  getOriginalNodes(): MeldNode[];
  getTransformedNodes(): MeldNode[];
  setOriginalNodes(nodes: MeldNode[]): void;
  setTransformedNodes(nodes: MeldNode[]): void;
  transformNode(index: number, replacement: MeldNode | MeldNode[]): void;
}

// =========================================================================
// VARIABLE RESOLUTION
// =========================================================================

/**
 * Context passed during variable resolution.
 * 
 * @decision Made context immutable to prevent side effects during
 * resolution, with factory methods for creating derived contexts.
 */
export interface ResolutionContext {
  /** State service for accessing variables */
  readonly state: IStateService;
  
  /** Whether to throw errors for missing variables */
  readonly strict: boolean;
  
  /** Current resolution depth (for circular reference detection) */
  readonly depth: number;
  
  /** Variable types allowed in this context */
  readonly allowedVariableTypes?: VariableType[];
  
  /** Special flags for modifying resolution behavior */
  readonly flags: ResolutionFlags;
  
  /** Formatting context for output generation */
  readonly formattingContext?: FormattingContext;
  
  /** Create a new context with increased depth */
  withIncreasedDepth(): ResolutionContext;
  
  /** Create a new context with different strictness */
  withStrictMode(strict: boolean): ResolutionContext;
  
  /** Create a new context with specific allowed variable types */
  withAllowedTypes(types: VariableType[]): ResolutionContext;
  
  /** Create a new context with additional flags */
  withFlags(flags: Partial<ResolutionFlags>): ResolutionContext;
  
  /** Create a new context with formatting context */
  withFormattingContext(formatting: FormattingContext): ResolutionContext;
}

/**
 * Flags that modify variable resolution behavior.
 */
export interface ResolutionFlags {
  /** Disable path prefixing for variable embedding */
  isVariableEmbed: boolean;
  
  /** Enable transformation mode */
  isTransformation: boolean;
  
  /** Allow resolution in raw content (pre-parsing) */
  allowRawContentResolution: boolean;
}

/**
 * Context for formatting resolved variable values.
 */
export interface FormattingContext {
  /** Whether the variable is in a block context */
  isBlock: boolean;
  
  /** Type of node containing the variable */
  nodeType?: string;
  
  /** Position of the variable in the line */
  linePosition?: 'start' | 'middle' | 'end';
  
  /** Indentation level for block formatting */
  indentationLevel?: number;
}

// =========================================================================
// VARIABLE REFERENCES AND FIELD ACCESS
// =========================================================================

/**
 * Variable reference node from parsing {{var}} or {{var.field}} syntax.
 */
export interface VariableReferenceNode {
  /** Type discriminant */
  type: 'variable-reference';
  
  /** Variable name without field access */
  name: string;
  
  /** Field access path if present */
  fields?: FieldAccess[];
  
  /** Default value if variable is undefined */
  defaultValue?: string;
}

/**
 * Field access types for data variables.
 */
export enum FieldAccessType {
  PROPERTY = 'property',
  INDEX = 'index'
}

/**
 * Field access specification for data variables.
 */
export interface FieldAccess {
  /** Type of access (property or array index) */
  type: FieldAccessType;
  
  /** Property name or array index */
  key: string | number;
}

/**
 * Service interface for resolving variable references.
 */
export interface IVariableReferenceResolver {
  /**
   * Resolve variable references in content.
   */
  resolveReferences(
    content: string,
    context: ResolutionContext
  ): Promise<string>;
  
  /**
   * Access fields on a data variable.
   */
  accessFields(
    value: JsonValue,
    fields: FieldAccess[],
    context: ResolutionContext
  ): JsonValue;
  
  /**
   * Convert a resolved value to string based on formatting context.
   */
  convertToString(
    value: JsonValue,
    context: ResolutionContext
  ): string;
}

// =========================================================================
// TYPE GUARDS
// =========================================================================

/**
 * Type guard functions for runtime type checking.
 * 
 * @decision Added comprehensive type guards to enable safe runtime
 * type checking, which is essential for variable resolution and
 * field access operations.
 */
export const isTextVariable = (variable: MeldVariable): variable is TextVariable => 
  variable.type === VariableType.TEXT;

export const isDataVariable = (variable: MeldVariable): variable is DataVariable => 
  variable.type === VariableType.DATA;

export const isPathVariable = (variable: MeldVariable): variable is PathVariable => 
  variable.type === VariableType.PATH;

export const isCommandVariable = (variable: MeldVariable): variable is CommandVariable => 
  variable.type === VariableType.COMMAND;

export const isJsonObject = (value: JsonValue): value is JsonObject => 
  value !== null && typeof value === 'object' && !Array.isArray(value);

export const isJsonArray = (value: JsonValue): value is JsonArray => 
  Array.isArray(value);

// =========================================================================
// UTILITY TYPES
// =========================================================================

/**
 * Branded type for variable names to prevent confusion with other string types.
 * 
 * @decision Used branded types for improved type safety and to prevent
 * accidental usage of string literals where variable names are expected.
 */
export type VariableName = string & { __brand: 'VariableName' };

/**
 * Branded type for state IDs to prevent confusion with other string types.
 */
export type StateId = string & { __brand: 'StateId' };

/**
 * Create a variable name from a string.
 */
export const createVariableName = (name: string): VariableName => 
  name as VariableName;

/**
 * Create a state ID from a string.
 */
export const createStateId = (id: string): StateId => 
  id as StateId;

// =========================================================================
// FACTORY FUNCTIONS
// =========================================================================

/**
 * Factory functions for creating variables with proper typing.
 * 
 * @decision Added factory functions to simplify variable creation
 * and ensure proper initialization of all required fields.
 */
export const createTextVariable = (
  name: string,
  value: string,
  metadata?: VariableMetadata
): TextVariable => ({
  type: VariableType.TEXT,
  name,
  value,
  metadata: metadata || {
    createdAt: Date.now(),
    modifiedAt: Date.now()
  }
});

export const createDataVariable = (
  name: string,
  value: JsonValue,
  metadata?: VariableMetadata
): DataVariable => ({
  type: VariableType.DATA,
  name,
  value,
  metadata: metadata || {
    createdAt: Date.now(),
    modifiedAt: Date.now()
  }
});

export const createPathVariable = (
  name: string,
  value: string,
  isAbsolute: boolean,
  metadata?: VariableMetadata
): PathVariable => ({
  type: VariableType.PATH,
  name,
  value,
  isAbsolute,
  metadata: metadata || {
    createdAt: Date.now(),
    modifiedAt: Date.now()
  }
});

export const createCommandVariable = (
  name: string,
  value: CommandDefinition,
  metadata?: VariableMetadata
): CommandVariable => ({
  type: VariableType.COMMAND,
  name,
  value,
  metadata: metadata || {
    createdAt: Date.now(),
    modifiedAt: Date.now()
  }
});

/**
 * Builder for creating field access paths.
 */
export class FieldAccessBuilder {
  private fields: FieldAccess[] = [];
  
  /**
   * Add a property access.
   */
  property(name: string): FieldAccessBuilder {
    this.fields.push({
      type: FieldAccessType.PROPERTY,
      key: name
    });
    return this;
  }
  
  /**
   * Add an array index access.
   */
  index(idx: number): FieldAccessBuilder {
    this.fields.push({
      type: FieldAccessType.INDEX,
      key: idx
    });
    return this;
  }
  
  /**
   * Build the field access array.
   */
  build(): FieldAccess[] {
    return [...this.fields];
  }
}

// =========================================================================
// ERROR TYPES
// =========================================================================

/**
 * Error thrown when variable resolution fails.
 */
export class VariableResolutionError extends Error {
  constructor(
    message: string,
    public readonly variableName: string,
    public readonly fields?: FieldAccess[],
    public readonly context?: ResolutionContext
  ) {
    super(message);
    this.name = 'VariableResolutionError';
  }
}

/**
 * Error thrown when field access fails.
 */
export class FieldAccessError extends Error {
  constructor(
    message: string,
    public readonly value: JsonValue,
    public readonly fields: FieldAccess[],
    public readonly failedAt: number
  ) {
    super(message);
    this.name = 'FieldAccessError';
  }
}

/**
 * Error thrown when variable validation fails.
 */
export class VariableValidationError extends Error {
  constructor(
    message: string,
    public readonly variable: MeldVariable
  ) {
    super(message);
    this.name = 'VariableValidationError';
  }
}
```