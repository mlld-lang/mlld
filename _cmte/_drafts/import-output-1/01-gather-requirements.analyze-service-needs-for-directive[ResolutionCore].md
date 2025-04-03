# Type System Improvements for File Handling in ResolutionService

After reviewing the ResolutionService code, I've identified several opportunities to improve the TypeScript type system related to file handling, path resolution, and import mechanisms. These improvements will make the code more robust, easier to maintain, and less prone to runtime errors.

## 1. Strongly-Typed Path Representation

### Current Issues:
- The `StructuredPath` interface is locally defined and not consistently used across the codebase
- Methods accept both string and StructuredPath with type unions (`string | StructuredPath`)
- Path resolution requires manual type checking (`typeof value === 'string'`)
- The raw path is accessed inconsistently (`value.raw` vs `String(value)`)

### Proposed Solution:
Create a comprehensive path type hierarchy with validation at compile time:

```typescript
// In @core/types/path-types.ts
export enum PathVariableType {
  SPECIAL = 'special',  // Like $HOMEPATH, $PROJECTPATH
  USER = 'user'         // User-defined path variables
}

export interface PathSegment {
  value: string;
  isVariable: boolean;
  variableType?: PathVariableType;
  variableName?: string;
}

export interface StructuredPath {
  raw: string;
  structured: {
    segments: PathSegment[];
    isAbsolute: boolean;
    hasCwd: boolean;
  };
  normalized?: string;
}

// Type guard for StructuredPath
export function isStructuredPath(value: unknown): value is StructuredPath {
  return typeof value === 'object' && value !== null && 'raw' in value && 'structured' in value;
}

// Path result types
export type ResolvedPath = string & { __brand: 'ResolvedPath' };
export type ValidatedPath = ResolvedPath & { __brand: 'ValidatedPath' };
export type NormalizedPath = string & { __brand: 'NormalizedPath' };

// Factory functions for branded types
export function createResolvedPath(path: string): ResolvedPath {
  return path as ResolvedPath;
}

export function createValidatedPath(path: ResolvedPath): ValidatedPath {
  return path as ValidatedPath;
}

export function createNormalizedPath(path: string): NormalizedPath {
  return path as NormalizedPath;
}
```

### Benefits:
1. **Type Safety**: Eliminates runtime type checking with proper discriminated unions
2. **Path Validation**: Guarantees that validated paths are also resolved paths
3. **Better IDE Support**: Provides autocompletion and documentation for path-related operations
4. **Error Prevention**: Prevents mixing unresolved and resolved paths accidentally
5. **Consistency**: Ensures consistent path handling across the codebase

## 2. File Content Type System

### Current Issues:
- File content is always treated as string without metadata
- No distinction between different content types (text, binary, JSON, etc.)
- Manual error handling for file not found scenarios
- No content validation or type checking after reading files

### Proposed Solution:
Create a robust file content representation with metadata:

```typescript
// In @core/types/file-types.ts
export enum FileContentType {
  TEXT = 'text',
  JSON = 'json',
  YAML = 'yaml',
  BINARY = 'binary',
  MELD = 'meld'
}

export interface FileMetadata {
  path: ValidatedPath;
  contentType: FileContentType;
  lastModified?: Date;
  size?: number;
  exists: boolean;
}

export interface FileContent<T = string> {
  content: T;
  metadata: FileMetadata;
}

export type TextFileContent = FileContent<string>;
export type JsonFileContent = FileContent<Record<string, any>>;
export type MeldFileContent = FileContent<string> & { 
  parsedNodes?: MeldNode[];
};

// Result type for file operations
export type FileResult<T> = 
  | { success: true; value: T; }
  | { success: false; error: MeldFileNotFoundError | MeldResolutionError; };
```

### Benefits:
1. **Content Awareness**: Makes the system aware of content types for better processing
2. **Safer Operations**: Prevents trying to parse non-JSON files as JSON
3. **Error Handling**: Provides a structured way to handle file operation errors
4. **Metadata Access**: Makes file metadata available throughout the pipeline
5. **Type Safety**: Ensures content is processed according to its type

## 3. Import Result Interface

### Current Issues:
- Import results are not clearly typed
- Distinction between successful and failed imports is unclear
- No tracking of what was imported and from where
- Circular imports are detected but not represented in types

### Proposed Solution:
Create a dedicated import result type system:

```typescript
// In @services/pipeline/ImportService/types.ts
export interface ImportSource {
  path: ValidatedPath;
  normalizedPath: NormalizedPath;
  importedAt: Date;
}

export enum ImportItemType {
  TEXT_VARIABLE = 'text',
  DATA_VARIABLE = 'data',
  PATH_VARIABLE = 'path',
  COMMAND = 'command'
}

export interface ImportItem {
  type: ImportItemType;
  originalName: string;
  aliasName?: string;
  wasOverwritten: boolean;
}

export interface ImportResult {
  source: ImportSource;
  items: ImportItem[];
  selective: boolean;
  success: boolean;
  error?: MeldResolutionError;
  circularityChecked: boolean;
}

export interface ImportTracker {
  addImport(result: ImportResult): void;
  hasImported(path: NormalizedPath): boolean;
  getImportsFrom(path: NormalizedPath): ImportResult[];
  getAllImports(): ImportResult[];
}
```

### Benefits:
1. **Tracking**: Provides clear tracking of what was imported and from where
2. **Diagnostics**: Makes it easier to debug import-related issues
3. **Safety**: Prevents accidental circular imports
4. **Clarity**: Makes it clear what variables were imported and with what aliases
5. **History**: Maintains a history of imports for debugging and analysis

## 4. Path Resolution Context Type

### Current Issues:
- The ResolutionContext interface has mixed concerns
- Path validation options are nested and optional
- Special flags like `isVariableEmbed` and `disablePathPrefixing` are weakly typed
- Context creation has many optional parameters

### Proposed Solution:
Create a dedicated path resolution context:

```typescript
// In @services/fs/PathService/types.ts
export interface PathResolutionOptions {
  // Path validation rules
  requireAbsolute: boolean;
  allowedRoots: ValidatedPath[];
  mustExist: boolean;
  
  // Base directory for relative paths
  baseDir?: string;
  
  // Special handling flags
  disablePathPrefixing: boolean;
  isVariableEmbed: boolean;
  
  // For imports
  currentFilePath?: ValidatedPath;
}

// Default options factory
export function createDefaultPathResolutionOptions(): PathResolutionOptions {
  return {
    requireAbsolute: false,
    allowedRoots: [],
    mustExist: false,
    disablePathPrefixing: false,
    isVariableEmbed: false
  };
}
```

### Benefits:
1. **Focused Context**: Separates path resolution concerns from general resolution
2. **Explicit Options**: Makes all options explicit rather than optional
3. **Default Values**: Provides sensible defaults through a factory function
4. **Clear Intent**: Makes the purpose of each option clear
5. **Type Safety**: Ensures options are properly typed

## 5. File System Operation Result Types

### Current Issues:
- File system operations return basic types (string, boolean)
- Error handling is done with try/catch blocks
- No distinction between different error types
- No metadata about operations

### Proposed Solution:
Create a comprehensive result type system for file operations:

```typescript
// In @services/fs/FileSystemService/types.ts
export enum FileSystemErrorCode {
  FILE_NOT_FOUND = 'FILE_NOT_FOUND',
  PERMISSION