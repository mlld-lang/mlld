# Initial TypeScript Type Specification for Meld Variable Handling

```typescript
/**
 * Represents the different types of variables in Meld
 * 
 * @remarks Chosen as an enum rather than string literal union for better IDE support,
 * centralized definition, and easier maintenance when adding new variable types.
 */
export enum VariableType {
  /** Text variables ({{var}}) */
  TEXT = 'text',
  /** Data variables ({{var.field}}) */
  DATA = 'data',
  /** Path variables ($var) */
  PATH = 'path',
  /** Command variables (@command) */
  COMMAND = 'command'
}

/**
 * Represents a text variable value
 */
export interface TextVariableValue {
  type: VariableType.TEXT;
  value: string;
  /** Original source location where the variable was defined */
  sourceLocation?: string;
}

/**
 * Represents a data variable value
 * 
 * @remarks We've kept 'any' for the value type due to the dynamic nature of JSON data,
 * but future enhancements could include schema validation or typed generics.
 */
export interface DataVariableValue {
  type: VariableType.DATA;
  value: any;
  /** Original source location where the variable was defined */
  sourceLocation?: string;
}

/**
 * Represents a path variable value
 */
export interface PathVariableValue {
  type: VariableType.PATH;
  value: string;
  isAbsolute?: boolean;
  /** Original source location where the variable was defined */
  sourceLocation?: string;
}

/**
 * Represents a command variable value
 */
export interface CommandVariableValue {
  type: VariableType.COMMAND;
  value: string;
  args?: string[];
  /** Original source location where the variable was defined */
  sourceLocation?: string;
}

/**
 * Union type for all variable values
 */
export type VariableValue = 
  | TextVariableValue 
  | DataVariableValue 
  | PathVariableValue 
  | CommandVariableValue;

/**
 * Represents the context type for formatting
 */
export enum FormattingContextType {
  INLINE = 'inline',
  BLOCK = 'block'
}

/**
 * Represents the formatting context for output generation
 * 
 * @remarks This type standardizes formatting context to ensure consistent 
 * variable rendering across directive boundaries. It replaces the previous
 * ad-hoc approach using boolean flags.
 */
export interface FormattingContext {
  /** Whether in output-literal mode (formerly transformation mode) */
  isOutputLiteral: boolean;
  /** Whether this is an inline or block context */
  contextType: FormattingContextType;
  /** Current node type being processed */
  nodeType: string;
  /** Whether at start of line */
  atLineStart?: boolean;
  /** Whether at end of line */
  atLineEnd?: boolean;
  /** Parent formatting context for inheritance */
  parentContext?: FormattingContext;
}

/**
 * Represents a field access segment for data variable access
 */
export type FieldAccessSegment = 
  | { type: 'property'; name: string }
  | { type: 'index'; value: number };

/**
 * Represents a complete field access path
 */
export type FieldPath = FieldAccessSegment[];

/**
 * Result of a field access operation
 * 
 * @remarks This type provides structured error handling for field access operations,
 * making it easier to track and debug field access failures.
 */
export type FieldAccessResult<T = any> = 
  | { success: true; value: T; path: string }
  | { success: false; error: string; path: string };

/**
 * Represents the context needed for variable resolution
 * 
 * @remarks This interface replaces the previous Record<string, any> approach,
 * providing self-documentation, consistency, and compile-time checking for
 * resolution context properties.
 */
export interface ResolutionContext {
  /** Current file being processed */
  currentFilePath?: string;
  /** Working directory for path resolution */
  workingDirectory?: string;
  /** Current state for variable lookup */
  state?: StateServiceLike;
  /** Maximum depth for nested resolution (prevents circular references) */
  depth?: number;
  /** Maximum allowed resolution depth */
  maxDepth?: number;
  /** Whether to throw errors on missing variables (strict mode) */
  strict?: boolean;
  /** Allowed variable types for this resolution context */
  allowedVariableTypes?: VariableType[];
  /** Whether this is a variable embed operation */
  isVariableEmbed?: boolean;
  /** Whether to disable path prefixing */
  disablePathPrefixing?: boolean;
  /** Formatting context for output generation */
  formattingContext?: FormattingContext;
  /** Resolution chain for circular reference detection */
  resolutionChain?: string[];
}

/**
 * Base interface for state services that store variables
 * 
 * @remarks This interface provides a common contract for state services,
 * allowing for better type checking and dependency injection.
 */
export interface StateServiceLike {
  getVariable(name: string, type: VariableType): VariableOperationResult;
  setVariable(name: string, value: any, type: VariableType): VariableOperationResult;
  hasVariable(name: string, type: VariableType): boolean;
  deleteVariable(name: string, type: VariableType): VariableOperationResult;
  getParentState(): StateServiceLike | undefined;
}

/**
 * Base interface for variable reference nodes
 * 
 * @remarks Provides a consistent type for variable reference nodes throughout 
 * the codebase, eliminating unsafe type assertions.
 */
export interface IVariableReference extends MeldNode {
  type: 'VariableReference';
  valueType: VariableType;
  identifier: string;
  fields?: FieldAccessSegment[];
  format?: FormattingContextType;
  resolvedValue?: any;
  isResolved?: boolean;
}

/**
 * Generic result type for operations that may fail
 */
export type Result<T, E extends Error = Error> = 
  | { success: true; value: T }
  | { success: false; error: E };

/**
 * Result of variable resolution
 */
export interface ResolutionResult<T = any> {
  success: boolean;
  value?: T;
  originalType: VariableType;
  needsStringConversion: boolean;
  error?: string;
}

/**
 * Result of variable operations in state service
 * 
 * @remarks Standardizes error handling and operation results, making the
 * code more robust and easier to maintain.
 */
export interface VariableOperationResult<T = any> {
  success: boolean;
  value?: T;
  error?: string;
  metadata?: {
    operation: 'get' | 'set' | 'delete';
    variableType: VariableType;
    name: string;
    timestamp: number;
  };
}

/**
 * Context passed to directive handlers
 */
export interface DirectiveHandlerContext {
  /** Current state for the directive */
  state: StateServiceLike;
  /** Parent state for inheritance and variable resolution */
  parentState: StateServiceLike;
  /** Current file path for error reporting and path resolution */
  currentFilePath?: string;
  /** Formatting context for consistent output generation */
  formattingContext: FormattingContext;
  /** Resolution context for variable resolution */
  resolutionContext?: ResolutionContext;
}

/**
 * Result of directive handler execution
 */
export interface DirectiveHandlerResult {
  state: StateServiceLike;
  replacement?: MeldNode;
  getFormattingContext?(): FormattingContext;
}

/**
 * Interface for variable reference resolver
 * 
 * @remarks This interface standardizes the contract for variable resolution,
 * making it easier to test and mock.
 */
export interface IVariableReferenceResolver {
  resolveReference(