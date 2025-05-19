/**
 * Shared service types with no circular dependencies
 * 
 * This file defines common interface types used across services to break circular dependencies.
 * It contains only types with no direct imports from service implementation files.
 * 
 * IMPORTANT: This file must NOT import from any service implementation files to avoid circular dependencies.
 */

import type { NodeType } from './syntax/types/shared-types';
import type { MeldNode, DirectiveNode, TextNode, BaseNode } from './ast/types/index';
import type { ResolutionContextBase, DirectiveContextBase } from './shared/types';
// Import the actual variable types
import type {
  TextVariable,
  DataVariable,
  IPathVariable,
  CommandVariable,
  JsonValue,
  IFilesystemPathState,
  IUrlPathState,
  ICommandDefinition,
  MeldPath
} from './types/index';

// Imports needed for base service interfaces defined below
// These are OK because they import concrete types, not interfaces that might depend back
import type { VariableType } from '@core/types/variables';
import type { PathValidationContext, RawPath, ValidatedResourcePath } from '@core/types/paths';

/**
 * Common client factory interface
 */
export interface ClientFactory<T> {
  /**
   * Create a client instance
   * @returns A client instance
   */
  createClient(): T;
}

/**
 * Base service initialization options
 */
export interface ServiceOptions {
  /** Whether to enable debugging */
  debug?: boolean;
  /** Additional configuration options */
  [key: string]: unknown;
}

/**
 * Core state service interface without implementation details
 * This is a minimal version to avoid circular dependencies
 */
export interface StateServiceLike {
  /** Get a data variable by name */
  getDataVar(name: string): DataVariable | undefined;
  /** Get a text variable by name */
  getTextVar(name: string): TextVariable | undefined;
  /** Get a path variable by name */
  getPathVar(name: string): IPathVariable | undefined;
  /** Check if a variable with the given name and type exists */
  hasVariable(name: string, type?: VariableType): boolean;
  
  /** Get all text variables */
  getAllTextVars(): Map<string, TextVariable>;
  /** Get all data variables */
  getAllDataVars(): Map<string, DataVariable>;
  /** Get all path variables */
  getAllPathVars(): Map<string, IPathVariable>;
  /** Get all commands */
  getAllCommands(): Map<string, CommandVariable>;
  
  /** Enable transformation mode */
  enableTransformation?(enabled: boolean): void;
  /** Check if transformation is enabled */
  isTransformationEnabled(): boolean;
  /** Get transformation options */
  getTransformationOptions(): any;
  /** Get transformed nodes */
  getTransformedNodes(): any[];
  /** Set transformed nodes */
  setTransformedNodes(nodes: any[]): void;
  /** Transform a node */
  transformNode(original: any, transformed: any): void;
  
  /** Creates a child state that inherits from this state */
  createChildState(): StateServiceLike;
  /** Merges changes from a child state into this state */
  mergeChildState(childState: StateServiceLike): void;
  /** Creates a deep clone of this state */
  clone(): StateServiceLike;
  /** Gets the path of the current file being processed */
  getCurrentFilePath(): string | null;
  /** Sets the path of the current file being processed */
  setCurrentFilePath(path: string): void;
  /** Gets the AST nodes for the current document */
  getNodes(): any[];
  /** Add a node to the current document */
  addNode(node: any): void;
  /** Sets a text variable */
  setTextVar(name: string, value: string): Promise<TextVariable>;
  /** Sets a data variable */
  setDataVar(name: string, value: JsonValue): Promise<DataVariable>;
  /** Sets a path variable */
  setPathVar(name: string, value: IFilesystemPathState | IUrlPathState): Promise<IPathVariable>;
  /** Gets local text variables */
  getLocalTextVars(): Map<string, TextVariable>;
  /** Gets local data variables */
  getLocalDataVars(): Map<string, DataVariable>;
  /** Gets a command by name */
  getCommandVar(name: string): CommandVariable | undefined;
  /** Sets a command with optional options */
  setCommandVar(name: string, value: ICommandDefinition): Promise<CommandVariable>;
  /** Appends raw content to the document */
  appendContent(content: string): void;
  /** Checks if a specific transformation type is enabled */
  shouldTransform(type: string): boolean;
  /** Gets the output of a previously executed command */
  getCommandOutput(command: string): string | undefined;
  /** Checks if the state implementation supports transformation */
  hasTransformationSupport(): boolean;
  /** Gets the unique identifier for this state instance */
  getStateId(): string | undefined;
  /** Registers an imported file path */
  addImport(path: string): void;
  /** Removes an imported file path */
  removeImport(path: string): void;
  /** Checks if a file has been imported */
  hasImport(path: string): boolean;
  /** Gets all imported file paths */
  getImports(): Set<string>;
  /** Checks if the state has local changes that haven't been merged */
  hasLocalChanges(): boolean;
  /** Gets a list of local changes */
  getLocalChanges(): string[];
  /** Makes the state immutable, preventing further changes */
  setImmutable(): void;
  /** Whether the state is immutable */
  readonly isImmutable: boolean;
  /** Sets the event service for state change notifications */
  setEventService(eventService: any): void;
  /** Sets the tracking service for state debugging and analysis */
  setTrackingService(trackingService: any): void;
  /** Get formatting context for consistent newline handling */
  getFormattingContext?(): { 
    isOutputLiteral?: boolean; 
    contextType?: 'inline' | 'block';
    nodeType?: string;
    [key: string]: any;
  };
  /** Set formatting context for consistent newline handling */
  setFormattingContext?(context: { 
    isOutputLiteral?: boolean; 
    contextType?: 'inline' | 'block';
    nodeType?: string;
    [key: string]: any;
  }): void;
}

/**
 * Core file system service interface without implementation details
 */
export interface FileSystemLike {
  /** Check if a file exists */
  fileExists(path: string): Promise<boolean>;
  /** Read a file as text */
  readFile(path: string): Promise<string>;
  /** Resolve a path */
  resolvePath(path: string): string;
  /** Check if a path exists */
  exists(path: string): Promise<boolean>;
  /** Write content to a file */
  writeFile(filePath: string, content: string): Promise<void>;
  /** Get information about a file or directory */
  stat(filePath: string): Promise<any>;
  /** Check if a path points to a file */
  isFile(filePath: string): Promise<boolean>;
  /** List the contents of a directory */
  readDir(dirPath: string): Promise<string[]>;
  /** Create a directory and any necessary parent directories */
  ensureDir(dirPath: string): Promise<void>;
  /** Check if a path points to a directory */
  isDirectory(filePath: string): Promise<boolean>;
  /** Get the current working directory */
  getCwd(): string;
  /** Get the directory name of a path */
  dirname(filePath: string): string;
  /** Execute a shell command */
  executeCommand(command: string, options?: { cwd?: string }): Promise<{ stdout: string; stderr: string }>;
  /** Create a directory and any necessary parent directories (deprecated) */
  mkdir(dirPath: string, options?: { recursive?: boolean }): Promise<void>;
  /** Watch a file or directory for changes */
  watch(path: string, options?: { recursive?: boolean }): AsyncIterableIterator<{ filename: string; eventType: string }>;
  /** Sets the file system implementation to use */
  setFileSystem(fileSystem: any): void;
  /** Gets the current file system implementation */
  getFileSystem(): any;
}

/**
 * Core path service interface without implementation details
 */
export interface PathServiceLike {
  /** Validate a path */
  validatePath(filePath: string | MeldPath, context: PathValidationContext): Promise<MeldPath>;
  /** Resolve a path */
  resolvePath(filePath: RawPath, baseDir?: RawPath): ValidatedResourcePath;
  /** Join path segments */
  joinPaths(...paths: string[]): RawPath;
}

/**
 * Resolution service interface without implementation details
 * This is a minimal version to avoid circular dependencies
 */
export interface ResolutionServiceLike {
  /** Resolve a text value, replacing variables */
  resolveText(text: string, context: ResolutionContextBase): Promise<string>;
  /** Resolve a data value */
  resolveData(dataRef: string, context: ResolutionContextBase): Promise<unknown>;
  /** Resolve a path value, validating and normalizing it */
  resolvePath(path: string, context: ResolutionContextBase): Promise<string>;
  /** Check if a path is valid and accessible */
  validatePath(path: string, context: ResolutionContextBase): Promise<boolean>;
  /** Resolve command references to their results */
  resolveCommand(cmd: string, args: string[], context: ResolutionContextBase): Promise<string>;
  /** Resolve content from a file path */
  resolveFile(path: string): Promise<string>;
  /** Resolve raw content nodes, preserving formatting but skipping comments */
  resolveContent(nodes: MeldNode[], context: ResolutionContextBase): Promise<string>;
  /** Resolve any value based on the provided context rules */
  resolveInContext(value: string, context?: ResolutionContextBase): Promise<string>;
  /** Validate that a value can be resolved with the given context */
  validateResolution(value: string, context?: ResolutionContextBase): Promise<void>;
  /** Extract a section from content by its heading */
  extractSection(content: string, section: string, fuzzy?: number): Promise<string>;
  /** Check for circular variable references */
  detectCircularReferences(value: string): Promise<void>;
  /** Enable tracking of variable resolution attempts */
  enableResolutionTracking(config: any): void;
  /** Get the resolution tracker for debugging */
  getResolutionTracker(): any | undefined;
  /** Resolves a field access on a variable (e.g., variable.field.subfield) */
  resolveFieldAccess(variableName: string, fieldPath: string, context?: ResolutionContextBase): Promise<any>;
  /** Convert a value to a formatted string based on the provided formatting context */
  convertToFormattedString(value: any, options?: any): Promise<string>;
}

/**
 * Circularity service interface without implementation details
 * This is a minimal version to avoid circular dependencies
 */
export interface CircularityServiceLike {
  /** Called at the start of an import to track the import chain */
  beginImport(filePath: string): void;
  /** Called after import is finished to clean up the import stack */
  endImport(filePath: string): void;
  /** Check if a file is currently in the import stack */
  isInStack(filePath: string): boolean;
  /** Get the current import stack for debugging */
  getImportStack(): string[];
  /** Clear the import stack, typically used in testing or to recover from errors */
  reset(): void;
}

/**
 * Parser service interface without implementation details
 * This is a minimal version to avoid circular dependencies
 */
export interface ParserServiceLike {
  /** Parse a string into AST nodes */
  parseString(content: string, options?: { filePath?: string }): Promise<MeldNode[]>;
  /** Parse a file into AST nodes */
  parseFile(filePath: string): Promise<MeldNode[]>;
  /** Parse a string into AST nodes (legacy method) */
  parse(content: string, filePath?: string): Promise<MeldNode[]>;
  /** Parse a string into AST nodes with location information */
  parseWithLocations(content: string, filePath?: string): Promise<MeldNode[]>;
}

/**
 * Validation service interface without implementation details
 * This is a minimal version to avoid circular dependencies
 */
export interface ValidationServiceLike {
  /** Validate a directive node */
  validate(node: DirectiveNode): Promise<void>;
  /** Check if a validator exists for a directive kind */
  hasValidator(kind: string): boolean;
  /** Register a validator for a directive kind */
  registerValidator(kind: string, validator: (node: DirectiveNode) => Promise<void>): void;
  /** Remove a validator for a directive kind */
  removeValidator(kind: string): void;
  /** Get all registered directive kinds */
  getRegisteredDirectiveKinds(): string[];
}

/**
 * Processing options for interpretation
 */
export interface ProcessingOptions {
  /** Current file path */
  filePath?: string;
  /** Working directory */
  workingDirectory?: string;
  /** Whether to validate paths */
  validatePaths?: boolean;
  /** Whether to transform variable references */
  transformVariables?: boolean;
}

/**
 * AST transformation options
 */
export interface TransformationOptions {
  /** Whether to transform variable references */
  transformVariables?: boolean;
  /** Whether to transform directive nodes */
  transformDirectives?: boolean;
  /** Current file path */
  filePath?: string;
}

/**
 * Client factory provider
 */
export interface ClientFactoryProvider<T> {
  /** Create a client factory for the given service */
  createFactory(): ClientFactory<T>;
}

/**
 * Error options for service errors
 */
export interface ServiceErrorOptions {
  /** Error code */
  code?: string;
  /** Error cause */
  cause?: Error;
  /** Error details */
  details?: Record<string, unknown>;
  /** Error location */
  location?: {
    line: number;
    column: number;
    filePath?: string;
  };
}

/**
 * Base options for interpreter configuration
 */
export interface InterpreterOptionsBase {
  /** Current file path for error reporting and path resolution */
  filePath?: string;
  /** Whether to merge the final state back to the parent */
  mergeState?: boolean;
  /** List of variables to import (undefined = all, empty = none) */
  importFilter?: string[];
  /** Whether to run in strict mode (throw on all errors) */
  strict?: boolean;
}

/**
 * Core interpreter service interface without implementation details
 * This is a minimal version to avoid circular dependencies
 */
export interface InterpreterServiceLike {
  /** Check if this service can handle transformations */
  canHandleTransformations(): boolean;
  
  /** 
   * Interpret a sequence of Meld nodes
   * @param nodes Nodes to interpret
   * @param options Interpretation options
   * @returns Resulting state after interpretation
   */
  interpret(nodes: MeldNode[], options?: InterpreterOptionsBase): Promise<StateServiceLike>;
  
  /**
   * Create a new interpreter context with a child state
   * @param parentState Parent state to inherit from
   * @param filePath Optional file path for the child context
   * @param options Optional configuration options
   * @returns Child state initialized for interpretation
   */
  createChildContext(
    parentState: StateServiceLike,
    filePath?: string,
    options?: InterpreterOptionsBase
  ): Promise<StateServiceLike>;
}

/**
 * Core directive service interface without implementation details
 * This is a minimal version to avoid circular dependencies
 */
export interface DirectiveServiceLike {
  /** 
   * Check if a handler exists for a directive kind
   * @param kind The directive kind to check
   * @returns Whether the directive kind is supported
   */
  supportsDirective(kind: string): boolean;
  
  /**
   * Handle a directive node
   * @param node The directive node to handle
   * @param context The execution context 
   * @returns The resulting state after handling the directive
   */
  handleDirective(node: DirectiveNode, context: any): Promise<StateServiceLike>;
  
  /**
   * Validate a directive node
   * @param node The directive node to validate
   */
  validateDirective(node: DirectiveNode): Promise<void>;
}

export type {
  BaseNode
};