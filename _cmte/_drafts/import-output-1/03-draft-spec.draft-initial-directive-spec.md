# File Import Handling Type Specification Proposal

Below is a comprehensive type specification proposal for Meld's file handling, path resolution, and import operations. These types are designed to improve type safety, enhance code readability, and support the existing architecture while enabling more robust file operations.

```typescript
/**
 * Path Type Hierarchy
 * 
 * A system of branded types representing different states of path validation.
 * Each type guarantees certain properties about the path it represents.
 * 
 * @remarks Branded types were chosen over discriminated unions or class-based
 * implementations because they provide compile-time type safety with minimal
 * runtime overhead while maintaining string compatibility with existing code.
 */

/** Raw, unprocessed path string with no guarantees */
export type RawPath = string & { readonly __brand: 'raw' };

/** Path with normalized separators and resolved relative segments */
export type NormalizedPath = string & { readonly __brand: 'normalized' };

/** Absolute path guaranteed to start from a root */
export type AbsolutePath = NormalizedPath & { readonly __brand: 'absolute' };

/** Path that has been validated against security constraints and exists */
export type ValidatedPath = AbsolutePath & { readonly __brand: 'validated' };

/**
 * Creates a raw path from a string.
 * This is a simple type conversion with no validation.
 */
export function createRawPath(path: string): RawPath {
  return path as RawPath;
}

/**
 * Creates a normalized path from a string.
 * Normalizes separators and resolves relative segments.
 * 
 * @throws {PathValidationError} If the path cannot be normalized
 */
export function createNormalizedPath(path: string): NormalizedPath {
  // Path normalization logic (replace backslashes, resolve .., etc.)
  // TODO: Implement proper path normalization
  const normalized = path.replace(/\\/g, '/').replace(/\/\.\//g, '/');
  return normalized as NormalizedPath;
}

/**
 * Creates an absolute path from a normalized path.
 * 
 * @throws {PathValidationError} If the path is not absolute
 */
export function createAbsolutePath(path: NormalizedPath): AbsolutePath {
  if (!path.startsWith('/')) {
    throw new PathValidationError(`Path is not absolute: ${path}`);
  }
  return path as AbsolutePath;
}

/**
 * Validates a path exists and meets security constraints.
 * 
 * @throws {PathValidationError} If the path is invalid or doesn't exist
 */
export function createValidatedPath(
  path: AbsolutePath, 
  fileSystem: IFileSystemService
): Promise<ValidatedPath> {
  return fileSystem.validatePath(path)
    .then(() => path as ValidatedPath)
    .catch(error => {
      throw new PathValidationError(`Invalid path: ${path}`, { cause: error });
    });
}

/**
 * File Content Types
 * 
 * A structured representation of file content with metadata and content-specific
 * properties based on the file type.
 * 
 * @remarks The FileContent interface uses generics to support typed content
 * while maintaining a consistent structure across different content types.
 * Specialized subtypes provide additional type safety for specific content formats.
 */

/** Enumeration of supported file content types */
export enum FileContentType {
  MELD = 'meld',
  MARKDOWN = 'markdown',
  JSON = 'json',
  TEXT = 'text',
  BINARY = 'binary'
}

/** Metadata about a file */
export interface FileMetadata {
  /** Last modification timestamp */
  lastModified?: Date;
  /** File size in bytes */
  size?: number;
  /** File encoding (for text files) */
  encoding?: string;
  /** Content hash for caching/comparison */
  contentHash?: string;
}

/** Base interface for file content with metadata */
export interface FileContent<T = string> {
  /** The actual content of the file */
  content: T;
  /** The validated path to the file */
  path: ValidatedPath;
  /** The type of content in the file */
  contentType: FileContentType;
  /** Optional metadata about the file */
  metadata?: FileMetadata;
}

/** Meld-specific file content with section support */
export type MeldContent = FileContent<string> & { 
  contentType: FileContentType.MELD;
  /** Map of named sections within the file */
  sections?: Map<string, { content: string; level: number }>;
};

/** Markdown-specific file content with section support */
export type MarkdownContent = FileContent<string> & {
  contentType: FileContentType.MARKDOWN;
  /** Map of named sections within the file */
  sections?: Map<string, { content: string; level: number }>;
};

/** JSON-specific file content with typed data */
export type JSONContent<T = unknown> = FileContent<T> & {
  contentType: FileContentType.JSON;
};

/**
 * Import Operation Types
 * 
 * Types for handling import operations, including context, options, and results.
 * These types provide structured data for import directive handlers and tracking.
 */

/** Context for import operations */
export interface ImportContext {
  /** The path of the file doing the importing */
  sourcePath: ValidatedPath;
  /** The path of the file being imported */
  targetPath: ValidatedPath;
  /** Import options specified in the directive */
  options: ImportOptions;
  /** The state of the importing file */
  parentState: IStateService;
}

/** Options for import operations */
export interface ImportOptions {
  /** Optional section to import from the target file */
  section?: string;
  /** Fuzzy matching threshold for section names (0-1) */
  fuzzyMatch?: number;
  /** Whether this is a selective import (specific variables) */
  selective?: boolean;
  /** List of variable names to import (if selective) */
  variables?: string[];
  /** Map of source variable names to alias names */
  aliases?: Record<string, string>;
  /** Whether to merge the state from the imported file */
  mergeState?: boolean;
  /** Whether to transform content during import */
  transformContent?: boolean;
}

/** Result of an import operation */
export interface ImportResult {
  /** Whether the import was successful */
  success: boolean;
  /** The path of the file doing the importing */
  sourcePath: ValidatedPath;
  /** The path of the file being imported */
  targetPath: ValidatedPath;
  /** Variables imported, categorized by type */
  importedVariables: {
    text: string[];
    data: string[];
    path: string[];
    commands: string[];
  };
  /** Errors encountered during import, if any */
  errors?: MeldError[];
  /** Transformed nodes from the import, if applicable */
  transformedNodes?: MeldNode[];
}

/**
 * Circularity Detection Types
 * 
 * Types for tracking import chains and detecting circular references.
 * The resource management pattern ensures proper cleanup even in error cases.
 * 
 * @remarks The resource management pattern with explicit release() method
 * was chosen over alternatives like WeakMap tracking to ensure deterministic
 * cleanup and better error handling in complex import scenarios.
 */

/** Tracker for an imported file with automatic cleanup */
export interface ImportTracker {
  /** The path being tracked */
  path: ValidatedPath;
  /** Release the tracking (must be called when done) */
  release(): void;
}

/** Enhanced circularity service interface */
export interface ICircularityService {
  /** 
   * Start tracking an import operation
   * @returns An ImportTracker that must be released when done
   */
  trackImport(path: ValidatedPath): ImportTracker;
  
  /** Get the current import chain */
  getImportChain(): ValidatedPath[];
  
  /** Check if importing a path would create a circular reference */
  hasCircularImport(path: ValidatedPath): boolean;
}

/**
 * File System Operation Types
 * 
 * Types for file system operations with structured error handling.
 * The Result pattern makes error handling explicit an