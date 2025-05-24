# ContentResolution Service Type Improvements

After reviewing the ContentResolution service code and related documentation, I've identified several opportunities to improve type safety around file handling, path resolution, and content processing. These improvements will make the code more robust, easier to maintain, and reduce potential runtime errors.

## 1. Typed Content Source Representation

### Current Issue
The `ContentResolver` class processes `MeldNode[]` arrays but lacks context about where these nodes came from (file, string input, etc.). This creates ambiguity when debugging or handling resolution errors.

### Proposed Solution
```typescript
// Define a discriminated union for content sources
export type ContentSource = 
  | { type: 'file'; path: NormalizedPath; content: MeldNode[] }
  | { type: 'string'; identifier: string; content: MeldNode[] }
  | { type: 'import'; sourcePath: NormalizedPath; importPath: NormalizedPath; content: MeldNode[] };

// Update resolver to accept this context
export class ContentResolver {
  constructor(private stateService: IStateService) {}

  async resolve(source: ContentSource, context: ResolutionContext): Promise<string> {
    const { content: nodes } = source;
    // Existing logic but with access to source information
    // ...

    // Can now include source information in error handling
    if (error) {
      throw new MeldResolutionError(
        `Failed to resolve content from ${this.formatSourceForError(source)}`,
        { /* error details with source info */ }
      );
    }
  }

  private formatSourceForError(source: ContentSource): string {
    switch (source.type) {
      case 'file': return `file ${source.path}`;
      case 'string': return `string input "${source.identifier}"`;
      case 'import': return `import of ${source.importPath} from ${source.sourcePath}`;
    }
  }
}
```

### Justification
1. **Error Context Improvement**: Errors can now include precise information about where content originated
2. **Debugging Enhancement**: Makes it easier to trace issues back to specific files or imports
3. **Clearer Intent**: Code explicitly shows the source of content being processed
4. **Self-Documenting**: The type itself documents the possible content sources

## 2. Normalized Path Type

### Current Issue
Paths are represented as strings throughout the codebase, leading to inconsistent normalization, potential security issues, and confusion about whether a path is already normalized.

### Proposed Solution
```typescript
// Create an opaque type for normalized paths
export declare const NormalizedPathBrand: unique symbol;
export type NormalizedPath = string & { readonly [NormalizedPathBrand]: never };

// Create helper functions for creating normalized paths
export function createNormalizedPath(path: string): NormalizedPath {
  // Normalize the path (convert backslashes, handle relative segments, etc.)
  const normalized = path.replace(/\\/g, '/').replace(/\/\.\//g, '/');
  return normalized as NormalizedPath;
}

// Use in ContentResolver
export class ContentResolver {
  constructor(
    private stateService: IStateService,
    @inject('IPathService') private pathService: IPathService
  ) {}

  async resolveFile(filePath: string): Promise<string> {
    // Path is explicitly normalized once
    const normalizedPath = this.pathService.normalizePath(filePath) as NormalizedPath;
    const source: ContentSource = {
      type: 'file',
      path: normalizedPath,
      content: await this.loadNodesFromPath(normalizedPath)
    };
    
    return this.resolve(source, defaultContext);
  }
}
```

### Justification
1. **Type Safety**: Prevents accidentally using a non-normalized path where a normalized one is required
2. **Single Normalization Point**: Ensures paths are normalized exactly once
3. **Circularity Protection**: Improves reliability of circular dependency detection by ensuring consistent path format
4. **Self-Validating**: The type itself enforces normalization as a requirement

## 3. Import Resolution Result Type

### Current Issue
The TextResolver handles variable resolution but doesn't clearly represent the origin of imported variables or their transformation status.

### Proposed Solution
```typescript
// Define a type for imported variables
export interface ImportedVariable<T> {
  name: string;
  alias?: string;
  value: T;
  sourcePath: NormalizedPath;
  isTransformed: boolean;
}

// Define a result type for import operations
export interface ImportResolutionResult {
  textVariables: ImportedVariable<string>[];
  dataVariables: ImportedVariable<unknown>[];
  pathVariables: ImportedVariable<NormalizedPath>[];
  commands: ImportedVariable<unknown>[];
  errors: MeldResolutionError[];
  warnings: string[];
}

// Use in resolvers
export class ImportResolver {
  async resolveImport(
    importPath: string, 
    selectiveImports?: string[], 
    aliases?: Record<string, string>
  ): Promise<ImportResolutionResult> {
    const normalizedPath = createNormalizedPath(importPath);
    // Implementation...
    return result;
  }
}
```

### Justification
1. **Clear Contract**: Explicit type shows exactly what an import operation returns
2. **Error Handling**: Built-in support for capturing errors during import resolution
3. **Traceability**: Each variable maintains a reference to its source file
4. **Transformation Awareness**: Tracks whether variables have been transformed
5. **Selective Import Support**: Structure accommodates selective imports and aliases

## 4. Resolution Context Type Enhancement

### Current Issue
The current `ResolutionContext` type doesn't provide enough information about the resolution environment, leading to potential issues with variable scope and import depth.

### Proposed Solution
```typescript
// Enhanced resolution context
export interface ResolutionContext {
  allowedVariableTypes: {
    text: boolean;
    data: boolean;
    path: boolean;
    command: boolean;
  };
  // Add these new properties
  currentFilePath?: NormalizedPath;
  importChain: NormalizedPath[];
  importDepth: number;
  maxImportDepth: number;
  transformationMode: boolean;
  parentContext?: ResolutionContext;
}

// Use in ContentResolver
export class ContentResolver {
  async resolve(source: ContentSource, context: ResolutionContext): Promise<string> {
    // Check import depth
    if (context.importDepth > context.maxImportDepth) {
      throw new MeldResolutionError(
        `Maximum import depth of ${context.maxImportDepth} exceeded`,
        { /* error details */ }
      );
    }
    
    // Track current file in context
    const resolveContext: ResolutionContext = {
      ...context,
      currentFilePath: source.type === 'file' ? source.path : 
                      source.type === 'import' ? source.importPath : 
                      context.currentFilePath,
      importDepth: source.type === 'import' ? context.importDepth + 1 : context.importDepth
    };
    
    // Rest of implementation
  }
}
```

### Justification
1. **Import Depth Control**: Prevents excessive import chains that could cause performance issues
2. **Context Propagation**: Maintains accurate context across file boundaries
3. **Transformation Awareness**: Explicit flag for transformation mode
4. **Parent Context Tracking**: Enables proper variable resolution scope
5. **Path Awareness**: Keeps track of the current file being processed

## 5. File Content Type Safety

### Current Issue
The current implementation doesn't distinguish between different types of file content (Markdown, JSON, raw text), which can lead to incorrect processing.

### Proposed Solution
```typescript
// Define content types
export type FileContentType = 'meld' | 'markdown' | 'json' | 'text';

// Create a content container type
export interface TypedContent<T = unknown> {
  contentType: FileContentType;
  content: T;
  sourcePath?: NormalizedPath;
}

// Specialized content types
export type MeldContent = TypedContent<MeldNode[]>;
export type MarkdownContent = TypedContent<string>;
export type JsonContent = TypedContent