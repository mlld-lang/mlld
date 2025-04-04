Based on the comprehensive feedback from all service leads, I'll now provide a final, refined TypeScript type specification for Meld's internal variable handling system.

```typescript
/**
 * Core types for Meld's internal variable handling system.
 * 
 * This specification defines the comprehensive type system for managing variables
 * within the Meld interpreter, including storage, resolution, and validation.
 */

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

/**
 * Source location information for tracking variable definitions.
 * 
 * @remarks Enhanced based on ParserCore service lead feedback to support
 * more detailed source mapping.
 */
export interface SourceLocation {
  /** File path where the variable was defined */
  filePath: string;
  
  /** Line number in the file */
  line: number;
  
  /** Column number in the file */
  column: number;
  
  /** Offset from the start of the file */
  offset?: number;
  
  /** Length of the source text */
  length?: number;
  
  /** Original source text */
  sourceText?: string;
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
 * @remarks Enhanced based on FileSystemCore service lead feedback to 
 * include additional path safety properties.
 */
export interface PathVariable extends BaseVariable<string> {
  type: VariableType.PATH;
  
  /** Whether the path is absolute or relative */
  isAbsolute: boolean;
  
  /** Whether the path has been validated */
  isValidated: boolean;
  
  /** Whether the path is allowed to traverse outside the project root */
  allowTraversal: boolean;
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
// PATH-SPECIFIC TYPES
// =========================================================================

/**
 * Branded types for path handling with validation guarantees.
 * 
 * @remarks Added based on ResolutionCore and FileSystemCore service lead feedback
 * to provide stronger typing for paths and prevent path traversal issues.
 */

/**
 * Represents a raw, unvalidated path string.
 */
export type RawPath = string & { __brand: 'RawPath' };

/**
 * Represents a validated, normalized path that's guaranteed to be safe.
 */
export type ValidatedPath = string & { __brand: 'ValidatedPath' };

/**
 * Represents an absolute path that's been fully resolved.
 */
export type AbsolutePath = ValidatedPath & { __brand: 'AbsolutePath' };

/**
 * Represents a relative path that's been validated but not fully resolved.
 */
export type RelativePath = ValidatedPath & { __brand: 'RelativePath' };

/**
 * Create a raw path from a string.
 */
export const createRawPath = (path: string): RawPath => path as RawPath;

/**
 * Create a validated path from a string.
 * @param path The path to validate
 * @throws {PathValidationError} If the path is invalid
 */
export const createValidatedPath = (path: string): ValidatedPath => {
  // Validation would happen here in the actual implementation
  return path as ValidatedPath;
};

/**
 * Create an absolute path from a validated path.
 * @param path The validated path to convert
 * @throws {PathValidationError} If the path is not absolute
 */
export const createAbsolutePath = (path: ValidatedPath): AbsolutePath => {
  // Validation would happen here in the actual implementation
  return path as AbsolutePath;
};

/**
 * Create a relative path from a validated path.
 * @param path The validated path to convert
 * @throws {PathValidationError} If the path is not relative
 */
export const createRelativePath = (path: ValidatedPath): RelativePath => {
  // Validation would happen here in the actual implementation
  return path as RelativePath;
};

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
// ERROR HANDLING RESULT TYPE
// =========================================================================

/**
 * Generic Result type for non-throwing error handling.
 * 
 * @remarks Added based on ResolutionCore, FileSystemCore, and CoreDirective
 * service lead feedback to enable more explicit error flows without excessive
 * try/catch blocks.
 */
export interface Result<T, E = Error> {
  /** Whether the operation succeeded */
  success: boolean;
  
  /** The value if the operation succeeded */
  value?: T;
  
  /** The error if the operation failed */
  error?: E;
}

/**
 * Create a successful result.
 */
export const success = <T, E = Error>(value: T): Result<T, E> => ({
  success: true,
  value
});

/**
 * Create a failed result.
 */
export const failure = <T, E = Error>(error: E): Result<T, E> => ({
  success: false,
  error
});

// =========================================================================
// STATE STORAGE
// =========================================================================

/**
 * Options for variable copying between states.
 * 
 * @remarks Added based on InterpreterCore service lead feedback to formalize
 * the options used during state variable copying between parent and child states.
 */
export interface VariableCopyOptions {
  /** Whether to copy text variables */
  copyTextVars: boolean;
  
  /** Whether to copy data variables */
  copyDataVars: boolean;
  
  /** Whether to copy path variables */
  copyPathVars: boolean;
  
  /** Whether to copy command variables */
  copyCommandVars: boolean;
  
  /** Whether to overwrite existing variables */
  overwrite: boolean;
  
  /** Filter function to determine which variables to copy */
  filter?: (variable: MeldVariable) => boolean;
  
  /** Transform function to modify variables during copying */
  transform?: (variable: MeldVariable) => MeldVariable;
}

/**
 * Interface for state storage service.
 * 
 * @remarks Enhanced based on feedback from multiple service leads to support
 * transformation, variable inheritance, and comprehensive type safety.
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
  createChildState(options?: Partial<VariableCopyOptions>): IStateService;
  clone(): IStateService;
  getParentState(): IStateService | undefined;
  
  // Copy variables between states
  copyVariablesTo(targetState: IStateService, options?: Partial<VariableCopyOptions>): void;
  copyVariablesFrom(sourceState: IStateService, options?: Partial<VariableCopyOptions>): void;
  
  // Original and transformed nodes
  getOriginalNodes(): MeldNode[];
  getTransformedNodes(): MeldNode[];
  setOriginalNodes(nodes: MeldNode[]): void;
  setTransformedNodes(nodes: MeldNode[]): void;
  transformNode(index: number, replacement: MeldNode | MeldNode[]): void;
  
  // Transformation state
  isTransformationEnabled(): boolean;
  setTransformationEnabled(enabled: boolean): void;
  getTransformationOptions(): TransformationOptions;
  setTransformationOptions(options: TransformationOptions): void;
}

/**
 * Options for controlling transformation behavior.
 * 
 * @remarks Added based on InterpreterCore and StateManagement service lead feedback
 * to formalize transformation options and tracking.
 */
export interface TransformationOptions {
  /** Whether transformation is enabled */
  enabled: boolean;
  
  /** Types of directives to transform */
  directiveTypes?: string[];
  
  /** Whether to preserve original nodes */
  preserveOriginal: boolean;
  
  /** Whether to transform nested content */
  transformNested: boolean;
}

/**
 * Node replacement result from directive handlers.
 * 
 * @remarks Added based on InterpreterCore service lead feedback to formalize
 * the directive handler replacement pattern.
 */
export interface DirectiveReplacement {
  /** Nodes to replace the directive with */
  nodes: MeldNode[];
  
  /** Whether the replacement should be transformed */
  shouldTransform: boolean;
  
  /** Whether to include the replacement in the output */
  includeInOutput: boolean;
  
  /** Metadata about the replacement */
  metadata?: Record<string, unknown>;
}

// =========================================================================
// VARIABLE RESOLUTION
// =========================================================================

/**
 * Context passed during variable resolution.
 * 
 * @remarks Enhanced based on feedback from multiple service leads to support
 * more comprehensive context flags and immutable context manipulation.
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
  
  /** Path resolution context for path handling */
  readonly pathContext?: PathResolutionContext;
  
  /** Parser-specific flags */
  readonly parserFlags?: ParserFlags;
  
  /** Create a new context with increased depth */
  withIncreasedDepth(): ResolutionContext;
  
  /** Create a new context with different strictness */
  withStrictMode(strict: boolean): ResolutionContext;
  
  /** Create a new context with specific allowed variable types */
  withAllowedTypes(types: VariableType[]): ResolutionContext;
  
  /** Create a new context with additional flags */
  withFlags(flags: Partial<ResolutionFlags>): ResolutionContext;
  
  /** Create a new context with formatting context */
  withFormattingContext(formatting: Partial<FormattingContext>): ResolutionContext;
  
  /** Create a new context with path context */
  withPathContext(pathContext: Partial<PathResolutionContext>): ResolutionContext;
  
  /** Create a new context with parser flags */
  withParserFlags(flags: Partial<ParserFlags>): ResolutionContext;
}

/**
 * Flags that modify variable resolution behavior.
 * 
 * @remarks Enhanced based on feedback from multiple service leads to support
 * more comprehensive flags for controlling resolution behavior.
 */
export interface ResolutionFlags {
  /** Disable path prefixing for variable embedding */
  isVariableEmbed: boolean;
  
  /** Enable transformation mode */
  isTransformation: boolean;
  
  /** Allow resolution in raw content (pre-parsing) */
  allowRawContentResolution: boolean;
  
  /** Whether we're in a directive handler */
  isDirectiveHandler: boolean;
  
  /** Whether we're in an import context */
  isImportContext: boolean;
  
  /** Whether to process nested variables */
  processNestedVariables: boolean;
}

/**
 * Context for formatting resolved variable values.
 * 
 * @remarks Enhanced based on feedback from multiple service leads to support
 * more comprehensive formatting options.
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
  
  /** Whether to preserve literal output formatting */
  preserveLiteralFormatting: boolean;
  
  /** Whether to preserve whitespace */
  preserveWhitespace: boolean;
  
  /** Context about surrounding content */
  surroundingContent?: {
    before?: string;
    after?: string;
  };
  
  /** Document formatting settings */
  documentSettings?: DocumentFormattingSettings;
}

/**
 * Document-level formatting settings.
 * 
 * @remarks Added based on ContentResolution service lead feedback to help
 * maintain document formatting during resolution.
 */
export interface DocumentFormattingSettings {
  /** Line ending style */
  lineEnding: 'lf' | 'crlf';
  
  /** Indentation style */
  indentation: 'spaces' | 'tabs';
  
  /** Indentation size */
  indentSize: number;
}

/**
 * Context for path resolution operations.
 * 
 * @remarks Added based on ResolutionCore, FileSystemCore, and CoreDirective
 * service lead feedback to strengthen path handling security.
 */
export interface PathResolutionContext {
  /** Base directory for relative path resolution */
  baseDir: string;
  
  /** Whether to allow traversal outside the project root */
  allowTraversal: boolean;
  
  /** Purpose of the path resolution for validation */
  purpose: PathPurpose;
  
  /** Additional validation constraints */
  constraints?: PathConstraints;
}

/**
 * Purpose of path resolution for validation.
 */
export enum PathPurpose {
  READ = 'read',
  WRITE = 'write',
  EXECUTE = 'execute',
  IMPORT = 'import',
  EMBED = 'embed'
}

/**
 * Additional constraints for path validation.
 */
export interface PathConstraints {
  /** Allowed file extensions */
  allowedExtensions?: string[];
  
  /** Allowed path patterns */
  allowedPatterns?: RegExp[];
  
  /** Denied path patterns */
  deniedPatterns?: RegExp[];
  
  /** Whether to require the file to exist */
  mustExist?: boolean;
}

/**
 * Parser-specific flags for resolution context.
 * 
 * @remarks Added based on ParserCore service lead feedback to support
 * parser-specific resolution needs.
 */
export interface ParserFlags {
  /** Whether to parse variable references in raw content */
  parseInRawContent: boolean;
  
  /** Whether to parse variable references in code blocks */
  parseInCodeBlocks: boolean;
  
  /** Whether to resolve variables during parsing */
  resolveVariablesDuringParsing: boolean;
  
  /** Types of literals to parse */
  parseLiteralTypes: StringLiteralType[];
}

/**
 * Types of string literals to parse.
 * 
 * @remarks Added based on ContentResolution service lead feedback to support
 * string literal validation and parsing.
 */
export enum StringLiteralType {
  SINGLE_QUOTE = 'single',
  DOUBLE_QUOTE = 'double',
  BACKTICK = 'backtick'
}

// =========================================================================
// VARIABLE REFERENCES AND FIELD ACCESS
// =========================================================================

/**
 * Variable reference node from parsing {{var}} or {{var.field}} syntax.
 * 
 * @remarks Enhanced based on ParserCore service lead feedback to support
 * more detailed variable reference parsing.
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
  
  /** Source location of the reference */
  location?: SourceLocation;
  
  /** Raw text of the reference */
  rawText?: string;
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
  
  /** Source location of the field access */
  location?: SourceLocation;
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
  ): Result<JsonValue, FieldAccessError>;
  
  /**
   * Convert a resolved value to string based on formatting context.
   */
  convertToString(
    value: JsonValue,
    context: ResolutionContext
  ): string;
  
  /**
   * Parse a string for variable references.
   */
  parseVariableReferences(
    content: string,
    context?: ResolutionContext
  ): Array<TextNode | VariableReferenceNode>;
}

/**
 * Represents a text node from parsing variable references.
 */
export interface TextNode {
  /** Type discriminant */
  type: 'text';
  
  /** Text content */
  text: string;
  
  /** Source location of the text */
  location?: SourceLocation;
}

/**
 * Unified type for content nodes that can contain variable references.
 * 
 * @remarks Added based on ContentResolution service lead feedback to unify
 * different node types for processing.
 */
export type ContentNode = 
  | TextNode
  | CodeFenceNode
  | HeadingNode;

/**
 * Represents a code fence node.
 */
export interface CodeFenceNode {
  /** Type discriminant */
  type: 'code-fence';
  
  /** Language of the code fence */
  language?: string;
  
  /** Content of the code fence */
  content: string;
  
  /** Source location of the code fence */
  location?: SourceLocation;
}

/**
 * Represents a heading node.
 */
export interface HeadingNode {
  /** Type discriminant */
  type: 'heading';
  
  /** Level of the heading (1-6) */
  level: number;
  
  /** Content of the heading */
  content: string;
  
  /** Source location of the heading */
  location?: SourceLocation;
}

// =========================================================================
// DEPENDENCY STATE MANAGEMENT
// =========================================================================

/**
 * States for managing dependency initialization.
 * 
 * @remarks Added based on ResolutionCore and FileSystemCore service lead feedback
 * to clarify the lifecycle of service dependencies.
 */
export enum DependencyState {
  UNINITIALIZED = 'uninitialized',
  INITIALIZING = 'initializing',
  INITIALIZED = 'initialized',
  FAILED = 'failed'
}

/**
 * Interface for tracking dependency initialization state.
 */
export interface IDependencyStateTracker {
  /** Get the current state of a dependency */
  getState(dependencyName: string): DependencyState;
  
  /** Set the state of a dependency */
  setState(dependencyName: string, state: DependencyState): void;
  
  /** Check if all dependencies are initialized */
  allInitialized(): boolean;
  
  /** Get all dependencies in a specific state */
  getDependenciesInState(state: DependencyState): string[];
  
  /** Get initialization errors for dependencies */
  getErrors(): Record<string, Error>;
  
  /** Set an error for a dependency */
  setError(dependencyName: string, error: Error): void;
}

// =========================================================================
// TYPE GUARDS
// =========================================================================

/**
 * Type guard functions for runtime type checking.
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

export const isResult = <T, E>(value: any): value is Result<T, E> =>
  value !== null && 
  typeof value === 'object' && 
  'success' in value;

export const isTextNode = (node: any): node is TextNode =>
  node && node.type === 'text';

export const isVariableReferenceNode = (node: any): node is VariableReferenceNode =>
  node && node.type === 'variable-reference';

export const isCodeFenceNode = (node: any): node is CodeFenceNode =>
  node && node.type === 'code-fence';

export const isHeadingNode = (node: any): node is HeadingNode =>
  node && node.type === 'heading';

export const isContentNode = (node: any): node is ContentNode =>
  isTextNode(node) || isCodeFenceNode(node) || isHeadingNode(node);

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

export const createPathVariable = (
  name: string,
  value: string,
  isAbsolute: boolean,
  metadata?: Partial<VariableMetadata>
): PathVariable => ({
  type: VariableType.PATH,
  name,
  value,
  isAbsolute,
  isValidated: false,
  allowTraversal: false,
  metadata: {
    createdAt: Date.now(),
    modifiedAt: Date.now(),
    origin: VariableOrigin.DIRECT_DEFINITION,
    ...metadata
  }
});

export const createCommandVariable = (
  name: string,
  value: CommandDefinition,
  metadata?: Partial<VariableMetadata>
): CommandVariable => ({
  type: VariableType.COMMAND,
  name,
  value,
  metadata: {
    createdAt: Date.now(),
    modifiedAt: Date.now(),
    origin: VariableOrigin.DIRECT_DEFINITION,
    ...metadata
  }
});

/**
 * Create a resolution context with default values.
 */
export const createResolutionContext = (
  state: IStateService,
  options?: Partial<{
    strict: boolean;
    depth: number;
    allowedVariableTypes: VariableType[];
    flags: Partial<ResolutionFlags>;
    formattingContext: Partial<FormattingContext>;
    pathContext: Partial<PathResolutionContext>;
    parserFlags: Partial<ParserFlags>;
  }>
): ResolutionContext => {
  const defaultFlags: ResolutionFlags = {
    isVariableEmbed: false,
    isTransformation: false,
    allowRawContentResolution: false,
    isDirectiveHandler: false,
    isImportContext: false,
    processNestedVariables: true
  };

  const defaultFormattingContext: FormattingContext = {
    isBlock: false,
    preserveLiteralFormatting: false,
    preserveWhitespace: false
  };

  const defaultPathContext: PathResolutionContext = {
    baseDir: '.',
    allowTraversal: false,
    purpose: PathPurpose.READ
  };

  const defaultParserFlags: ParserFlags = {
    parseInRawContent: false,
    parseInCodeBlocks: false,
    resolveVariablesDuringParsing: false,
    parseLiteralTypes: [
      StringLiteralType.DOUBLE_QUOTE,
      StringLiteralType.SINGLE_QUOTE,
      StringLiteralType.BACKTICK
    ]
  };

  const context: ResolutionContext = {
    state,
    strict: options?.strict ?? false,
    depth: options?.depth ?? 0,
    allowedVariableTypes: options?.allowedVariableTypes,
    flags: { ...defaultFlags, ...options?.flags },
    formattingContext: options?.formattingContext 
      ? { ...defaultFormattingContext, ...options.formattingContext }
      : undefined,
    pathContext: options?.pathContext
      ? { ...defaultPathContext, ...options.pathContext }
      : undefined,
    parserFlags: options?.parserFlags
      ? { ...defaultParserFlags, ...options.parserFlags }
      : undefined,

    withIncreasedDepth() {
      return createResolutionContext(state, {
        ...options,
        depth: (options?.depth ?? 0) + 1
      });
    },

    withStrictMode(strict: boolean) {
      return createResolutionContext(state, {
        ...options,
        strict
      });
    },

    withAllowedTypes(types: VariableType[]) {
      return createResolutionContext(state, {
        ...options,
        allowedVariableTypes: types
      });
    },

    withFlags(flags: Partial<ResolutionFlags>) {
      return createResolutionContext(state, {
        ...options,
        flags: { ...this.flags, ...flags }
      });
    },

    withFormattingContext(formatting: Partial<FormattingContext>) {
      return createResolutionContext(state, {
        ...options,
        formattingContext: { 
          ...(this.formattingContext || defaultFormattingContext), 
          ...formatting 
        }
      });
    },

    withPathContext(pathContext: Partial<PathResolutionContext>) {
      return createResolutionContext(state, {
        ...options,
        pathContext: { 
          ...(this.pathContext || defaultPathContext), 
          ...pathContext 
        }
      });
    },

    withParserFlags(flags: Partial<ParserFlags>) {
      return createResolutionContext(state, {
        ...options,
        parserFlags: { 
          ...(this.parserFlags || defaultParserFlags), 
          ...flags 
        }
      });
    }
  };

  return context;
};

/**
 * Builder for creating field access paths.
 */
export class FieldAccessBuilder {
  private fields: FieldAccess[] = [];
  
  /**
   * Add a property access.
   */
  property(name: string, location?: SourceLocation): FieldAccessBuilder {
    this.fields.push({
      type: FieldAccessType.PROPERTY,
      key: name,
      location
    });
    return this;
  }
  
  /**
   * Add an array index access.
   */
  index(idx: number, location?: SourceLocation): FieldAccessBuilder {
    this.fields.push({
      type: FieldAccessType.INDEX,
      key: idx,
      location
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

/**
 * Error thrown when path validation fails.
 */
export class PathValidationError extends Error {
  constructor(
    message: string,
    public readonly path: string,
    public readonly context?: PathResolutionContext
  ) {
    super(message);
    this.name = 'PathValidationError';
  }
}

/**
 * Error thrown when a circular dependency is detected.
 */
export class CircularDependencyError extends Error {
  constructor(
    message: string,
    public readonly dependencyChain: string[]
  ) {
    super(message);
    this.name = 'CircularDependencyError';
  }
}

/**
 * Error thrown when variable parsing fails.
 */
export class VariableParseError extends Error {
  constructor(
    message: string,
    public readonly content: string,
    public readonly position: number,
    public readonly context?: ResolutionContext
  ) {
    super(message);
    this.name = 'VariableParseError';
  }
}
```