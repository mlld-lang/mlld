/**
 * Shared service types with no circular dependencies
 * 
 * This file defines common interface types used across services to break circular dependencies.
 * It contains only types with no direct imports from service implementation files.
 * 
 * IMPORTANT: This file must NOT import from any service implementation files to avoid circular dependencies.
 */

import type { MeldNode, DirectiveNode, TextNode, NodeType, BaseNode } from './syntax/types/shared-types.js';
import type { ResolutionContextBase, DirectiveContextBase } from './shared/types.js';

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
  getDataVar(name: string): unknown;
  /** Get a text variable by name */
  getTextVar(name: string): string | undefined;
  /** Get a path variable by name */
  getPathVar(name: string): string | undefined;
  /** Check if a variable with the given name and type exists */
  hasVariable(type: string, name: string): boolean;
  
  /** Get all text variables */
  getAllTextVars(): Map<string, string>;
  /** Get all data variables */
  getAllDataVars(): Map<string, unknown>;
  /** Get all path variables */
  getAllPathVars(): Map<string, string>;
  /** Get all commands */
  getAllCommands(): Map<string, { command: string; options?: Record<string, unknown> }>;
  
  /** Enable transformation mode */
  enableTransformation(options?: boolean | any): void;
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
}

/**
 * Core path service interface without implementation details
 */
export interface PathServiceLike {
  /** Validate a path */
  validatePath(path: string | StructuredPath): Promise<string | StructuredPath>;
  /** Resolve a path */
  resolvePath(path: string | StructuredPath, baseDir?: string): string;
  /** Join path segments */
  joinPaths(...paths: string[]): string;
}

/**
 * Basic structured path representation
 */
export interface StructuredPath {
  /** The raw path string */
  raw: string;
  /** Structured representation of the path */
  structured: {
    /** Path segments */
    segments: string[];
    /** Variables in the path */
    variables?: {
      /** Special variables like $CURRENT_FILE */
      special?: string[];
      /** Path variables */
      path?: string[];
    };
    /** Whether path is relative to current working directory */
    cwd?: boolean;
  };
  /** Normalized path string */
  normalized?: string;
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