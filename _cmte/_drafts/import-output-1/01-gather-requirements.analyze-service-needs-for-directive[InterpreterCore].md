# Type Enhancements for File Import Handling in InterpreterCore

After analyzing the InterpreterCore service implementation, I've identified several opportunities for improving type safety and clarity around file handling, path resolution, and import mechanisms. The current implementation has several areas where stronger typing would reduce complexity, prevent bugs, and make the code more maintainable.

## 1. Typed File Paths with Validation Guarantees

### Current Issues:
- `filePath` is currently typed as a simple `string` in `InterpreterOptions`
- Path validation happens at runtime with no type guarantees
- Multiple places in the code need to check if paths exist or are valid
- No distinction between raw, normalized, and resolved paths

### Proposed Solution:
```typescript
// Define path types with different validation guarantees
type RawPath = string & { readonly __brand: unique symbol };
type NormalizedPath = string & { readonly __brand: unique symbol };
type ValidatedPath = NormalizedPath & { readonly __brand: unique symbol };
type AbsolutePath = ValidatedPath & { readonly __brand: unique symbol };

// Create constructor functions with validation
function createRawPath(path: string): RawPath {
  return path as RawPath;
}

function createNormalizedPath(path: RawPath): NormalizedPath {
  // Normalize path (replace backslashes, handle dots, etc.)
  const normalized = normalizePath(path);
  return normalized as NormalizedPath;
}

function createValidatedPath(path: NormalizedPath, fileSystem: IFileSystemService): ValidatedPath | null {
  // Validate path (no invalid characters, etc.)
  if (!isValidPath(path)) return null;
  return path as ValidatedPath;
}

function createAbsolutePath(path: ValidatedPath, fileSystem: IFileSystemService): AbsolutePath | null {
  // Resolve to absolute path
  if (!fileSystem.exists(path)) return null;
  const absolutePath = fileSystem.resolvePath(path);
  return absolutePath as AbsolutePath;
}

// Updated InterpreterOptions interface
interface InterpreterOptions {
  // Other options...
  filePath?: RawPath; // Changed from string to RawPath
  // ...
}
```

### Benefits:
1. **Type Safety**: Path validation errors become type errors caught at compile time
2. **Self-Documenting**: Code clearly indicates what kind of path is expected (raw, normalized, validated, absolute)
3. **Reduced Duplication**: Validation logic is centralized in constructor functions
4. **Clearer Dependencies**: Functions that require validated paths explicitly state this requirement
5. **Easier Debugging**: Path validation issues are caught earlier in the development process

## 2. Structured Import Context Type

### Current Issues:
- Import directives have complex context requirements with no clear type definition
- Context is passed as `any` in `callDirectiveHandleDirective(node: DirectiveNode, context: any)`
- Special handling for import directives is scattered throughout the code
- No clear contract for what an import directive needs to provide or receive

### Proposed Solution:
```typescript
// Define structured import context
interface ImportContext {
  sourcePath: ValidatedPath;
  targetPath: ValidatedPath;
  importFilter?: string[];
  aliases?: Record<string, string>;
  isTransformationEnabled: boolean;
}

// Define import result with clear contract
interface ImportResult {
  success: boolean;
  importedVariables: {
    text: Record<string, unknown>;
    data: Record<string, unknown>;
    path: Record<string, string>;
    commands: Record<string, unknown>;
  };
  errors?: MeldError[];
  transformedNodes?: MeldNode[];
}

// Updated directive handling
interface DirectiveContext {
  state: StateServiceLike;
  parentState: StateServiceLike;
  currentFilePath: ValidatedPath;
  formattingContext: FormattingContext;
  importContext?: ImportContext; // Added for import directives
}

// Type-safe directive handler
private async callDirectiveHandleDirective(
  node: DirectiveNode, 
  context: DirectiveContext
): Promise<StateServiceLike | (StateServiceLike & { replacement: MeldNode })> {
  // Implementation...
}
```

### Benefits:
1. **Clear Contract**: Explicit definition of what import directives need and provide
2. **Type Checking**: TypeScript can verify all required import information is provided
3. **Self-Documenting**: Code clearly shows the structure of import operations
4. **Reduced Casting**: No need for `as unknown as` casts in import handling
5. **Better Error Handling**: Structure allows for collecting and reporting multiple import errors

## 3. File Content Representation Type

### Current Issues:
- No distinction between raw file content and parsed content
- Unclear ownership of file content through the processing pipeline
- Multiple places need to handle file content with manual validation
- No tracking of content source (file, variable, etc.)

### Proposed Solution:
```typescript
// Define content types with source tracking
interface ContentSource {
  type: 'file' | 'variable' | 'inline';
  identifier: string; // Path for file, variable name for variable
  location?: SourceLocation;
}

interface FileContent {
  content: string;
  source: ContentSource;
  encoding: string;
  mtime?: Date;
}

interface ParsedContent {
  nodes: MeldNode[];
  source: ContentSource;
}

// Update file handling methods
interface IFileSystemServiceClient {
  readFile(path: ValidatedPath): Promise<FileContent>;
  // Other methods...
}

// Update parser interface
interface IParserServiceClient {
  parse(content: FileContent): Promise<ParsedContent>;
  // Other methods...
}
```

### Benefits:
1. **Source Tracking**: Clear tracking of where content originated (useful for error reporting)
2. **Metadata Preservation**: File metadata (encoding, modification time) stays with content
3. **Clearer Ownership**: Explicit handoff of content between services
4. **Reduced Validation**: Content validation happens once at source
5. **Better Error Messages**: Error messages can include detailed source information

## 4. Transformation Result Type

### Current Issues:
- Transformation results are detected through property checking (`'replacement' in directiveResult`)
- Complex type casting when extracting replacement nodes
- No clear structure for transformation results across directive types
- Duplicate variable copying logic for different directive types

### Proposed Solution:
```typescript
// Define transformation result interface
interface TransformationResult {
  state: StateServiceLike;
  replacement?: MeldNode;
  variables?: {
    text?: Record<string, unknown>;
    data?: Record<string, unknown>;
    path?: Record<string, string>;
    commands?: Record<string, unknown>;
  };
}

// Update directive handler return type
interface IDirectiveServiceClient {
  handleDirective(
    node: DirectiveNode, 
    context: DirectiveContext
  ): Promise<StateServiceLike | TransformationResult>;
  // Other methods...
}

// Simplified transformation handling
if (isTransformationResult(directiveResult)) {
  currentState = directiveResult.state;
  
  // Apply variable copying if needed
  if (directiveResult.variables) {
    this.stateVariableCopier.copyVariables(
      currentState as unknown as IStateService,
      originalState as unknown as IStateService,
      directiveResult.variables
    );
  }
  
  // Apply replacement if provided
  if (directiveResult.replacement && 
      currentState.isTransformationEnabled?.()) {
    currentState.transformNode(node, directiveResult.replacement);
  }
}
```

### Benefits:
1. **Explicit Contract**: Clear definition of what a transformation result contains
2. **Type Safety**: TypeScript can verify all transformation operations are valid
3. **Centralized Logic**: Variable copying logic is unified across directive types
4. **Reduced Duplication**: No need for special-case handling for different directives
5. **Simplified Code**: Cleaner, more readable transformation application code

## 5. Import Filter Type

### Current Issues:
- Import filters are typed as simple string arrays
- No distinction between different variable types in filters
- Aliases are handled separately from filters
- No validation of filter entries against available variables

### Proposed Solution:
```typescript
// Define structured import filter
interface ImportFilter {