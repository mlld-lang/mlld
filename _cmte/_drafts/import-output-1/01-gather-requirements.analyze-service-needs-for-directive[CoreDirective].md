# Improving Type Safety for File and Import Handling in CoreDirective

After analyzing the code for the CoreDirective service, I've identified several opportunities to enhance type safety and clarity around file operations, path handling, and import processing. The current implementation relies heavily on loose types and manual validation, which could be improved with more specialized TypeScript types.

## 1. Strongly-Typed File Paths

### Current Issues:
- Paths are represented as generic strings throughout the codebase
- Manual validation is required before path operations
- No distinction between absolute and relative paths
- Path normalization logic is duplicated
- Path existence checks are separate from path resolution

```typescript
// Current approach in handleImportDirective and handleEmbedDirective
const fullPath = await this.pathService!.resolvePath(directive.path);
      
// Check for circular imports
this.circularityService!.beginImport(fullPath);

// Check if file exists (separate operation)
if (!await this.fileSystemService!.exists(fullPath)) {
  throw new Error(`Import file not found: ${fullPath}`);
}
```

### Proposed Solution:
Create a `FilePath` type hierarchy to represent different path states:

```typescript
// Path type hierarchy
export type RawPath = string & { __raw: never };
export type NormalizedPath = string & { __normalized: never };
export type AbsolutePath = NormalizedPath & { __absolute: never };
export type ValidatedPath = AbsolutePath & { __validated: never };

// Path validation result with existence information
export interface PathValidationResult {
  path: ValidatedPath;
  exists: boolean;
  isDirectory: boolean;
  stats?: FileStats;
}

// Updated PathService interface
export interface IPathService {
  normalize(path: string): NormalizedPath;
  resolve(path: RawPath | NormalizedPath): Promise<AbsolutePath>;
  validate(path: AbsolutePath): Promise<PathValidationResult>;
  // Combined operation for common pattern
  resolveAndValidate(path: string): Promise<PathValidationResult>;
}
```

### Benefits:
1. **Type Safety**: The compiler prevents mixing different path types
2. **Self-Documenting**: Path types clearly indicate their validation state
3. **Error Prevention**: Cannot accidentally use unvalidated paths
4. **Simplified Code**: Path handling logic is centralized
5. **Reduced Duplication**: Combined operations for common patterns

## 2. File Content Type System

### Current Issues:
- File content is always treated as a generic string
- Content processing logic is mixed with file reading
- No distinction between different file types (Meld, Markdown, JSON, etc.)
- Section extraction is implemented directly in the directive service
- Error handling is scattered and inconsistent

```typescript
// Current approach
const content = await this.fileSystemService!.readFile(fullPath);

// If a section is specified, extract it (section name is already interpolated)
let processedContent = content;
if (directive.section) {
  processedContent = await this.extractSection(
    content, 
    directive.section, 
    directive.fuzzy || 0
  );
}
```

### Proposed Solution:
Create a file content type system with content-specific operations:

```typescript
// File content types
export interface FileContent<T = string> {
  content: T;
  path: ValidatedPath;
  type: FileType;
  metadata?: Record<string, any>;
}

export type MeldContent = FileContent<string> & {
  type: 'meld';
  sections?: Map<string, { content: string, level: number }>;
};

export type MarkdownContent = FileContent<string> & {
  type: 'markdown';
  sections?: Map<string, { content: string, level: number }>;
};

export type JSONContent = FileContent<any> & {
  type: 'json';
};

// Content operations
export interface IContentOperations {
  extractSection(content: MeldContent | MarkdownContent, section: string, fuzzyMatch?: number): Promise<string>;
  parseJSON(content: FileContent): Promise<JSONContent>;
  detectFileType(path: ValidatedPath, content: string): FileType;
}

// Enhanced FileSystemService
export interface IFileSystemService {
  readFile(path: ValidatedPath): Promise<FileContent>;
  readMeldFile(path: ValidatedPath): Promise<MeldContent>;
  readMarkdownFile(path: ValidatedPath): Promise<MarkdownContent>;
  readJSONFile(path: ValidatedPath): Promise<JSONContent>;
}
```

### Benefits:
1. **Content-Aware Operations**: File operations know about content types
2. **Centralized Processing**: Content extraction logic is moved to a dedicated service
3. **Type Safety**: Can't accidentally treat JSON as Meld content
4. **Error Clarity**: More specific error types for content operations
5. **Simplified Directive Handlers**: Handlers can focus on business logic

## 3. Import Context and Result Types

### Current Issues:
- Import directives mix multiple concerns (path resolution, file reading, content parsing)
- Import options are passed as loose objects
- Import results are not clearly typed
- State merging logic is complex and error-prone
- No clear distinction between import and embed operations

```typescript
// Current approach for interpreter options
await this.callInterpreterInterpret(parsedNodes, {
  initialState: childState,
  filePath: fullPath,
  mergeState: true
});
```

### Proposed Solution:
Create structured types for import operations:

```typescript
// Import context
export interface ImportContext {
  sourcePath: ValidatedPath;
  targetPath: ValidatedPath;
  options: ImportOptions;
  parentState: StateServiceLike;
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

// Import result
export interface ImportResult {
  state: StateServiceLike;
  content?: MeldContent;
  importedVariables: {
    text: string[];
    data: string[];
    path: string[];
    commands: string[];
  };
  transformedNodes?: MeldNode[];
}

// Import service
export interface IImportService {
  importFile(context: ImportContext): Promise<ImportResult>;
  embedFile(context: ImportContext): Promise<ImportResult>;
}
```

### Benefits:
1. **Clear Intent**: Separate types for import vs. embed operations
2. **Structured Options**: Import options are well-defined
3. **Result Tracking**: Import results include what was imported
4. **Error Handling**: Import-specific error types
5. **Testability**: Easier to mock and test import operations

## 4. Circular Import Detection Types

### Current Issues:
- Circular import detection relies on string paths
- Begin/end import calls must be manually balanced
- No automatic cleanup on errors
- Dependency tracking is implicit

```typescript
// Current approach
this.circularityService!.beginImport(fullPath);
try {
  // Import operations
} finally {
  // Always end import tracking, even if there was an error
  this.circularityService!.endImport(fullPath);
}
```

### Proposed Solution:
Create an import tracking system with automatic cleanup:

```typescript
// Import tracking
export interface ImportTracker {
  path: ValidatedPath;
  release(): void;
}

// Circularity service
export interface ICircularityService {
  trackImport(path: ValidatedPath): ImportTracker;
  getImportChain(): ValidatedPath[];
  hasCircularImport(path: ValidatedPath): boolean;
}

// Usage
const importTracker = this.circularityService.trackImport(validatedPath);
try {
  // Import operations
} finally {
  importTracker.release();
}
```

### Benefits:
1. **Resource Management**: Automatic cleanup with the release pattern
2. **Error Safety**: Can't forget to end import tracking
3. **Dependency Clarity**: Import chains are explicitly tracked
4. **Type Safety**: Uses validated paths instead of strings
5. **Debugging**: Easier to trace import chains

## 5. Directive-Specific File Operation Types

### Current Issues:
- Import and embed directives