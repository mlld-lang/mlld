# Improving TypeScript Types for File Handling in the CoreDirective Service

After analyzing the CoreDirective service code, I've identified several areas where we can strengthen the TypeScript type system to improve file handling, path resolution, and import mechanisms. These improvements will make the code more maintainable, reduce runtime errors, and provide better developer experience.

## 1. File Path Type Safety

### Current Issues:
- The code uses plain `string` for all path-related operations (`directive.path`, `fullPath`, etc.)
- Path normalization and validation are performed at runtime with no type guarantees
- No distinction between absolute/relative paths or validated/unvalidated paths
- Error-prone string concatenation and manipulation for path operations

### Proposed Solution: Strong Path Types

```typescript
// Define a branded type for validated paths
export type ValidatedPath = string & { readonly __brand: unique symbol };

// Define path types with validation guarantees
export interface PathTypes {
  // Raw path from user input (potentially unsafe)
  RawPath: string;
  
  // Path that has been validated but not yet resolved
  ValidatedPath: ValidatedPath;
  
  // Absolute path that has been fully resolved
  AbsolutePath: ValidatedPath & { readonly __absolute: true };
  
  // Relative path (relative to some known base)
  RelativePath: ValidatedPath & { readonly __relative: true };
  
  // Path specifically for importing files
  ImportPath: ValidatedPath & { readonly __importable: true };
}

// Type guards for path validation
export function isValidatedPath(path: string): path is ValidatedPath {
  return path.indexOf('..') === -1 && !path.includes('\0');
}

export function isAbsolutePath(path: ValidatedPath): path is PathTypes['AbsolutePath'] {
  return path.startsWith('/') || /^[A-Z]:\\/.test(path);
}
```

### Benefits:
1. **Compile-time safety**: Path operations become type-checked, preventing mixing unvalidated paths with validated ones
2. **Self-documenting code**: Function signatures clearly indicate what kind of path they expect/return
3. **Reduced validation duplication**: Path validation happens at type boundaries, not scattered throughout the code
4. **Explicit conversion**: Forces explicit conversion from strings to path types, making validation points obvious

### Implementation Example:
```typescript
// Before
private async handleImportDirective(node: DirectiveNode): Promise<void> {
  const directive = node.directive;
  // Path is already interpolated by meld-ast
  const fullPath = await this.pathService!.resolvePath(directive.path);
  // ...
}

// After
private async handleImportDirective(node: DirectiveNode): Promise<void> {
  const directive = node.directive;
  // Type safety ensures we're using a validated path
  const rawPath: PathTypes['RawPath'] = directive.path;
  const validatedPath = await this.pathService!.validatePath(rawPath);
  const fullPath: PathTypes['AbsolutePath'] = await this.pathService!.resolvePath(validatedPath);
  // ...
}
```

## 2. File Content Representation

### Current Issues:
- All file content is treated as plain `string` regardless of format or purpose
- Section extraction and content processing lack type information about the content structure
- No distinction between raw file content and processed content
- Multiple string manipulation operations without type constraints

### Proposed Solution: Content Type System

```typescript
// Define content types with format information
export interface FileContent<T extends string = string> {
  content: T;
  mimeType?: string;
  encoding?: string;
  sourceFile?: PathTypes['AbsolutePath'];
}

// Specialized content types
export interface MarkdownContent extends FileContent<string> {
  mimeType: 'text/markdown';
  sections?: Map<string, MarkdownContent>;
}

export interface MeldContent extends FileContent<string> {
  mimeType: 'text/meld';
  parsed?: boolean;
}

export interface JsonContent extends FileContent<string> {
  mimeType: 'application/json';
  data?: any;
}

// Type guard for content types
export function isMeldContent(content: FileContent): content is MeldContent {
  return content.mimeType === 'text/meld';
}
```

### Benefits:
1. **Content-aware processing**: Functions can be specific about what type of content they handle
2. **Format validation**: Prevents mixing incompatible content types
3. **Metadata preservation**: Keeps track of source files and encoding throughout the pipeline
4. **Clearer interfaces**: API boundaries become more explicit about content expectations

### Implementation Example:
```typescript
// Before
private async extractSection(
  content: string,
  section: string,
  fuzzyMatch: number
): Promise<string> {
  // ...
}

// After
private async extractSection(
  content: MarkdownContent,
  section: string,
  fuzzyMatch: number
): Promise<MarkdownContent> {
  // Type-safe section extraction with content format guarantees
  // ...
  return {
    content: extractedContent,
    mimeType: 'text/markdown',
    sourceFile: content.sourceFile,
    sections: new Map([[section, { content: extractedContent, mimeType: 'text/markdown' }]])
  };
}
```

## 3. Import/Embed Result Interface

### Current Issues:
- Import/embed results are handled through side effects on state
- No clear return type for import operations
- Difficult to track what was imported and from where
- Error handling is scattered and inconsistent

### Proposed Solution: Structured Import Results

```typescript
// Define a structured import result
export interface ImportResult {
  // The source file that was imported
  source: PathTypes['AbsolutePath'];
  
  // Content that was imported
  content: MeldContent;
  
  // Definitions that were imported (variables, commands, etc.)
  definitions: {
    textVars: Map<string, string>;
    dataVars: Map<string, any>;
    pathVars: Map<string, PathTypes['ValidatedPath']>;
    commands: Map<string, any>;
  };
  
  // Section information if a specific section was imported
  section?: {
    name: string;
    content: MarkdownContent;
  };
  
  // Success status
  success: boolean;
  
  // Error information if import failed
  error?: Error;
  
  // Dependency information for circularity detection
  dependencies: PathTypes['AbsolutePath'][];
}

// Type for selective imports
export interface SelectiveImport {
  name: string;
  alias?: string;
  type: 'text' | 'data' | 'path' | 'command';
}
```

### Benefits:
1. **Explicit data flow**: Clear representation of what was imported and from where
2. **Improved error handling**: Structured error information in the result
3. **Dependency tracking**: Built-in support for tracking import dependencies
4. **Selective import support**: Type-safe representation of selective imports

### Implementation Example:
```typescript
// Before
private async handleImportDirective(node: DirectiveNode): Promise<void> {
  // ... complex implementation with side effects
}

// After
private async handleImportDirective(node: DirectiveNode): Promise<ImportResult> {
  const directive = node.directive;
  
  // Create a properly typed import request
  const importRequest: ImportRequest = {
    source: await this.pathService!.validateAndResolvePath(directive.path),
    section: directive.section,
    fuzzyMatch: directive.fuzzy || 0,
    selective: directive.imports?.map(imp => ({
      name: imp.name,
      alias: imp.alias,
      type: imp.type || 'text'
    }))
  };
  
  // Perform the import with proper type safety
  return await this.importService.performImport(importRequest);
}
```

## 4. File System Operation Result Types

### Current Issues:
- File system operations return generic types or void
- Error handling is inconsistent across different file operations
- No structured metadata about file operations
- Difficult to track file dependencies

### Proposed Solution: Operation Result Types

```typescript
// Define a generic operation result
export interface FileOperationResult<T = void> {
  success: boolean;
  value?: T;
  error?: Error;
  path: PathTypes['ValidatedPath'];
  timestamp: number;
}

// Specialized result types
export interface ReadFileResult extends FileOperationResult<FileContent> {
  encoding: string;
  size: number;
}

export interface WriteFileResult extends FileOperationResult {
  bytesWritten: number;
}

export interface FileExistsResult extends FileOperationResult<boolean> {
  exists: boolean;
  isDirectory?: boolean;
  isFile?: boolean;
}
```

### Benefits:
1. **Consistent error handling**: Standardized approach to handling file operation results
2. **Metadata tracking**: Built-in support for tracking file operation metadata
3. **Type-safe chaining**: Operations can be chained with type safety
4. **Self-documenting API**: Clear indication of what operations return

### Implementation Example:
```typescript
// Before
if (!await this.fileSystemService!.exists(fullPath)) {
  throw new Error(`Import file not found: ${fullPath}`);
}
const content = await this.fileSystemService!.readFile(fullPath);

// After
const existsResult = await this.fileSystemService!.exists(fullPath);
if (!existsResult.exists) {
  throw new FileNotFoundError(fullPath, existsResult.error);
}

const readResult = await this.fileSystemService!.readFile(fullPath);
if (!readResult.success) {
  throw new FileReadError(fullPath, readResult.error);
}

const content = readResult.value;
```

## 5. Directive Context Type Improvements

### Current Issues:
- `DirectiveContext` has loosely typed fields (`resolutionContext?: any`)
- File paths in context are plain strings
- No clear structure for file-specific context information
- Context propagation relies on manual property copying

### Proposed Solution: Enhanced Context Types

```typescript
// Define a structured resolution context
export interface ResolutionContext {
  // Current file being processed (with type safety)
  currentFilePath: PathTypes['AbsolutePath'];
  
  // Working directory (with type safety)
  workingDirectory: PathTypes['AbsolutePath'];
  
  // Base directory for relative paths
  baseDir?: PathTypes['AbsolutePath'];
  
  // Variables available for resolution
  variables?: {
    text?: Map<string, string>;
    data?: Map<string, any>;
    path?: Map<string, PathTypes['ValidatedPath']>;
  };
  
  // Import depth for limiting nested imports
  importDepth?: number;
}

// Enhanced directive context
export interface EnhancedDirectiveContext extends Omit<DirectiveContext, 'resolutionContext' | 'currentFilePath' | 'workingDirectory'> {
  // Properly typed resolution context
  resolutionContext: ResolutionContext;
  
  // File context with type safety
  fileContext: {
    currentFilePath: PathTypes['AbsolutePath'];
    workingDirectory: PathTypes['AbsolutePath'];
    importChain: PathTypes['AbsolutePath'][];
  };
}
```

### Benefits:
1. **Type-safe context**: No more `any` types in context objects
2. **Clear context structure**: Well-defined structure for context information
3. **Improved context propagation**: Easier to copy and update context
4. **Self-documenting context**: Clear indication of what context contains

### Implementation Example:
```typescript
// Before
public createChildContext(parentContext: DirectiveContext, filePath: string): DirectiveContext {
  // Create a new resolution context - inherit from parent with updated state
  const resolutionContext = {
    ...(parentContext.resolutionContext || {}),
    state: childState,
    currentFilePath: filePath
  };
  // ...
}

// After
public createChildContext(
  parentContext: EnhancedDirectiveContext, 
  filePath: PathTypes['AbsolutePath']
): EnhancedDirectiveContext {
  // Create a properly typed child context
  const childState = parentContext.state.createChildState();
  
  // Type-safe context creation
  const resolutionContext: ResolutionContext = {
    ...parentContext.resolutionContext,
    currentFilePath: filePath,
    importDepth: (parentContext.resolutionContext.importDepth || 0) + 1
  };
  
  const fileContext = {
    currentFilePath: filePath,
    workingDirectory: parentContext.fileContext.workingDirectory,
    importChain: [...parentContext.fileContext.importChain, filePath]
  };
  
  // ...
}
```

## 6. Import Directive Type Improvements

### Current Issues:
- Import directive structure is loosely typed
- No clear representation of import parameters
- Path variables and selective imports lack type safety
- Import aliases are handled as plain strings

### Proposed Solution: Structured Import Directives

```typescript
// Define a structured import directive
export interface ImportDirectiveData {
  // Source path with type safety
  path: PathTypes['ImportPath'];
  
  // Optional section to import
  section?: string;
  
  // Fuzzy match threshold for section matching
  fuzzy?: number;
  
  // Selective imports with proper typing
  imports?: SelectiveImport[];
  
  // Whether to import all definitions
  importAll?: boolean;
  
  // Source location for error reporting
  location?: {
    start: { line: number; column: number };
    end: { line: number; column: number };
  };
}

// Type guard for import directives
export function isImportDirective(node: DirectiveNode): node is DirectiveNode & { directive: { kind: 'import' } & ImportDirectiveData } {
  return node.directive.kind === 'import';
}
```

### Benefits:
1. **Type-safe directives**: No more loose typing for import directives
2. **Clear parameter structure**: Well-defined structure for import parameters
3. **Improved validation**: Easier to validate import directives
4. **Self-documenting directives**: Clear indication of what import directives contain

### Implementation Example:
```typescript
// Before
private async handleImportDirective(node: DirectiveNode): Promise<void> {
  const directive = node.directive;
  
  this.logger.debug('Processing import directive', {
    path: directive.path,
    section: directive.section,
    fuzzy: directive.fuzzy,
    location: node.location
  });
  // ...
}

// After
private async handleImportDirective(node: DirectiveNode): Promise<void> {
  // Type guard ensures we have the correct directive type
  if (!isImportDirective(node)) {
    throw new TypeError('Expected import directive');
  }
  
  const directive = node.directive;
  
  this.logger.debug('Processing import directive', {
    path: directive.path,
    section: directive.section,
    fuzzy: directive.fuzzy,
    imports: directive.imports,
    location: node.location
  });
  // ...
}
```

## Conclusion

These type improvements address key pain points in the CoreDirective service's file handling code. By introducing stronger types for paths, content, import results, and context objects, we can:

1. **Catch errors earlier**: Many runtime errors become compile-time errors
2. **Improve code readability**: Types document intent and requirements
3. **Reduce duplication**: Validation happens at type boundaries
4. **Enhance maintainability**: Changes become safer with type guarantees
5. **Support better tooling**: IDE autocompletion and refactoring work better

The proposed changes focus on making the implicit constraints in the code explicit through the type system, which aligns with TypeScript's strengths. This will significantly improve the robustness of file handling in the CoreDirective service while making the code more maintainable and easier to understand.