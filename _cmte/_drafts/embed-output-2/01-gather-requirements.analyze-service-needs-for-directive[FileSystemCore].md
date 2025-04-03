# FileSystemCore Service Improvements for Embed Types

## Current Challenges with `@embed` Directive

After reviewing the FileSystemService code and the Meld documentation, I've identified several areas where stronger TypeScript typing for the `@embed` directive would improve safety, maintainability, and reduce complexity.

### Key Issues in Current Implementation

1. **Path Resolution Complexity**: The `resolvePath` method handles all file paths uniformly, but `@embed` requires different resolution behaviors depending on the embed type (path vs. variable).

2. **Error Handling Ambiguity**: Current error handling can't distinguish between different embed types, making debugging and error messages less specific.

3. **No Type Safety for Embed Variants**: The code lacks type discrimination between the three distinct embed variants (path, variable, template).

4. **Manual Context Tracking**: Operations need to manually track context information that could be encoded in types.

## Proposed TypeScript Type Improvements

### 1. Discriminated Union for Embed Types

```typescript
// Define a discriminated union for embed types
type EmbedSource = 
  | { type: 'path'; path: string; isVariableReference?: false }
  | { type: 'variable'; variableName: string; isVariableReference: true; fieldPath?: string[] }
  | { type: 'template'; templateContent: string; variables: string[] };

// Enhanced readFile method
async readFile(
  filePath: string, 
  options?: { embedSource?: EmbedSource }
): Promise<string> {
  // Implementation can now switch based on embedSource.type
}
```

**Why this helps**: 
- **Type Safety**: Eliminates runtime type checking and casting
- **Self-Documenting**: Code clearly shows the three distinct embed types
- **Exhaustive Checking**: TypeScript will enforce handling all variants in switch statements
- **Validation at Call Site**: Callers must provide correctly structured data

### 2. Context-Aware Resolution with Type Predicates

```typescript
/**
 * Resolves a path differently based on embed context
 */
resolvePath(filePath: string, embedContext?: EmbedSource): string {
  // Skip path resolution for variable embeds
  if (embedContext?.type === 'variable') {
    return filePath; // No path resolution for variables
  }
  
  // Regular path resolution for files and templates
  try {
    // Existing implementation...
  }
}

/**
 * Type guard to identify variable embed sources
 */
isVariableEmbed(source: EmbedSource): source is Extract<EmbedSource, { type: 'variable' }> {
  return source.type === 'variable';
}
```

**Why this helps**:
- **Contextual Behavior**: Path resolution behavior adapts based on embed type
- **Eliminates Bugs**: Prevents incorrect path prefixing for variable embeds
- **Type Narrowing**: TypeScript narrows types in conditional blocks
- **Reusable Type Guards**: Simplifies checks throughout the codebase

### 3. Enhanced Error Types with Embed Context

```typescript
interface MeldFileSystemErrorOptions {
  cause?: Error;
  filePath: string;
  embedContext?: EmbedSource; // Add embed context
}

class MeldFileSystemError extends MeldError {
  readonly filePath: string;
  readonly embedContext?: EmbedSource;
  
  constructor(message: string, options: MeldFileSystemErrorOptions) {
    super(message, options);
    this.filePath = options.filePath;
    this.embedContext = options.embedContext;
  }
  
  // Helper methods to check embed context
  isPathEmbed(): boolean {
    return this.embedContext?.type === 'path';
  }
  
  isVariableEmbed(): boolean {
    return this.embedContext?.type === 'variable';
  }
}
```

**Why this helps**:
- **Richer Error Context**: Errors contain information about what kind of embed failed
- **Improved Debugging**: Makes troubleshooting easier with context-aware errors
- **Better Error Messages**: Can generate more specific user-facing error messages
- **Consistent Error Handling**: Standardizes how embed errors are processed

### 4. Specialized Methods for Embed Types

```typescript
/**
 * Reads file content specifically for path embeds
 */
async readFileForPathEmbed(filePath: string): Promise<string> {
  const resolvedPath = this.resolvePath(filePath);
  
  const context: FileOperationContext = {
    operation: 'readFileForPathEmbed',
    path: filePath,
    resolvedPath,
    embedType: 'path'
  };
  
  try {
    logger.debug('Reading file for path embed', context);
    const content = await this.fs.readFile(resolvedPath);
    logger.debug('Successfully read file for path embed', { 
      ...context, 
      contentLength: content.length 
    });
    return content;
  } catch (error) {
    const err = error as Error;
    if (err.message.includes('ENOENT')) {
      throw new MeldFileNotFoundError(filePath, { 
        cause: err,
        embedContext: { type: 'path', path: filePath }
      });
    }
    throw new MeldFileSystemError(`Error reading file for path embed: ${filePath}`, { 
      cause: err,
      filePath,
      embedContext: { type: 'path', path: filePath }
    });
  }
}
```

**Why this helps**:
- **Specialized Behavior**: Methods can implement embed-specific logic
- **Clearer Intent**: Method names clearly indicate their purpose
- **Reduced Complexity**: Each method handles one specific use case
- **Better Testing**: Easier to test each embed type separately

## Implementation Benefits

Implementing these type improvements would bring several tangible benefits to the FileSystemCore service:

1. **Reduced Manual Type Checking**: Eliminates code that manually determines embed types.

2. **Improved Error Messages**: Users get more specific error messages based on embed type.

3. **Better IDE Support**: Developers get better autocomplete and type hints.

4. **Safer Refactoring**: TypeScript will catch broken code paths during refactoring.

5. **Self-Documenting Code**: Types clearly express the structure and constraints of embed directives.

6. **Simpler Testing**: Each embed variant can be tested separately with specialized methods.

## Example Usage with Enhanced Types

```typescript
// In EmbedDirectiveHandler
async execute(node: DirectiveNode, context: DirectiveContext): Promise<DirectiveResult> {
  const embedType = this.determineEmbedType(node);
  
  switch (embedType.type) {
    case 'path':
      try {
        // Type-safe path embed handling
        const content = await this.fileSystem.readFileForPathEmbed(embedType.path);
        return { content, success: true };
      } catch (error) {
        if (error instanceof MeldFileNotFoundError) {
          throw new MeldDirectiveError(`File not found for @embed: ${embedType.path}`, { node });
        }
        throw error;
      }
      
    case 'variable':
      // Type-safe variable embed handling with field access
      return this.handleVariableEmbed(embedType, context);
      
    case 'template':
      // Type-safe template embed handling
      return this.handleTemplateEmbed(embedType, context);
  }
}
```

By implementing these type improvements, the FileSystemCore service would be more robust, maintainable, and provide better support for the `@embed` directive's distinct behaviors.