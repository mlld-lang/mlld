```typescript
/**
 * Meld Path & Import Type System
 * 
 * This module defines the core types for path handling, file content, and import operations
 * within the Meld system. It provides compile-time safety through branded types while
 * maintaining runtime efficiency and clear semantics.
 * 
 * Key features:
 * - Branded path types with discriminated unions for compile-time safety
 * - Structured content representation with metadata for debugging and error reporting
 * - Comprehensive import handling with selective imports and definition tracking
 * - DI-friendly client interfaces following the Client Factory Pattern
 * - Standardized error handling through discriminated unions
 */

/**
 * Path Types - Core branded types for compile-time path safety
 * -------------------------------------------------------------
 */

/**
 * Base branded type for all path types
 * @internal
 */
declare const PathBrand: unique symbol;

/**
 * Base interface for all path types
 * @remarks Provides a common structure for all path types while preserving type safety
 */
export interface BasePath {
  readonly [PathBrand]: string;
  readonly value: string;
}

/**
 * Discriminated path type for normalized absolute file paths
 * @remarks 
 * Uses branded typing for compile-time safety while maintaining string compatibility
 * @validation Requires runtime validation for path security (no null bytes, valid characters)
 */
export interface NormalizedAbsoluteFilePath extends BasePath {
  readonly [PathBrand]: 'NormalizedAbsoluteFilePath';
  readonly isAbsolute: true;
  readonly isNormalized: true;
  readonly isDirectory: false;
}

/**
 * Discriminated path type for normalized absolute directory paths
 * @validation Requires runtime validation to ensure path ends with a directory separator
 */
export interface NormalizedAbsoluteDirectoryPath extends BasePath {
  readonly [PathBrand]: 'NormalizedAbsoluteDirectoryPath';
  readonly isAbsolute: true;
  readonly isNormalized: true;
  readonly isDirectory: true;
}

/**
 * Discriminated path type for normalized relative file paths
 * @validation Requires runtime validation to prevent directory traversal attacks
 */
export interface NormalizedRelativeFilePath extends BasePath {
  readonly [PathBrand]: 'NormalizedRelativeFilePath';
  readonly isAbsolute: false;
  readonly isNormalized: true;
  readonly isDirectory: false;
}

/**
 * Discriminated path type for normalized relative directory paths
 * @validation Requires runtime validation to ensure path ends with a directory separator
 */
export interface NormalizedRelativeDirectoryPath extends BasePath {
  readonly [PathBrand]: 'NormalizedRelativeDirectoryPath';
  readonly isAbsolute: false;
  readonly isNormalized: true;
  readonly isDirectory: true;
}

/**
 * Raw (non-normalized) path types that still need processing
 * @decision Raw paths are included to distinguish between validated/normalized paths
 *           and paths that still need processing, improving type safety
 */
export interface RawFilePath extends BasePath {
  readonly [PathBrand]: 'RawFilePath';
  readonly isNormalized: false;
  readonly isDirectory: false;
}

export interface RawDirectoryPath extends BasePath {
  readonly [PathBrand]: 'RawDirectoryPath';
  readonly isNormalized: false;
  readonly isDirectory: true;
}

/**
 * Union type for all normalized path types
 */
export type NormalizedPath = 
  | NormalizedAbsoluteFilePath 
  | NormalizedAbsoluteDirectoryPath
  | NormalizedRelativeFilePath
  | NormalizedRelativeDirectoryPath;

/**
 * Union type for all raw path types
 */
export type RawPath = RawFilePath | RawDirectoryPath;

/**
 * Union type for all possible path types
 */
export type MeldPath = NormalizedPath | RawPath;

/**
 * Union type for all file path types
 */
export type FilePath = NormalizedAbsoluteFilePath | NormalizedRelativeFilePath | RawFilePath;

/**
 * Union type for all directory path types
 */
export type DirectoryPath = 
  | NormalizedAbsoluteDirectoryPath 
  | NormalizedRelativeDirectoryPath 
  | RawDirectoryPath;

/**
 * Structured path representation for complex path operations
 * @remarks Provides a more detailed view of a path for operations that need path components
 * @decision Included alongside branded string paths to support both simple string operations
 *           and more complex path manipulations without conversion overhead
 */
export interface StructuredPath {
  /** Individual path segments without separators */
  readonly segments: readonly string[];
  /** Map of path variables used in this path */
  readonly variables?: Readonly<Record<string, string>>;
  /** Whether this path is absolute */
  readonly isAbsolute: boolean;
  /** Whether this path has been normalized */
  readonly isNormalized: boolean;
  /** Whether this path points to a directory */
  readonly isDirectory: boolean;
  /** Original string representation */
  readonly original: string;
  /** Normalized string representation (if normalized) */
  readonly normalized?: string;
  /** 
   * Path variable references contained in this path
   * @remarks Added based on PathService feedback to support Meld's path variable system
   */
  readonly pathVariableRefs?: readonly string[];
}

/**
 * Context for validating paths
 * @remarks Added based on PathService feedback to simplify validation logic
 */
export interface PathValidationContext {
  /** Current working directory for resolving relative paths */
  readonly workingDirectory: NormalizedAbsoluteDirectoryPath;
  /** Root directory of the project for security boundary enforcement */
  readonly projectRoot?: NormalizedAbsoluteDirectoryPath;
  /** Additional allowed roots beyond the project root */
  readonly allowedRoots?: readonly NormalizedAbsoluteDirectoryPath[];
  /** Whether to allow paths outside allowed roots */
  readonly allowExternalPaths: boolean;
  /** Validation rules to apply */
  readonly rules: PathValidationRules;
}

/**
 * File Content Types - Representing file content with metadata
 * -----------------------------------------------------------
 */

/**
 * Base interface for all file content
 * @remarks Provides common metadata for all file content types
 */
export interface FileContent {
  /** Raw content of the file */
  readonly content: string | Buffer;
  /** Path to the file */
  readonly path: NormalizedAbsoluteFilePath;
  /** Encoding used for the file */
  readonly encoding: string;
  /** Size of the file in bytes */
  readonly size: number;
  /** Last modified timestamp */
  readonly lastModified: Date;
  /** Content type (MIME type) if known */
  readonly contentType?: string;
  /** Whether the content has been validated */
  readonly isValidated: boolean;
  /** 
   * Source code fragment for error reporting
   * @remarks Added based on ParserCore feedback to improve error reporting
   */
  readonly sourceFragment?: string;
}

/**
 * Specialized interface for Meld file content
 * @remarks Contains parsed Meld content with AST
 */
export interface MeldFileContent extends FileContent {
  /** Parsed AST nodes from the Meld file */
  readonly nodes: readonly MeldNode[]; // Using actual MeldNode type from meld-ast
  /** Content type is always text/meld */
  readonly contentType: 'text/meld';
}

/**
 * Specialized interface for structured data content
 * @remarks Contains parsed structured data (JSON, YAML, etc.)
 */
export interface DataFileContent<T = unknown> extends FileContent {
  /** Parsed data object */
  readonly data: T;
  /** Format of the data (json, yaml, etc.) */
  readonly format: 'json' | 'yaml' | 'toml' | string;
}

/**
 * Import Types - Representing import operations and results
 * --------------------------------------------------------
 */

/**
 * Types of importable definitions
 */
export enum ImportDefinitionType {
  TEXT = 'text',
  DATA = 'data',
  PATH = 'path',
  COMMAND = 'command',
  ALL = 'all'
}

/**
 * Represents a single definition to import
 * @remarks Used for selective imports with optional aliasing
 */
export interface ImportDefinition {
  /** Original name of the definition in the source file */
  readonly name: string;
  /** Type of the definition */
  readonly type: ImportDefinitionType;
  /** Alias to use when importing (if different from name) */
  readonly alias?: string;
  /** Whether this is a path variable (starts with $) */
  readonly isPathVariable: boolean;
}

/**
 * Result of a successful import operation
 */
export interface ImportResult {
  /** Path to the imported file */
  readonly path: NormalizedAbsoluteFilePath;
  /** Definitions imported from the file */
  readonly definitions: ReadonlyArray<{
    /** Name of the imported definition */
    readonly name: string;
    /** Type of the definition */
    readonly type: ImportDefinitionType;
    /** Alias used for the definition (if any) */
    readonly alias?: string;
    /** Whether the import overwrote an existing definition */
    readonly didOverwrite: boolean;
  }>;
  /** Import chain leading to this import (for circular detection) */
  readonly importChain: readonly NormalizedAbsoluteFilePath[];
  /** Timestamp when the import was performed */
  readonly timestamp: Date;
  /**
   * State changes resulting from this import
   * @remarks Added based on InterpreterCore feedback to track state propagation
   */
  readonly stateChanges?: ImportStateChanges;
}

/**
 * State changes resulting from an import operation
 * @remarks Added based on InterpreterCore feedback to clarify state propagation during imports
 */
export interface ImportStateChanges {
  /** Text variables imported */
  readonly textVariables: ReadonlyArray<{ name: string, originalName: string }>;
  /** Data variables imported */
  readonly dataVariables: ReadonlyArray<{ name: string, originalName: string }>;
  /** Path variables imported */
  readonly pathVariables: ReadonlyArray<{ name: string, originalName: string }>;
  /** Commands imported */
  readonly commands: ReadonlyArray<{ name: string, originalName: string }>;
}

/**
 * Result of processing an import directive
 * @remarks Added based on InterpreterCore feedback to clarify the contract between services
 */
export interface ImportDirectiveResult {
  /** Result of the import operation */
  readonly importResult: ImportResult;
  /** Replacement nodes for transformation mode */
  readonly replacementNodes?: readonly MeldNode[];
  /** Whether the import was successful */
  readonly success: boolean;
  /** Error information if the import failed */
  readonly error?: ImportError;
}

/**
 * Error types that can occur during import operations
 * @decision Using discriminated union for comprehensive error handling
 */
export type ImportError = 
  | { type: 'FILE_NOT_FOUND'; path: string; message: string }
  | { type: 'CIRCULAR_IMPORT'; cycle: string[]; message: string }
  | { type: 'PARSE_ERROR'; path: string; message: string; line?: number; column?: number; sourceFragment?: string }
  | { type: 'VALIDATION_ERROR'; path: string; message: string }
  | { type: 'DEFINITION_NOT_FOUND'; name: string; type: ImportDefinitionType; message: string }
  | { type: 'SECURITY_ERROR'; path: string; message: string }
  | { type: 'UNKNOWN_ERROR'; message: string; originalError?: unknown };

/**
 * General file operation error type
 * @remarks Added based on FileSystemCore feedback to standardize error handling
 */
export type FileOperationError =
  | { type: 'FILE_NOT_FOUND'; path: string; message: string }
  | { type: 'PERMISSION_DENIED'; path: string; message: string }
  | { type: 'PATH_VALIDATION_ERROR'; path: string; message: string; validationContext?: PathValidationContext }
  | { type: 'IO_ERROR'; path: string; message: string; originalError?: unknown }
  | { type: 'ENCODING_ERROR'; path: string; message: string; encoding: string }
  | { type: 'UNKNOWN_ERROR'; message: string; originalError?: unknown };

/**
 * Source Location Context - For error reporting and debugging
 * ----------------------------------------------------------
 */

/**
 * Represents a location in a source file
 * @remarks Used for error reporting and debugging
 */
export interface SourceLocation {
  /** Path to the source file */
  readonly path: NormalizedAbsoluteFilePath;
  /** Line number (1-based) */
  readonly line: number;
  /** Column number (1-based) */
  readonly column: number;
  /** Offset in characters from the start of the file (0-based) */
  readonly offset: number;
  /** Length of the relevant segment in characters */
  readonly length: number;
  /** 
   * Source code fragment for error reporting
   * @remarks Added based on ParserCore feedback to improve error reporting
   */
  readonly sourceFragment?: string;
}

/**
 * Context for file operations
 * @remarks Provides context for file operations for tracing and debugging
 */
export interface FileOperationContext {
  /** Unique identifier for this operation */
  readonly id: string;
  /** Type of operation being performed */
  readonly operation: 'read' | 'write' | 'import' | 'parse' | 'validate';
  /** Path being operated on */
  readonly path: MeldPath;
  /** Parent operation context (if this is a nested operation) */
  readonly parent?: FileOperationContext;
  /** Timestamp when the operation started */
  readonly startTime: Date;
  /** Additional operation-specific metadata */
  readonly metadata?: Record<string, unknown>;
  /** 
   * Cancellation token for the operation
   * @remarks Added based on FileSystemCore feedback to support operation cancellation
   */
  readonly cancellationToken?: CancellationToken;
  /**
   * Whether this operation is part of a transformation
   * @remarks Added based on ResolutionCore feedback to support transformation mode
   */
  readonly isTransformation?: boolean;
  /**
   * Root context that initiated this operation chain
   * @remarks Added based on ResolutionCore feedback to improve context propagation
   */
  readonly rootContext?: FileOperationContext;
}

/**
 * Cancellation token for file operations
 * @remarks Added based on FileSystemCore feedback to support operation cancellation
 */
export interface CancellationToken {
  /** Whether the operation has been cancelled */
  readonly isCancelled: boolean;
  /** Cancel the operation */
  cancel(): void;
  /** Register a callback to be called when the operation is cancelled */
  onCancelled(callback: () => void): void;
}

/**
 * Context for transformation operations
 * @remarks Added based on InterpreterCore feedback to support transformation-specific properties
 */
export interface TransformationContext extends FileOperationContext {
  /** Type of transformation being performed */
  readonly transformationType: 'import' | 'embed' | 'variable' | 'command';
  /** Whether to transform directive definitions */
  readonly transformDefinitions: boolean;
  /** Whether to transform directive executions */
  readonly transformExecutions: boolean;
  /** Original nodes before transformation */
  readonly originalNodes: readonly MeldNode[];
  /** Current transformation depth */
  readonly depth: number;
  /** Maximum allowed transformation depth */
  readonly maxDepth: number;
}

/**
 * Registry of resolved sources during a processing session
 * @remarks Added based on CoreDirective feedback to track all resolved sources
 */
export interface SourceRegistry {
  /** All sources resolved during this session */
  readonly sources: ReadonlyMap<string, FileContent>;
  /** Add a source to the registry */
  addSource(path: NormalizedAbsoluteFilePath, content: FileContent): void;
  /** Get a source from the registry */
  getSource(path: NormalizedAbsoluteFilePath): FileContent | undefined;
  /** Check if a source exists in the registry */
  hasSource(path: NormalizedAbsoluteFilePath): boolean;
  /** Get all sources in the registry */
  getAllSources(): ReadonlyMap<string, FileContent>;
  /** Clear the registry */
  clear(): void;
}

/**
 * Cache for resolved imports
 * @remarks Added based on ResolutionCore feedback to support caching of resolved imports
 */
export interface ImportCache {
  /** Get a cached import result */
  get(path: NormalizedAbsoluteFilePath): ImportResult | undefined;
  /** Set a cached import result */
  set(path: NormalizedAbsoluteFilePath, result: ImportResult): void;
  /** Check if an import is cached */
  has(path: NormalizedAbsoluteFilePath): boolean;
  /** Invalidate a cached import */
  invalidate(path: NormalizedAbsoluteFilePath): void;
  /** Clear the cache */
  clear(): void;
}

/**
 * State Merging and Validation - For import operations
 * ---------------------------------------------------
 */

/**
 * Options for merging state during imports
 */
export interface StateMergeOptions {
  /** Definitions to import (if selective import) */
  readonly definitions?: readonly ImportDefinition[];
  /** Whether to overwrite existing definitions */
  readonly overwrite: boolean;
  /** Whether to validate definitions before merging */
  readonly validate: boolean;
  /** Optional validation rules */
  readonly validationRules?: PathValidationRules;
}

/**
 * Rules for validating paths
 * @decision Structured validation rules improve security and maintainability
 */
export interface PathValidationRules {
  /** Whether to allow absolute paths */
  readonly allowAbsolute: boolean;
  /** Whether to allow relative paths */
  readonly allowRelative: boolean;
  /** Whether to allow parent directory traversal (../) */
  readonly allowParentTraversal: boolean;
  /** Maximum path length in characters */
  readonly maxLength?: number;
  /** Allowed path prefixes (if restricted) */
  readonly allowedPrefixes?: readonly string[];
  /** Disallowed path prefixes */
  readonly disallowedPrefixes?: readonly string[];
  /** Regular expression pattern that paths must match */
  readonly pattern?: RegExp;
}

/**
 * Configuration for parser operations
 * @remarks Added based on ParserCore feedback to support parser configuration
 */
export interface ParserConfiguration {
  /** Whether to include source locations in parsed nodes */
  readonly includeSourceLocations: boolean;
  /** Whether to validate nodes during parsing */
  readonly validateNodes: boolean;
  /** Whether to resolve variables during parsing */
  readonly resolveVariables: boolean;
  /** Maximum nesting depth for directives */
  readonly maxDirectiveNestingDepth?: number;
  /** Custom directive handlers */
  readonly customDirectiveHandlers?: Record<string, unknown>;
}

/**
 * Factory Functions - For creating path and content objects
 * --------------------------------------------------------
 */

/**
 * Factory function type for creating absolute file paths
 * @validation Must validate path is absolute and points to a file
 */
export type CreateAbsoluteFilePath = (
  path: string, 
  options?: { normalize?: boolean; validationContext?: PathValidationContext }
) => NormalizedAbsoluteFilePath | RawFilePath;

/**
 * Factory function type for creating absolute directory paths
 * @validation Must validate path is absolute and points to a directory
 */
export type CreateAbsoluteDirectoryPath = (
  path: string, 
  options?: { normalize?: boolean; validationContext?: PathValidationContext }
) => NormalizedAbsoluteDirectoryPath | RawDirectoryPath;

/**
 * Factory function type for creating relative file paths
 * @validation Must validate path is relative and points to a file
 */
export type CreateRelativeFilePath = (
  path: string, 
  options?: { normalize?: boolean; validationContext?: PathValidationContext }
) => NormalizedRelativeFilePath | RawFilePath;

/**
 * Factory function type for creating relative directory paths
 * @validation Must validate path is relative and points to a directory
 */
export type CreateRelativeDirectoryPath = (
  path: string, 
  options?: { normalize?: boolean; validationContext?: PathValidationContext }
) => NormalizedRelativeDirectoryPath | RawDirectoryPath;

/**
 * Factory function type for creating file content objects
 */
export type CreateFileContent = (
  content: string | Buffer,
  path: NormalizedAbsoluteFilePath,
  options?: {
    encoding?: string;
    contentType?: string;
    lastModified?: Date;
    validate?: boolean;
    sourceFragment?: string;
  }
) => FileContent;

/**
 * Factory function type for creating Meld file content objects
 */
export type CreateMeldFileContent = (
  content: string,
  path: NormalizedAbsoluteFilePath,
  nodes: MeldNode[], // Using actual MeldNode type
  options?: {
    encoding?: string;
    lastModified?: Date;
    validate?: boolean;
    sourceFragment?: string;
  }
) => MeldFileContent;

/**
 * Factory function type for creating data file content objects
 */
export type CreateDataFileContent = <T>(
  content: string | Buffer,
  path: NormalizedAbsoluteFilePath,
  data: T,
  format: 'json' | 'yaml' | 'toml' | string,
  options?: {
    encoding?: string;
    lastModified?: Date;
    validate?: boolean;
    sourceFragment?: string;
  }
) => DataFileContent<T>;

/**
 * Simple path utilities interface
 * @remarks Added based on CoreDirective feedback for common operations without full client instantiation
 */
export interface PathUtils {
  /** Normalize a path */
  normalize(path: string): string;
  /** Check if a path is absolute */
  isAbsolute(path: string): boolean;
  /** Join path segments */
  join(...paths: string[]): string;
  /** Resolve a path */
  resolve(...paths: string[]): string;
  /** Get the directory name of a path */
  dirname(path: string): string;
  /** Get the base name of a path */
  basename(path: string): string;
  /** Get the extension of a path */
  extname(path: string): string;
}

/**
 * Client Interfaces - For DI Client Factory Pattern integration
 * ------------------------------------------------------------
 */

/**
 * Client interface for file system operations
 * @remarks Designed for the Client Factory Pattern to avoid circular dependencies
 * @decision Follows the established Client Factory pattern for DI integration
 */
export interface IFileSystemClient {
  /** Read a file */
  readFile(path: MeldPath): Promise<FileContent>;
  /** Check if a file exists */
  fileExists(path: MeldPath): Promise<boolean>;
  /** Check if a path is a directory */
  isDirectory(path: MeldPath): Promise<boolean>;
  /** Resolve a path to an absolute path */
  resolvePath(path: string): NormalizedAbsoluteFilePath;
  /** 
   * Create a directory
   * @remarks Added based on FileSystemCore feedback to complete the abstraction
   */
  createDirectory(path: MeldPath): Promise<void>;
  /** 
   * List directory contents
   * @remarks Added based on FileSystemCore feedback to complete the abstraction
   */
  listDirectory(path: MeldPath): Promise<string[]>;
  /**
   * Write to a file
   * @remarks Added based on FileSystemCore feedback to complete the abstraction
   */
  writeFile(path: MeldPath, content: string | Buffer, options?: { encoding?: string }): Promise<void>;
}

/**
 * Client interface for path operations
 * @remarks Designed for the Client Factory Pattern to avoid circular dependencies
 */
export interface IPathClient {
  /** Normalize a path */
  normalize(path: string): string;
  /** Check if a path is absolute */
  isAbsolute(path: string): boolean;
  /** Join path segments */
  join(...paths: string[]): string;
  /** Resolve a path */
  resolve(...paths: string[]): string;
  /** Get the directory name of a path */
  dirname(path: string): string;
  /** Get the base name of a path */
  basename(path: string): string;
  /** Get the extension of a path */
  extname(path: string): string;
  /** Validate a path */
  validatePath(path: string, context: PathValidationContext): boolean;
  /** Create a structured path */
  toStructuredPath(path: string): StructuredPath;
  /** Convert a structured path to a string */
  fromStructuredPath(path: StructuredPath): string;
}

/**
 * Client interface for import operations
 * @remarks Designed for the Client Factory Pattern to avoid circular dependencies
 */
export interface IImportClient {
  /** Import a file */
  importFile(
    path: MeldPath, 
    options?: { 
      definitions?: ImportDefinition[]; 
      overwrite?: boolean;
      context?: FileOperationContext;
    }
  ): Promise<ImportResult>;
  
  /** Resolve an import path */
  resolveImport(path: string): Promise<NormalizedAbsoluteFilePath>;
  
  /** Check if an import would create a circular dependency */
  wouldCreateCircularDependency(path: NormalizedAbsoluteFilePath, importChain: readonly NormalizedAbsoluteFilePath[]): boolean;
}

/**
 * Client interface for variable reference resolution
 * @remarks Added to support the client factory pattern for variable resolution
 */
export interface IVariableReferenceResolverClient {
  /** Resolve variable references in a string */
  resolveReferences(text: string, context?: FileOperationContext): string;
  
  /** Access fields in an object using dot notation */
  accessFields(obj: unknown, path: string): unknown;
  
  /** Convert a value to a string */
  convertToString(value: unknown): string;
}

/**
 * Placeholder for MeldNode type from meld-ast
 * @remarks This should be replaced with the actual MeldNode type from meld-ast
 */
export interface MeldNode {
  type: string;
  [key: string]: unknown;
}
```