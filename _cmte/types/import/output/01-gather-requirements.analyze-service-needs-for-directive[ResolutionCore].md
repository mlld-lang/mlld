# Improving ResolutionCore: Enhanced File Handling Type System

After reviewing the ResolutionCore service code, I've identified several areas where we can strengthen the TypeScript type system for file handling, path resolution, and import mechanisms. These improvements will make the code more robust, easier to maintain, and less prone to runtime errors.

## 1. Structured Path Type Enhancement

### Current Issues:
- The `StructuredPath` interface is loosely typed and lacks validation guarantees
- Type casting and manual validation are required throughout the code
- No clear distinction between validated and unvalidated paths
- Path resolution errors are caught at runtime rather than compile time

### Proposed Solution: Path State Discrimination

```typescript
// Define a discriminated union for path validation states
type PathValidationState = 'unvalidated' | 'validated' | 'resolved';

// Enhanced StructuredPath with validation state discrimination
interface EnhancedStructuredPath<State extends PathValidationState = 'unvalidated'> {
  raw: string;
  structured: {
    segments: string[];
    variables?: {
      special?: string[];
      path?: string[];
    };
    cwd?: boolean;
  };
  normalized?: string;
  // Discriminator field to track validation state
  _state: State;
  // Only available on validated/resolved paths
  exists?: State extends 'unvalidated' ? never : boolean;
  // Only available on resolved paths
  absolutePath?: State extends 'resolved' ? string : never;
}

// Type guards for path states
function isValidatedPath<T extends PathValidationState>(
  path: EnhancedStructuredPath<T>
): path is EnhancedStructuredPath<'validated'> {
  return path._state === 'validated';
}

function isResolvedPath<T extends PathValidationState>(
  path: EnhancedStructuredPath<T>
): path is EnhancedStructuredPath<'resolved'> {
  return path._state === 'resolved';
}
```

### Benefits:
1. **Type Safety**: The compiler will enforce that only validated paths are used in sensitive operations
2. **Self-Documenting**: The path object itself carries information about its validation state
3. **Error Reduction**: Many runtime errors become compile-time errors
4. **Clearer API**: Methods can require specific path states, making the API more intuitive

### Implementation Impact:
```typescript
// Before:
async resolveStructuredPath(path: StructuredPath, context?: ResolutionContext): Promise<string> {
  // Manual validation and error handling
  try {
    const resolvedPath = this.pathService.resolvePath(path, baseDir);
    return resolvedPath;
  } catch (error) {
    throw new MeldResolutionError(...);
  }
}

// After:
async resolveStructuredPath(
  path: EnhancedStructuredPath<'unvalidated'>, 
  context?: ResolutionContext
): Promise<EnhancedStructuredPath<'resolved'>> {
  // Path is transformed through validation pipeline
  const validatedPath = await this.validateStructuredPath(path, context);
  return this.pathService.resolvePath(validatedPath, baseDir);
}
```

## 2. File Content Type System

### Current Issues:
- File content is always treated as a generic string
- No distinction between different content types (Markdown, JSON, etc.)
- Content parsing happens repeatedly across the codebase
- Error handling for content parsing is duplicated

### Proposed Solution: Content Type Wrapper

```typescript
// Base interface for all file content
interface FileContent<T = string> {
  raw: string;
  parsed: T;
  contentType: string;
  sourcePath?: string;
}

// Specialized content types
interface MeldContent extends FileContent<MeldNode[]> {
  contentType: 'meld';
}

interface JsonContent<T = any> extends FileContent<T> {
  contentType: 'json';
}

interface MarkdownContent extends FileContent<string> {
  contentType: 'markdown';
  // Markdown-specific metadata
  headings?: Array<{
    level: number;
    content: string;
    path: string[];
  }>;
}

// Factory functions for type safety
function createMeldContent(raw: string, parsed: MeldNode[], sourcePath?: string): MeldContent {
  return {
    raw,
    parsed,
    contentType: 'meld',
    sourcePath
  };
}
```

### Benefits:
1. **Content Awareness**: The system knows what type of content it's handling
2. **Parsing Efficiency**: Parse content once, use the result multiple times
3. **Type Safety**: Operations on content can be type-checked based on content type
4. **Metadata Preservation**: Content-specific metadata stays with the content

### Implementation Impact:
```typescript
// Before:
async resolveFile(path: string): Promise<string> {
  try {
    return await this.fileSystemService.readFile(path);
  } catch (error) {
    throw new MeldFileNotFoundError(...);
  }
}

// After:
async resolveFile<T extends 'meld' | 'markdown' | 'json' | 'text' = 'text'>(
  path: EnhancedStructuredPath<'validated'>,
  contentType?: T
): Promise<FileContent<T extends 'meld' ? MeldNode[] : T extends 'json' ? any : string>> {
  try {
    const raw = await this.fileSystemService.readFile(path.absolutePath!);
    return this.contentParserService.parseContent(raw, contentType || 'text', path.absolutePath);
  } catch (error) {
    throw new MeldFileNotFoundError(...);
  }
}
```

## 3. Import Result Interface

### Current Issues:
- Import operation results are implicit
- No clear structure for what data was imported
- Difficult to track which variables came from which imports
- Error handling for imports is scattered

### Proposed Solution: Structured Import Result

```typescript
// Import source tracking
interface ImportSource {
  path: EnhancedStructuredPath<'resolved'>;
  importedAt: Date;
}

// Import operation options
interface ImportOptions {
  selective?: boolean;
  variables?: string[];
  aliases?: Record<string, string>;
}

// Import result with provenance tracking
interface ImportResult {
  source: ImportSource;
  // Track which variables were imported
  imported: {
    text: string[];
    data: string[];
    path: string[];
    commands: string[];
  };
  // Track any aliases created
  aliases?: Record<string, string>;
  // Any errors that occurred but didn't prevent import
  warnings?: Array<{
    code: string;
    message: string;
    variable?: string;
  }>;
}

// Import history for a state
interface ImportHistory {
  imports: ImportResult[];
  getImportedVariables(): string[];
  getVariableSource(name: string): ImportSource | undefined;
}
```

### Benefits:
1. **Traceability**: Each variable's origin is tracked
2. **Debugging**: Import history makes debugging easier
3. **Selective Imports**: Clearer structure for selective imports
4. **Error Handling**: Standardized way to report import warnings

### Implementation Impact:
```typescript
// Before (implicit):
// Import happens, state is updated, no explicit return

// After:
async importFile(
  path: EnhancedStructuredPath<'validated'>,
  options?: ImportOptions
): Promise<ImportResult> {
  // Import processing
  // ...
  
  return {
    source: {
      path: resolvedPath,
      importedAt: new Date()
    },
    imported: {
      text: importedTextVars,
      data: importedDataVars,
      path: importedPathVars,
      commands: importedCommands
    },
    aliases: options?.aliases,
    warnings
  };
}
```

## 4. File System Operation Result Types

### Current Issues:
- File system operations return basic types (string, boolean)
- Error handling is inconsistent
- No metadata about operations is preserved
- Hard to distinguish between different types of failures

### Proposed Solution: Operation Result Types

```typescript
// Base result interface
interface FileSystemResult<T> {
  success: boolean;
  value?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  metadata: {
    timestamp: Date;
    operation: string;
    path: string;
  };
}

// Specialized result types
interface ReadFileResult extends FileSystemResult<string> {
  metadata: {
    timestamp: Date;
    operation: 'readFile';
    path: string;
    size?: number;
    encoding?: string;
  };
}

interface WriteFileResult extends FileSystemResult<void> {
  metadata: {
    timestamp: Date;
    operation: 'writeFile';
    path: string;
    size?: number;
    encoding?: string;
  };
}

interface ExistsResult extends FileSystemResult<boolean> {
  metadata: {
    timestamp: Date;
    operation: 'exists';
    path: string;
    isDirectory?: boolean;
  };
}
```

### Benefits:
1. **Consistent Handling**: All file operations follow the same pattern
2. **Rich Metadata**: Operations include useful metadata
3. **Error Classification**: Errors are structured and typed
4. **Self-Documenting**: Results clearly indicate what operation was performed

### Implementation Impact:
```typescript
// Before:
async resolveFile(path: string): Promise<string> {
  try {
    return await this.fileSystemService.readFile(path);
  } catch (error) {
    throw new MeldFileNotFoundError(...);
  }
}

// After:
async resolveFile(path: EnhancedStructuredPath<'validated'>): Promise<ReadFileResult> {
  const result = await this.fileSystemService.readFile(path.absolutePath!);
  
  if (!result.success) {
    // Handle based on error code
    if (result.error?.code === 'ENOENT') {
      throw new MeldFileNotFoundError(result.error.message);
    }
    throw new MeldResolutionError(result.error?.message || 'Unknown error');
  }
  
  return result;
}
```

## 5. Resolution Context Type Improvements

### Current Issues:
- `ResolutionContext` has many optional properties
- Context validation happens at runtime
- Special flags like `isVariableEmbed` are cast as `any`
- Security constraints are not enforced at the type level

### Proposed Solution: Contextual Type Parameters

```typescript
// Base context with required properties
interface BaseResolutionContext {
  allowedVariableTypes: {
    text: boolean;
    data: boolean;
    path: boolean;
    command: boolean;
  };
  state: StateServiceLike;
}

// Path resolution specific context
interface PathResolutionContext extends BaseResolutionContext {
  currentFilePath?: string;
  pathValidation: {
    requireAbsolute: boolean;
    allowedRoots: string[];
    mustExist?: boolean;
  };
  disablePathPrefixing?: boolean;
}

// Variable embedding context
interface VariableEmbedContext extends BaseResolutionContext {
  isVariableEmbed: true;
  disablePathPrefixing: true;
  fieldAccessOptions?: {
    preserveType?: boolean;
    formattingContext?: any;
  };
}

// Type guard for context types
function isPathResolutionContext(context: BaseResolutionContext): context is PathResolutionContext {
  return 'pathValidation' in context;
}

function isVariableEmbedContext(context: BaseResolutionContext): context is VariableEmbedContext {
  return 'isVariableEmbed' in context && context.isVariableEmbed === true;
}
```

### Benefits:
1. **Context Clarity**: Each context type has a clear purpose
2. **Type Safety**: The compiler enforces required properties for each context
3. **Self-Documenting**: Context types document their intended use
4. **Error Reduction**: Fewer runtime checks needed for context validation

### Implementation Impact:
```typescript
// Before:
async resolveStructuredPath(path: StructuredPath, context?: ResolutionContext): Promise<string> {
  // Manual type checking
  if ((resolveContext as any).isVariableEmbed === true || 
      (resolveContext as any).disablePathPrefixing === true) {
    // Special handling
  }
  // ...
}

// After:
async resolveStructuredPath(
  path: EnhancedStructuredPath<'unvalidated'>, 
  context: PathResolutionContext | VariableEmbedContext
): Promise<string> {
  // Type-safe handling based on context type
  if (isVariableEmbedContext(context)) {
    // Handle variable embed context
    return path.raw;
  }
  
  // Regular path resolution
  // ...
}
```

## 6. Unified File Reference Type

### Current Issues:
- Paths can be strings, structured paths, or node arrays
- Different methods have different parameter types
- Type checking and casting is frequent
- Inconsistent handling of path-like values

### Proposed Solution: FileReference Union Type

```typescript
// A union type that represents all ways to reference a file
type FileReference = 
  | string 
  | EnhancedStructuredPath<PathValidationState>
  | { filePath: string }
  | { nodes: MeldNode[] };

// Helper functions to work with FileReference
function isStringPath(ref: FileReference): ref is string {
  return typeof ref === 'string';
}

function isStructuredPath(ref: FileReference): ref is EnhancedStructuredPath<PathValidationState> {
  return typeof ref === 'object' && ref !== null && '_state' in ref;
}

function isNodeArray(ref: FileReference): ref is { nodes: MeldNode[] } {
  return typeof ref === 'object' && ref !== null && 'nodes' in ref && Array.isArray(ref.nodes);
}

// Extract raw path from any FileReference
function getRawPath(ref: FileReference): string {
  if (isStringPath(ref)) return ref;
  if (isStructuredPath(ref)) return ref.raw;
  if ('filePath' in ref) return ref.filePath;
  return ''; // Node array has no path
}
```

### Benefits:
1. **Unified Interface**: All file references use the same type
2. **Type Guards**: Helper functions make type narrowing easy
3. **Consistent Handling**: All file references are processed consistently
4. **API Simplification**: Methods can accept a single type instead of multiple overloads

### Implementation Impact:
```typescript
// Before:
async resolveContent(nodes: MeldNode[], context: ResolutionContext): Promise<string>;
async resolveContent(path: string, context: ResolutionContext): Promise<string>;

// After:
async resolveContent(reference: FileReference, context: ResolutionContext): Promise<string> {
  if (isNodeArray(reference)) {
    return this.contentResolver.resolve(reference.nodes, context);
  }
  
  if (isStringPath(reference) || isStructuredPath(reference)) {
    const path = isStringPath(reference) ? reference : reference.raw;
    if (!await this.fileSystemService.exists(path)) {
      throw new MeldResolutionError(`File not found: ${path}`);
    }
    return this.fileSystemService.readFile(path);
  }
  
  throw new MeldResolutionError('Invalid file reference');
}
```

## Summary of Benefits

The proposed type system improvements provide several key benefits:

1. **Error Prevention**: Many runtime errors become compile-time errors
2. **Code Clarity**: Types document the expected structure and state of data
3. **Maintainability**: Reduced need for manual type checking and casting
4. **Self-Documentation**: Types serve as documentation for the code
5. **Consistency**: Unified approach to handling files, paths, and imports
6. **Safety**: Security constraints are enforced at the type level

These improvements will make the ResolutionCore service more robust, easier to maintain, and less prone to bugs, particularly when dealing with file imports, path resolution, and content handling.