# Proposal: TypeScript Type Definitions for Meld Variable Handling

```typescript
/**
 * Enum defining the core variable types in Meld.
 * Each type has specific resolution and usage patterns.
 */
export enum MeldVariableType {
  TEXT = 'text',
  DATA = 'data',
  PATH = 'path',
  COMMAND = 'command'
}

/**
 * Enum for variable formatting contexts.
 * @remarks Replaced boolean flags with explicit enum to improve clarity
 * and support future expansion beyond binary inline/block distinction.
 */
export enum FormattingContext {
  INLINE = 'inline',     // Within a line of text (compact representation)
  BLOCK = 'block',       // Standalone block (pretty-printed)
  EMBEDDED = 'embedded'  // For variables embedded in other content
}

/**
 * Base interface for all Meld variable types.
 * Uses discriminated union pattern with 'type' field.
 */
export interface IMeldVariable {
  /** Discriminator field for type checking */
  type: MeldVariableType;
  
  /** Variable identifier/name */
  name: string;
  
  /** Whether the variable can be modified after initial definition */
  readonly immutable: boolean;
  
  /** Source location information for debugging and error reporting */
  sourceLocation?: SourceLocation;
  
  /** When the variable was last updated */
  lastUpdated: Date;
}

/**
 * Source location information for tracking variable definitions.
 */
export interface SourceLocation {
  /** Source file path */
  filePath: string;
  
  /** Line number in source file (1-based) */
  line: number;
  
  /** Column number in source file (1-based) */
  column: number;
  
  /** Directive that defined this variable */
  directiveType: string;
}

/**
 * Text variable type - stores simple string values.
 * Referenced with {{varName}} syntax.
 */
export interface ITextVariable extends IMeldVariable {
  type: MeldVariableType.TEXT;
  value: string;
}

/**
 * Path variable type - stores filesystem paths.
 * Referenced with $varName syntax.
 */
export interface IPathVariable extends IMeldVariable {
  type: MeldVariableType.PATH;
  value: string;
  
  /** Whether this path has been validated as secure */
  validated: boolean;
  
  /** Whether this is an absolute path */
  isAbsolute: boolean;
}

/**
 * Supported primitive types for data variable values.
 */
export type DataPrimitive = string | number | boolean | null;

/**
 * Recursive type for structured data values.
 */
export type DataValue = 
  | DataPrimitive
  | DataValue[]
  | { [key: string]: DataValue };

/**
 * Data variable type - stores structured data.
 * Referenced with {{varName}} or {{varName.field}} syntax.
 */
export interface IDataVariable extends IMeldVariable {
  type: MeldVariableType.DATA;
  value: DataValue;
}

/**
 * Command parameter definition.
 */
export interface CommandParameter {
  /** Parameter name */
  name: string;
  
  /** Whether the parameter is required */
  required: boolean;
  
  /** Default value if not provided */
  defaultValue?: string;
  
  /** Description for documentation */
  description?: string;
}

/**
 * Command variable type - stores command definitions.
 */
export interface ICommandVariable extends IMeldVariable {
  type: MeldVariableType.COMMAND;
  
  /** Command implementation content */
  value: string;
  
  /** Defined parameters */
  parameters: CommandParameter[];
  
  /** Whether this command is exported for use in child states */
  exported: boolean;
}

/**
 * Union type of all specific variable types.
 */
export type MeldVariable = 
  | ITextVariable 
  | IDataVariable 
  | IPathVariable
  | ICommandVariable;

/**
 * Type-safe container for storing variables by type.
 * @remarks Replaced direct Map usage with a structured container
 * to provide type safety and consistent access patterns.
 */
export interface VariableStore {
  /** Text variables map */
  textVars: Map<string, ITextVariable>;
  
  /** Data variables map */
  dataVars: Map<string, IDataVariable>;
  
  /** Path variables map */
  pathVars: Map<string, IPathVariable>;
  
  /** Command variables map */
  commands: Map<string, ICommandVariable>;
  
  /** Get the count of all variables */
  getVariableCount(): number;
  
  /** Check if a variable exists by name and optional type */
  hasVariable(name: string, type?: MeldVariableType): boolean;
}

/**
 * Reference to a field within a data variable.
 */
export interface FieldReference {
  /** Field access path (e.g., ["user", "name"] for user.name) */
  path: (string | number)[];
  
  /** Whether this is an array index access */
  isArrayAccess?: boolean;
}

/**
 * Structure representing a variable reference found in content.
 */
export interface VariableReference {
  /** Full reference text (e.g., "{{user.name}}") */
  fullReference: string;
  
  /** Variable name without field access (e.g., "user") */
  variableName: string;
  
  /** Variable type being referenced */
  variableType: MeldVariableType;
  
  /** Field access information if applicable */
  fieldAccess?: FieldReference;
  
  /** Start position in original text */
  startPos: number;
  
  /** End position in original text */
  endPos: number;
}

/**
 * Result of a field access operation.
 */
export interface FieldAccessResult {
  /** The value found at the field path */
  value: DataValue;
  
  /** Whether the field was found */
  found: boolean;
  
  /** Error message if access failed */
  error?: string;
}

/**
 * Context object for variable resolution.
 * @remarks Consolidated all resolution options into a single context object
 * to improve consistency and make the resolution process more predictable.
 */
export interface ResolutionContext {
  /** Current resolution depth (for circularity detection) */
  depth: number;
  
  /** Maximum allowed resolution depth */
  maxDepth: number;
  
  /** Set of variables already visited in this resolution chain */
  visitedVariables: Set<string>;
  
  /** Whether to throw errors on missing variables */
  strict: boolean;
  
  /** Formatting context for string conversion */
  formattingContext: FormattingContext;
  
  /** Types of variables allowed in this resolution */
  allowedVariableTypes?: MeldVariableType[];
  
  /** Whether this is a variable embed (affects path prefixing) */
  isVariableEmbed?: boolean;
  
  /** Parent state for inheritance lookups */
  parentState?: any; // Will be IStateService in implementation
  
  /** Whether to resolve nested variables */
  resolveNested: boolean;
}

/**
 * Context for state updates to track variable modifications.
 */
export interface StateUpdateContext {
  /** Source file causing the update */
  sourceFile?: string;
  
  /** Whether this update is from an import */
  isImport?: boolean;
  
  /** Whether to allow overwriting immutable variables */
  forceOverwrite?: boolean;
  
  /** Source location information */
  location?: SourceLocation;
}

/**
 * Validation result for variable identifiers.
 */
export interface IdentifierValidationResult {
  /** Whether the identifier is valid */
  valid: boolean;
  
  /** Error message if invalid */
  error?: string;
}

/**
 * Configuration for string conversion.
 */
export interface StringConversionOptions {
  /** Formatting context */
  context: FormattingContext;
  
  /** Indentation level for block formatting */
  indentLevel?: number;
  
  /** Maximum array items to show inline before truncating */
  maxInlineArrayItems?: number;
  
  /** Maximum object fields to show inline before truncating */
  maxInlineObjectFields?: number;
}

/**
 * Type guard function to check if a variable is a TextVariable.
 * @param variable The variable to check
 * @returns True if the variable is a TextVariable
 */
export function isTextVariable(variable: IMeldVariable): variable is ITextVariable {
  return variable.type === MeldVariableType.TEXT;
}

/**
 * Type guard function to check if a variable is a DataVariable.
 * @param variable The variable to check
 * @returns True if the variable is a DataVariable
 */
export function isDataVariable(variable: IMeldVariable): variable is IDataVariable {
  return variable.type === MeldVariableType.DATA;
}

/**
 * Type guard function to check if a variable is a PathVariable.
 * @param variable The variable to check
 * @returns True if the variable is a PathVariable
 */
export function isPathVariable(variable: IMeldVariable): variable is IPathVariable {
  return variable.type === MeldVariableType.PATH;
}

/**
 * Type guard function to check if a variable is a CommandVariable.
 * @param variable The variable to check
 * @returns True if the variable is a CommandVariable
 */
export function isCommandVariable(variable: IMeldVariable): variable is ICommandVariable {
  return variable.type === MeldVariableType.COMMAND;
}

/**
 * Pattern for valid variable identifiers.
 * @remarks Standardized identifier validation across all variable types
 * to ensure consistency and prevent edge cases.
 */
export const VALID_IDENTIFIER_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/**
 * Error types for variable operations.
 */
export enum VariableErrorType {
  NOT_FOUND = 'variable_not_found',
  INVALID_IDENTIFIER = 'invalid_identifier',
  CIRCULAR_REFERENCE = 'circular_reference',
  INVALID_FIELD_ACCESS = 'invalid_field_access',
  TYPE_MISMATCH = 'type_mismatch',
  IMMUTABLE_VARIABLE = 'immutable_variable',
  RESOLUTION_DEPTH_EXCEEDED = 'resolution_depth_exceeded',
  INVALID_PATH = 'invalid_path'
}
```