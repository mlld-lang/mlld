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
  validatePath(path: string): Promise<boolean>;
  /** Resolve a path */
  resolvePath(path: string): string;
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