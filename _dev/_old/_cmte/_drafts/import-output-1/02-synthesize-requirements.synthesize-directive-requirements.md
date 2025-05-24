# Consolidated Type Features for File/Import Handling in Meld

## Overview

After reviewing the proposed type enhancements from various service leads, I've consolidated the most valuable and pragmatic improvements for Meld's file/import handling system. These features prioritize type safety, code clarity, and maintainability while aligning with the existing architecture.

## Core Path Types

### 1. Path Type Hierarchy with Branded Types

```typescript
// Path branded types with validation guarantees
export type RawPath = string & { readonly __brand: 'raw' };
export type NormalizedPath = string & { readonly __brand: 'normalized' };
export type AbsolutePath = NormalizedPath & { readonly __brand: 'absolute' };
export type ValidatedPath = AbsolutePath & { readonly __brand: 'validated' };

// Path constructors with validation
export function createRawPath(path: string): RawPath {
  return path as RawPath;
}

export function createNormalizedPath(path: string): NormalizedPath {
  // Normalize path (replace backslashes, resolve .., etc.)
  const normalized = path.replace(/\\/g, '/').replace(/\/\.\//g, '/');
  return normalized as NormalizedPath;
}

export function createAbsolutePath(path: NormalizedPath): AbsolutePath {
  if (!path.startsWith('/')) {
    throw new PathValidationError(`Path is not absolute: ${path}`);
  }
  return path as AbsolutePath;
}

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
```

**Justification**: This was requested by multiple services and provides strong type safety benefits. The branded types approach prevents accidental mixing of different path states while still maintaining string compatibility for existing code.

## File Content Types

### 2. Structured File Content Representation

```typescript
// File content types with metadata
export interface FileContent<T = string> {
  content: T;
  path: ValidatedPath;
  contentType: FileContentType;
  metadata?: FileMetadata;
}

export enum FileContentType {
  MELD = 'meld',
  MARKDOWN = 'markdown',
  JSON = 'json',
  TEXT = 'text',
  BINARY = 'binary'
}

export interface FileMetadata {
  lastModified?: Date;
  size?: number;
  encoding?: string;
}

// Specialized content types
export type MeldContent = FileContent<string> & { 
  contentType: FileContentType.MELD;
  sections?: Map<string, { content: string; level: number }>;
};

export type MarkdownContent = FileContent<string> & {
  contentType: FileContentType.MARKDOWN;
  sections?: Map<string, { content: string; level: number }>;
};

export type JSONContent<T = unknown> = FileContent<T> & {
  contentType: FileContentType.JSON;
};
```

**Justification**: Content-aware file handling was consistently requested across services. This approach provides type safety while maintaining flexibility. The sections map is particularly valuable for the extract section functionality used by import directives.

## Import Operation Types

### 3. Import Context and Result Types

```typescript
// Import context for directive handlers
export interface ImportContext {
  sourcePath: ValidatedPath;
  targetPath: ValidatedPath;
  options: ImportOptions;
  parentState: IStateService;
}

export interface ImportOptions {
  section?: string;
  fuzzyMatch?: number;
  selective?: boolean;
  variables?: string[];
  aliases?: Record<string, string>;
  mergeState?: boolean;
  transformContent?: boolean;
}

// Import result with tracking
export interface ImportResult {
  success: boolean;
  sourcePath: ValidatedPath;
  targetPath: ValidatedPath;
  importedVariables: {
    text: string[];
    data: string[];
    path: string[];
    commands: string[];
  };
  errors?: MeldError[];
  transformedNodes?: MeldNode[];
}
```

**Justification**: Structured import handling was a common request. This approach clearly defines what information is needed for an import operation and what results from it, making it easier to track and debug imports.

## Circularity Detection Types

### 4. Import Tracking with Resource Management

```typescript
// Import tracking with automatic cleanup
export interface ImportTracker {
  path: ValidatedPath;
  release(): void;
}

// Enhanced circularity service
export interface ICircularityService {
  trackImport(path: ValidatedPath): ImportTracker;
  getImportChain(): ValidatedPath[];
  hasCircularImport(path: ValidatedPath): boolean;
}

// Usage example
const importTracker = this.circularityService.trackImport(validatedPath);
try {
  // Import operations
} finally {
  importTracker.release();
}
```

**Justification**: This pattern was strongly advocated to prevent resource leaks and improve error handling. The release pattern ensures that import tracking is properly cleaned up even when errors occur.

## File System Operation Types

### 5. Operation Result Types

```typescript
// Result type for file operations
export type FileResult<T> = 
  | { success: true; value: T; }
  | { success: false; error: MeldFileError; };

// Enhanced file system service
export interface IFileSystemService {
  readFile(path: ValidatedPath): Promise<FileResult<FileContent>>;
  readMeldFile(path: ValidatedPath): Promise<FileResult<MeldContent>>;
  readJSONFile<T>(path: ValidatedPath): Promise<FileResult<JSONContent<T>>>;
  exists(path: ValidatedPath): Promise<boolean>;
  // Other methods...
}
```

**Justification**: Consistently handling file operation results was a common theme. This approach provides a clear distinction between successful and failed operations while maintaining type safety for the result value.

## Path Resolution Context

### 6. Enhanced Resolution Context

```typescript
// Resolution context with path information
export interface ResolutionContext {
  // Existing fields
  allowedVariableTypes: {
    text: boolean;
    data: boolean;
    path: boolean;
    command: boolean;
  };
  
  // New fields for path resolution
  currentFilePath?: ValidatedPath;
  importChain: ValidatedPath[];
  importDepth: number;
  maxImportDepth: number;
  pathValidation?: PathValidationRules;
}

export interface PathValidationRules {
  requireAbsolute: boolean;
  allowedRoots?: ValidatedPath[];
  mustExist: boolean;
  allowRelative?: boolean;
}
```

**Justification**: Enhanced context information was requested to improve error handling and provide better debugging. This approach consolidates the various context options while maintaining backward compatibility.

## Key Decisions and Rejected Features

### Chosen: Branded Types over Discriminated Unions

Several services proposed different approaches to path typing, including discriminated unions and class-based implementations. I chose branded types because they:
1. Have minimal runtime overhead
2. Maintain string compatibility for existing code
3. Provide compile-time type checking
4. Are easier to gradually integrate

### Rejected: Automatic Content Type Detection

Some proposals included automatic content type detection based on file extensions or content analysis. This was rejected because:
1. It introduces potential for errors with ambiguous content
2. It's better to be explicit about content types
3. The complexity outweighs the benefits

### Rejected: Complex Path Variable Resolution Types

Some proposals included elaborate type systems for path variable resolution. This was simplified to focus on the core path types first, as the more complex systems:
1. Would require significant refactoring
2. Add complexity without proportional benefits
3. Can be added incrementally later if needed

### Consolidated: Path Validation Approaches

Multiple approaches to path validation were proposed. I consolidated these into a single approach that:
1. Focuses on the key validation steps (normalization, absoluteness, existence)
2. Uses a clear progression through the type hierarchy
3. Provides explicit validation functions rather than