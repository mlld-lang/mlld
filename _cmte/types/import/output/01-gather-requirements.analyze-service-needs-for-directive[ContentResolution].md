# Improving ContentResolution Service with Enhanced File Handling Types

After reviewing the ContentResolution service code and understanding its role within the Meld language system, I've identified several opportunities to strengthen the type system related to file handling, path resolution, and the import mechanism. These improvements will make the code more robust, maintainable, and less prone to errors.

## Current Implementation Analysis

The ContentResolver service currently:
- Processes arrays of MeldNodes to extract and combine text content
- Handles different node types (Text, CodeFence) with type casting
- Skips comment and directive nodes
- Lacks strong typing for file paths, content sources, and import relationships

## Proposed Type System Improvements

### 1. Typed File Paths

**Problem:** The current system likely handles file paths as simple strings, which can lead to path normalization issues, security vulnerabilities, and validation errors.

**Proposed Solution:**
```typescript
// Define a branded type for validated file paths
export type ValidatedPath = string & { readonly __brand: unique symbol };

// Create a factory function to create validated paths
export function createValidatedPath(path: string): ValidatedPath {
  // Path validation logic here (normalize slashes, check for directory traversal, etc.)
  if (!isValidPath(path)) {
    throw new MeldResolutionError(
      `Invalid file path: ${path}`,
      {
        code: ResolutionErrorCode.INVALID_PATH,
        severity: ErrorSeverity.Fatal,
        details: { path }
      }
    );
  }
  return path as ValidatedPath;
}
```

**Benefits:**
1. **Type Safety:** Prevents mixing raw strings with validated paths
2. **Error Prevention:** Forces validation before path usage
3. **Self-Documentation:** Makes it clear when a path has been validated
4. **Consistency:** Ensures uniform path handling throughout the codebase

### 2. Content Source Tracking

**Problem:** When resolving content, the current implementation doesn't track where content originated from, making debugging and error reporting difficult.

**Proposed Solution:**
```typescript
export interface ContentSource {
  path: ValidatedPath;
  importChain: ValidatedPath[]; // Track the chain of imports that led to this content
  importDepth: number;          // Track nesting level of imports
}

export interface ResolvedContent {
  content: string;
  source: ContentSource;
}
```

**Benefits:**
1. **Improved Error Messages:** Errors can include the full import chain
2. **Debugging:** Makes it easier to trace where content came from
3. **Circular Detection:** Helps with detecting circular imports
4. **Depth Limiting:** Can enforce maximum import depth

### 3. Import Result Interface

**Problem:** The current implementation doesn't have a clear structure for representing imported content and its metadata.

**Proposed Solution:**
```typescript
export interface ImportResult {
  content: string;
  source: ContentSource;
  importedDefinitions: {
    textVars: Map<string, string>;
    dataVars: Map<string, unknown>;
    pathVars: Map<string, ValidatedPath>;
    commands: Map<string, unknown>;
  };
  errors: MeldResolutionError[];
  warnings: MeldResolutionError[];
}
```

**Benefits:**
1. **Structured Results:** Clear interface for import operations
2. **Error Handling:** First-class support for errors and warnings
3. **Definition Tracking:** Clear structure for tracking imported definitions
4. **Type Safety:** Ensures imported definitions maintain proper types

### 4. Node Resolution Context

**Problem:** The current implementation passes a generic ResolutionContext that doesn't capture the specifics of content resolution.

**Proposed Solution:**
```typescript
export interface ContentResolutionContext extends ResolutionContext {
  currentSource: ContentSource;
  transformationMode: boolean;
  resolvedImports: Map<string, ImportResult>;
  maxImportDepth: number;
  circularityDetection: boolean;
}
```

**Benefits:**
1. **Context Awareness:** Makes resolution context specific to content resolution
2. **Import Tracking:** Tracks already resolved imports to prevent duplicates
3. **Configuration:** Centralizes configuration options
4. **Type Safety:** Ensures all required context properties are provided

### 5. Enhanced ContentResolver Implementation

Here's how the ContentResolver could be updated with these type improvements:

```typescript
export class ContentResolver {
  constructor(
    private stateService: IStateService,
    private fileSystem: IFileSystemService,
    private pathService: IPathService
  ) {}

  /**
   * Resolve content nodes with enhanced type safety and source tracking
   */
  async resolve(
    nodes: MeldNode[], 
    context: ContentResolutionContext
  ): Promise<ResolvedContent> {
    const resolvedParts: string[] = [];

    for (const node of nodes) {
      // Skip comments and directives
      if (node.type === 'Comment' || node.type === 'Directive') {
        continue;
      }

      switch (node.type) {
        case 'Text':
          // Regular text - output as is
          resolvedParts.push((node as TextNode).content);
          break;

        case 'CodeFence':
          // For code fences, directly use the content from the node
          resolvedParts.push((node as CodeFenceNode).content);
          break;
      }
    }

    // Join parts without adding any additional whitespace
    const content = resolvedParts
      .filter(part => part !== undefined)
      .join('');

    return {
      content,
      source: context.currentSource
    };
  }

  /**
   * Import content from a file with enhanced type safety
   */
  async importContent(
    path: string, 
    context: ContentResolutionContext
  ): Promise<ImportResult> {
    // Validate and normalize the path
    const validatedPath = createValidatedPath(path);
    
    // Check for circular imports
    if (context.circularityDetection && 
        context.currentSource.importChain.includes(validatedPath)) {
      const errorChain = [...context.currentSource.importChain, validatedPath];
      throw new MeldResolutionError(
        `Circular import detected: ${errorChain.join(' -> ')}`,
        {
          code: ResolutionErrorCode.CIRCULAR_IMPORT,
          severity: ErrorSeverity.Fatal,
          details: { importChain: errorChain }
        }
      );
    }

    // Check import depth
    if (context.currentSource.importDepth >= context.maxImportDepth) {
      throw new MeldResolutionError(
        `Maximum import depth exceeded (${context.maxImportDepth})`,
        {
          code: ResolutionErrorCode.MAX_IMPORT_DEPTH,
          severity: ErrorSeverity.Fatal,
          details: { 
            maxDepth: context.maxImportDepth,
            path: validatedPath
          }
        }
      );
    }

    // Check if already imported
    if (context.resolvedImports.has(validatedPath)) {
      return context.resolvedImports.get(validatedPath)!;
    }

    // Create new source context for the import
    const importSource: ContentSource = {
      path: validatedPath,
      importChain: [...context.currentSource.importChain, validatedPath],
      importDepth: context.currentSource.importDepth + 1
    };

    // Create import context
    const importContext: ContentResolutionContext = {
      ...context,
      currentSource: importSource
    };

    // Read and parse file
    const content = await this.fileSystem.readFile(validatedPath);
    // ... additional processing logic

    // Create result
    const result: ImportResult = {
      content,
      source: importSource,
      importedDefinitions: {
        textVars: new Map(),
        dataVars: new Map(),
        pathVars: new Map(),
        commands: new Map()
      },
      errors: [],
      warnings: []
    };

    // Cache result
    context.resolvedImports.set(validatedPath, result);

    return result;
  }
}
```

## Implementation Benefits

These type system improvements offer several key benefits:

1. **Error Prevention:** By using branded types for paths and structured interfaces for imports, many common errors can be caught at compile time.

2. **Enhanced Debugging:** Source tracking makes it easier to identify where content originated and how it was processed.

3. **Clearer Code Intent:** The types clearly communicate the purpose and constraints of each component.

4. **Simplified Logic:** With stronger types, less runtime validation and type checking is needed.

5. **Better Error Messages:** When errors do occur, they can include more context about where and why they happened.

6. **Maintainability:** The code becomes more self-documenting and easier to understand for new developers.

7. **Consistency:** Ensures uniform handling of paths, imports, and content throughout the codebase.

## Conclusion

Implementing these type system improvements would significantly strengthen the ContentResolution service's handling of file imports and path resolution. By moving validation concerns into the type system, we can catch more errors at compile time and make the code more robust and maintainable.

The most critical improvements are the ValidatedPath branded type and the ContentSource tracking, as these address the most common sources of bugs in file handling systems. These improvements align perfectly with the Meld language's focus on robust directive processing and content transformation.