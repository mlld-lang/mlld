/**
 * Shared service types with no circular dependencies
 * 
 * This file defines common interface types used across services to break circular dependencies.
 * It contains only types with no direct imports from service implementation files.
 * 
 * IMPORTANT: This file must NOT import from any service implementation files to avoid circular dependencies.
 */

import type { MeldNode, DirectiveNode, TextNode } from './syntax/types/shared-types.js';

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
 * Resolution context for variable resolution
 */
export interface ResolutionContextBase {
  /** Current file path for resolution */
  currentFilePath?: string;
  /** Working directory for resolution */
  workingDirectory?: string;
  /** Whether transformation mode is enabled */
  transformationMode?: boolean;
  /** Whether to include path validation */
  validatePaths?: boolean;
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
 * Directive context for directive execution
 */
export interface DirectiveContextBase {
  /** Current file being processed */
  currentFilePath?: string;
  /** Working directory for command execution */
  workingDirectory?: string;
  /** Resolution context for variable resolution */
  resolutionContext?: ResolutionContextBase;
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