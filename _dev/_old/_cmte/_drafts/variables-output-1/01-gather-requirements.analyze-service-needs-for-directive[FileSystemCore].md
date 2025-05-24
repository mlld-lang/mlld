# FileSystemService Type System Improvements

After analyzing the FileSystemService implementation, I've identified several opportunities to enhance the TypeScript type system for variable handling. These improvements will make the code more robust, maintainable, and less prone to runtime errors.

## 1. Strongly Typed Path Variables

### Current Implementation
```typescript
// Current approach
resolvePath(filePath: string): string {
  try {
    // Use the path client if available
    if (this.pathClient) {
      try {
        return this.pathClient.resolvePath(filePath);
      } catch (error) {
        logger.warn('Error using pathClient.resolvePath, falling back to pathOps', { 
          error: error instanceof Error ? error.message : String(error), 
          filePath 
        });
      }
    }
    
    // Fall back to path operations service
    return this.pathOps.resolvePath(filePath);
  } catch (error) {
    logger.warn('Error resolving path', {
      path: filePath,
      error: error instanceof Error ? error.message : String(error)
    });
    
    // Last resort fallback
    return filePath;
  }
}
```

### Proposed Improvement
```typescript
// Define path types
type AbsolutePath = string & { readonly __type: unique symbol };
type RelativePath = string & { readonly __type: unique symbol };
type PathVariable = string & { readonly __type: unique symbol };

// Path conversion functions with runtime validation
function asAbsolutePath(path: string): AbsolutePath {
  if (!path.startsWith('/')) {
    throw new MeldError(`Path must be absolute: ${path}`);
  }
  return path as AbsolutePath;
}

function asRelativePath(path: string): RelativePath {
  if (path.startsWith('/')) {
    throw new MeldError(`Path must be relative: ${path}`);
  }
  return path as RelativePath;
}

// Updated method signature
resolvePath(filePath: string | RelativePath | PathVariable): AbsolutePath {
  try {
    // Implementation remains similar, but with stronger return type
    const resolvedPath = /* existing implementation */;
    
    // Validate and return as AbsolutePath
    return asAbsolutePath(resolvedPath);
  } catch (error) {
    logger.warn('Error resolving path', {
      path: filePath,
      error: error instanceof Error ? error.message : String(error)
    });
    
    // Even fallback must conform to AbsolutePath
    return asAbsolutePath(filePath.toString());
  }
}
```

### Justification
1. **Type Safety**: The current implementation treats all paths as strings, which doesn't distinguish between absolute paths, relative paths, and path variables (`$var`). This can lead to runtime errors when a relative path is used where an absolute path is expected.

2. **Self-Documenting Code**: With typed paths, the function signature clearly communicates expectations and guarantees. Methods that require absolute paths make this explicit in the type system.

3. **Compiler-Enforced Validation**: The type system will force developers to use the appropriate conversion functions, ensuring path validation happens consistently.

4. **Elimination of Runtime Errors**: Many path-related bugs in the Meld codebase stem from improper path handling. These types would catch such issues at compile time.

## 2. Improved File Operation Context

### Current Implementation
```typescript
interface FileOperationContext {
  operation: string;
  path: string;
  details?: Record<string, unknown>;
  [key: string]: unknown;
}

// Used like:
const context: FileOperationContext = {
  operation: 'readFile',
  path: filePath,
  resolvedPath
};
```

### Proposed Improvement
```typescript
// Define a discriminated union for operation types
type FileOperation = 
  | { type: 'read'; path: string; resolvedPath: AbsolutePath }
  | { type: 'write'; path: string; resolvedPath: AbsolutePath; contentLength: number }
  | { type: 'stat'; path: string; resolvedPath: AbsolutePath }
  | { type: 'exists'; path: string; resolvedPath: AbsolutePath }
  | { type: 'readDir'; path: string; resolvedPath: AbsolutePath }
  | { type: 'ensureDir'; path: string; resolvedPath: AbsolutePath }
  | { type: 'isFile'; path: string; resolvedPath: AbsolutePath }
  | { type: 'isDirectory'; path: string; resolvedPath: AbsolutePath }
  | { type: 'watch'; path: string; resolvedPath: AbsolutePath; options?: { recursive?: boolean } }
  | { type: 'executeCommand'; command: string; cwd?: string };

// Enhanced context with operation-specific fields
interface FileOperationContext {
  operation: FileOperation['type'];
  details: FileOperation;
  timestamp: number;
  error?: Error;
}

// Usage:
const context: FileOperationContext = {
  operation: 'readFile',
  details: {
    type: 'read',
    path: filePath,
    resolvedPath
  },
  timestamp: Date.now()
};
```

### Justification
1. **Operation-Specific Type Safety**: The current `FileOperationContext` uses string literals for operations and allows arbitrary properties. The improved version ensures that each operation type has exactly the right properties.

2. **Consistent Logging**: The enhanced context ensures consistent field names and types across all file operations, making logs more predictable and easier to query.

3. **Compiler-Checked Completeness**: If a new operation is added, TypeScript will enforce adding it to the `FileOperation` union, preventing inconsistent logging.

4. **Documentation**: The type definitions serve as self-documentation for what data should be included with each operation type.

## 3. Error Handling with Typed Error Results

### Current Implementation
```typescript
async readFile(filePath: string): Promise<string> {
  // ...
  try {
    // ...
  } catch (error) {
    const err = error as Error;
    if (err.message.includes('ENOENT')) {
      logger.error('File not found', { ...context, error: err });
      throw new MeldFileNotFoundError(filePath, { cause: err });
    }
    logger.error('Error reading file', { ...context, error: err });
    throw new MeldFileSystemError(`Error reading file: ${filePath}`, { 
      cause: err,
      filePath
    });
  }
}
```

### Proposed Improvement
```typescript
// Define a result type
type Result<T, E extends Error = Error> = 
  | { success: true; value: T }
  | { success: false; error: E };

// Use in method implementation
async readFileWithResult(filePath: string): Promise<Result<string, MeldFileSystemError | MeldFileNotFoundError>> {
  const resolvedPath = this.resolvePath(filePath);
  
  const context = /* create context */;
  
  try {
    logger.debug('Reading file', context);
    const content = await this.fs.readFile(resolvedPath);
    logger.debug('Successfully read file', { ...context, contentLength: content.length });
    return { success: true, value: content };
  } catch (error) {
    const err = error as Error;
    if (err.message.includes('ENOENT')) {
      logger.error('File not found', { ...context, error: err });
      return { 
        success: false, 
        error: new MeldFileNotFoundError(filePath, { cause: err }) 
      };
    }
    logger.error('Error reading file', { ...context, error: err });
    return { 
      success: false, 
      error: new MeldFileSystemError(`Error reading file: ${filePath}`, { 
        cause: err,
        filePath
      })
    };
  }
}

// Keep original method for backward compatibility
async readFile(filePath: string): Promise<string> {
  const result = await this.readFileWithResult(filePath);
  if