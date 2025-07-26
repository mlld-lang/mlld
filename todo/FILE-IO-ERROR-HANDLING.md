# File I/O Error Handling Specification

## ⚠️ REFINEMENT NEEDED

### Concerns:
1. **Retry Logic Complexity** - Exponential backoff and retry might be over-engineered
2. **Platform Dependencies** - Atomic write operations may not work consistently across platforms
3. **Performance Impact** - Retries could cause unexpected delays in user-facing operations

### Recommended Simplifications:
1. **Start Without Retry Logic** - Add it later only where proven necessary
2. **Simple Fallback Strategies** - Focus on the common cases (return empty, return path)
3. **Remove Atomic Writes Initially** - Standard writes are sufficient for most cases
4. **Clear Error Categories** - Focus on the errors users can actually fix

### Phased Implementation:
- Phase 1: Basic safe read/write with good error messages
- Phase 2: Add fallback strategies
- Phase 3: Add retry logic only for specific proven cases (like EBUSY)
- Phase 4: Platform-specific optimizations if needed

---

## Overview

This document specifies a centralized system for file I/O operations with consistent error handling, retry logic, and fallback strategies throughout the mlld interpreter.

## Problem Statement

Current file I/O operations have inconsistent error handling:

```typescript
// Pattern 1: Silent fallback
try {
  value = await env.readFile(pathValue);
} catch (error) {
  value = pathValue; // Fallback to path string
}

// Pattern 2: Re-throw with context
try {
  const content = await env.readFile(filePath);
} catch (error) {
  throw new Error(`Failed to read file: ${filePath}`);
}

// Pattern 3: Conditional handling
try {
  content = await fileSystem.readFile(path);
} catch (error) {
  if (error.code === 'ENOENT') {
    return undefined;
  }
  throw error;
}
```

Issues:
1. **Inconsistent behavior** - Same errors handled differently
2. **Lost error context** - Original error details often discarded
3. **No retry logic** - Transient failures not handled
4. **Poor error messages** - Users don't know how to fix issues
5. **No standardized fallbacks** - Each place implements own logic

## Proposed Solution

### Core Architecture

```typescript
// interpreter/utils/file-operations.ts

export interface FileOperationOptions {
  // Error handling
  throwOnError?: boolean;
  fallbackValue?: any;
  fallbackStrategy?: 'path' | 'empty' | 'error' | 'custom';
  customFallback?: (error: Error, path: string) => any;
  
  // Retry logic
  retryCount?: number;
  retryDelay?: number;
  retryableErrors?: string[];
  
  // Context
  operation?: string;
  context?: string;
  location?: SourceLocation;
  
  // Validation
  validateContent?: (content: string) => boolean;
  maxSize?: number;
  encoding?: BufferEncoding;
}

export interface FileOperationResult<T> {
  success: boolean;
  data?: T;
  error?: Error;
  fallbackUsed?: boolean;
  retryCount?: number;
  path: string;
}
```

### Primary Operations

```typescript
// interpreter/utils/file-operations.ts

/**
 * Safe file read with consistent error handling
 */
export async function safeReadFile(
  env: Environment,
  path: string,
  options: FileOperationOptions = {}
): Promise<string> {
  const result = await performFileOperation(
    () => env.readFile(path),
    path,
    {
      operation: 'read',
      fallbackStrategy: 'error',
      ...options
    }
  );
  
  if (!result.success) {
    throw result.error!;
  }
  
  return result.data!;
}

/**
 * Try to read file, return fallback on error
 */
export async function tryReadFile(
  env: Environment,
  path: string,
  fallback: string = '',
  options: FileOperationOptions = {}
): Promise<string> {
  const result = await performFileOperation(
    () => env.readFile(path),
    path,
    {
      operation: 'read',
      fallbackValue: fallback,
      fallbackStrategy: 'custom',
      throwOnError: false,
      ...options
    }
  );
  
  return result.data ?? fallback;
}

/**
 * Check if file exists with proper error handling
 */
export async function fileExists(
  env: Environment,
  path: string,
  options: FileOperationOptions = {}
): Promise<boolean> {
  try {
    await env.fileSystem.stat(path);
    return true;
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return false;
    }
    
    if (options.throwOnError) {
      throw new FileOperationError({
        operation: 'check existence',
        path,
        originalError: error,
        context: options.context,
        location: options.location
      });
    }
    
    return false;
  }
}

/**
 * Read file with size limit
 */
export async function readFileWithLimit(
  env: Environment,
  path: string,
  maxSize: number,
  options: FileOperationOptions = {}
): Promise<string> {
  // First check file size
  const stats = await env.fileSystem.stat(path);
  
  if (stats.size > maxSize) {
    throw new FileOperationError({
      operation: 'read',
      path,
      reason: `File size (${formatBytes(stats.size)}) exceeds limit (${formatBytes(maxSize)})`,
      context: options.context,
      location: options.location
    });
  }
  
  return safeReadFile(env, path, options);
}

/**
 * Core operation handler with retry logic
 */
async function performFileOperation<T>(
  operation: () => Promise<T>,
  path: string,
  options: FileOperationOptions
): Promise<FileOperationResult<T>> {
  const {
    retryCount = 0,
    retryDelay = 100,
    retryableErrors = ['EAGAIN', 'EBUSY', 'EMFILE', 'ENFILE'],
    throwOnError = true,
    fallbackStrategy = 'error',
    fallbackValue,
    customFallback,
    validateContent,
    context,
    location
  } = options;
  
  let lastError: Error | undefined;
  let attempts = 0;
  
  // Retry loop
  for (let i = 0; i <= retryCount; i++) {
    attempts++;
    
    try {
      const result = await operation();
      
      // Validate if requested
      if (validateContent && typeof result === 'string') {
        if (!validateContent(result)) {
          throw new FileOperationError({
            operation: options.operation || 'file operation',
            path,
            reason: 'Content validation failed',
            context,
            location
          });
        }
      }
      
      return {
        success: true,
        data: result,
        path,
        retryCount: i > 0 ? i : undefined
      };
      
    } catch (error: any) {
      lastError = error;
      
      // Check if retryable
      const shouldRetry = i < retryCount && 
        retryableErrors.includes(error.code) &&
        !error.unrecoverable;
      
      if (shouldRetry) {
        await delay(retryDelay * (i + 1)); // Exponential backoff
        continue;
      }
      
      // Not retryable, break
      break;
    }
  }
  
  // All retries failed, handle fallback
  const enhancedError = enhanceFileError(lastError!, path, options);
  
  if (throwOnError && fallbackStrategy === 'error') {
    throw enhancedError;
  }
  
  // Determine fallback value
  let fallbackData: T | undefined;
  
  switch (fallbackStrategy) {
    case 'path':
      fallbackData = path as any;
      break;
      
    case 'empty':
      fallbackData = '' as any;
      break;
      
    case 'custom':
      if (customFallback) {
        fallbackData = customFallback(enhancedError, path);
      } else {
        fallbackData = fallbackValue;
      }
      break;
  }
  
  return {
    success: false,
    data: fallbackData,
    error: enhancedError,
    fallbackUsed: true,
    path,
    retryCount: attempts - 1
  };
}
```

### Error Enhancement

```typescript
// interpreter/utils/errors/file-errors.ts

export class FileOperationError extends MlldError {
  constructor(details: {
    operation: string;
    path: string;
    reason?: string;
    originalError?: Error;
    context?: string;
    location?: SourceLocation;
  }) {
    const message = `Failed to ${details.operation} file '${details.path}'${
      details.reason ? `: ${details.reason}` : ''
    }`;
    
    super(message, details.location, {
      severity: ErrorSeverity.Error,
      code: 'FILE_OPERATION_ERROR',
      cause: details.originalError,
      details: {
        ...details,
        hint: generateFileErrorHint(details)
      }
    });
  }
}

function enhanceFileError(
  error: Error,
  path: string,
  options: FileOperationOptions
): FileOperationError {
  const errorCode = (error as any).code;
  
  let reason: string;
  let hint: string | undefined;
  
  switch (errorCode) {
    case 'ENOENT':
      reason = 'File not found';
      hint = `Make sure the file exists at: ${path}`;
      break;
      
    case 'EACCES':
    case 'EPERM':
      reason = 'Permission denied';
      hint = 'Check file permissions and try again';
      break;
      
    case 'EISDIR':
      reason = 'Path is a directory, not a file';
      hint = 'Provide a path to a file, not a directory';
      break;
      
    case 'EMFILE':
    case 'ENFILE':
      reason = 'Too many open files';
      hint = 'The system has too many open files. Try closing some applications.';
      break;
      
    case 'ENOTDIR':
      reason = 'Part of the path is not a directory';
      hint = 'Check that all parent directories in the path exist';
      break;
      
    default:
      reason = error.message || 'Unknown error';
  }
  
  return new FileOperationError({
    operation: options.operation || 'access',
    path,
    reason,
    originalError: error,
    context: options.context,
    location: options.location
  });
}

function generateFileErrorHint(details: any): string {
  const hints: string[] = [];
  
  if (details.originalError?.code === 'ENOENT') {
    hints.push('Check the file path for typos');
    hints.push('Ensure the file exists');
    hints.push('Use relative paths from the current .mld file');
  }
  
  if (details.operation === 'write' && details.originalError?.code === 'EACCES') {
    hints.push('Check that you have write permissions');
    hints.push('The directory might be read-only');
  }
  
  return hints.join('. ');
}
```

### Specialized Operations

```typescript
/**
 * Read JSON file with validation
 */
export async function readJsonFile<T = any>(
  env: Environment,
  path: string,
  options: FileOperationOptions & {
    schema?: (data: any) => data is T;
  } = {}
): Promise<T> {
  const content = await safeReadFile(env, path, {
    ...options,
    operation: 'read JSON file'
  });
  
  try {
    const data = JSON.parse(content);
    
    if (options.schema && !options.schema(data)) {
      throw new FileOperationError({
        operation: 'validate JSON',
        path,
        reason: 'JSON structure does not match expected schema',
        context: options.context,
        location: options.location
      });
    }
    
    return data;
  } catch (error: any) {
    if (error instanceof FileOperationError) throw error;
    
    throw new FileOperationError({
      operation: 'parse JSON',
      path,
      reason: 'Invalid JSON syntax',
      originalError: error,
      context: options.context,
      location: options.location
    });
  }
}

/**
 * Read directory with error handling
 */
export async function readDirectory(
  env: Environment,
  path: string,
  options: FileOperationOptions & {
    recursive?: boolean;
    filter?: (name: string) => boolean;
  } = {}
): Promise<string[]> {
  try {
    const entries = await env.fileSystem.readdir(path);
    
    let filtered = entries;
    if (options.filter) {
      filtered = entries.filter(options.filter);
    }
    
    return filtered;
  } catch (error: any) {
    throw new FileOperationError({
      operation: 'read directory',
      path,
      originalError: error,
      context: options.context,
      location: options.location
    });
  }
}

/**
 * Write file with atomic operation
 */
export async function writeFileAtomic(
  env: Environment,
  path: string,
  content: string,
  options: FileOperationOptions = {}
): Promise<void> {
  const tempPath = `${path}.tmp.${Date.now()}`;
  
  try {
    // Write to temp file first
    await env.fileSystem.writeFile(tempPath, content, {
      encoding: options.encoding || 'utf8'
    });
    
    // Atomic rename
    await env.fileSystem.rename(tempPath, path);
    
  } catch (error: any) {
    // Cleanup temp file if it exists
    try {
      await env.fileSystem.unlink(tempPath);
    } catch {} // Ignore cleanup errors
    
    throw new FileOperationError({
      operation: 'write file atomically',
      path,
      originalError: error,
      context: options.context,
      location: options.location
    });
  }
}
```

### Utility Functions

```typescript
/**
 * Format bytes for human-readable display
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Delay for retry logic
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check if error is retryable
 */
export function isRetryableError(error: any): boolean {
  const retryableCodes = ['EAGAIN', 'EBUSY', 'EMFILE', 'ENFILE', 'ETIMEDOUT'];
  return error.code && retryableCodes.includes(error.code);
}
```

## Integration Examples

### Before:
```typescript
// add.ts
try {
  content = await env.readFile(resolvedPath);
} catch (error) {
  // Silent fallback to path
  content = resolvedPath;
}
```

### After:
```typescript
// add.ts
const content = await tryReadFile(env, resolvedPath, resolvedPath, {
  context: 'add directive',
  location: directive.location
});
```

### Before:
```typescript
// import handling
let moduleContent: string;
try {
  moduleContent = await env.readFile(modulePath);
} catch (error) {
  throw new Error(`Cannot read module: ${modulePath}`);
}
```

### After:
```typescript
// import handling
const moduleContent = await safeReadFile(env, modulePath, {
  operation: 'import module',
  context: `importing ${moduleName}`,
  location: importDirective.location,
  retryCount: 2, // Retry for transient failures
  maxSize: 10 * 1024 * 1024 // 10MB limit for modules
});
```

## Migration Strategy

### Phase 1: Implementation
1. Create file-operations module
2. Implement all utility functions
3. Add comprehensive error types
4. Create test suite with error scenarios

### Phase 2: Critical Path Migration
1. Update import/module loading first
2. Update @add directive file reading
3. Update output file operations

### Phase 3: Complete Migration
1. Update remaining file operations
2. Add lint rules for direct fs usage
3. Update documentation

## Benefits

1. **Consistent Behavior** - All file operations behave the same
2. **Better Error Messages** - Users know exactly what went wrong
3. **Automatic Retries** - Handle transient failures gracefully
4. **Flexible Fallbacks** - Each use case can specify appropriate fallback
5. **Size Protection** - Prevent memory issues from huge files
6. **Atomic Writes** - Prevent partial file corruption

## Testing Strategy

```typescript
describe('File Operations', () => {
  it('should retry on transient errors', async () => {
    let attempts = 0;
    env.readFile = jest.fn().mockImplementation(() => {
      attempts++;
      if (attempts < 3) {
        throw Object.assign(new Error('Busy'), { code: 'EBUSY' });
      }
      return 'content';
    });
    
    const result = await safeReadFile(env, 'test.txt', { retryCount: 3 });
    expect(result).toBe('content');
    expect(attempts).toBe(3);
  });
  
  it('should provide helpful error for missing file', async () => {
    env.readFile = jest.fn().mockRejectedValue(
      Object.assign(new Error('Not found'), { code: 'ENOENT' })
    );
    
    await expect(safeReadFile(env, 'missing.txt'))
      .rejects.toThrow(/File not found.*Make sure the file exists/);
  });
  
  it('should use fallback when specified', async () => {
    env.readFile = jest.fn().mockRejectedValue(new Error('Failed'));
    
    const result = await tryReadFile(env, 'test.txt', 'fallback');
    expect(result).toBe('fallback');
  });
});
```

## Future Enhancements

1. **Streaming Operations** - Handle large files with streams
2. **Progress Callbacks** - Report progress for large operations
3. **Caching Layer** - Cache frequently read files
4. **Watch Support** - Monitor files for changes
5. **Virtual File System** - Support for in-memory files during testing