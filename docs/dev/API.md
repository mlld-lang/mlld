# Mlld API Reference

## Overview

Mlld provides a JavaScript/TypeScript API for processing Mlld documents programmatically. This API allows you to:

1. Parse Mlld content into an AST
2. Interpret Mlld AST with custom state
3. Process Mlld files with various output formats
4. Customize the processing pipeline with your own services

## Core Functions

### `main(filePath, options)`

The primary entry point for processing Mlld files.

```typescript
async function main(
  filePath: string, 
  options?: ProcessOptions
): Promise<string>;
```

**Parameters:**
- `filePath` - Path to the Mlld file to process
- `options` - Optional processing options:
  - `fs` - Custom file system implementation
  - `services` - Custom service implementations
  - `transformation` - Whether to enable transformation mode (default: false)
  - `format` - Output format ('md' or 'xml')
  - `debug` - Whether to enable debug services (default: false)

**Returns:**
- A Promise resolving to the formatted output string.

**Example:**
```typescript
import { main } from 'mlld';

// Basic usage
const output = await main('path/to/file.mld');

// With options
const output = await main('path/to/file.mld', {
  transformation: true,
  format: 'md'
});
```

**Throws:**
- `MlldFileNotFoundError` - If the file doesn't exist
- `MlldParseError` - If there's a syntax error in the Mlld document
- `MlldDirectiveError` - If there's an error in a directive
- `MlldInterpreterError` - If there's an error during interpretation
- Other errors depending on the specific operation

## Service Types

Mlld uses a service-based architecture that allows for customization and extension. The core services include:

### `FileSystemService`

Handles file operations like reading and writing files.

### `PathService`

Manages path resolution, validation, and special path variables.

### `ParserService`

Parses Mlld content into an abstract syntax tree (AST).

### `InterpreterService`

Interprets the AST and executes directives.

### `DirectiveService`

Handles the registration and execution of directive handlers.

### `StateService`

Manages the interpreter state, including variables and transformation.

### `OutputService`

Converts processed Mlld content to different output formats.

## Customization

You can customize the Mlld processing pipeline by providing your own service implementations:

```typescript
import { main, FileSystemService, PathService } from 'mlld';

// Create custom file system
class MyFileSystem extends FileSystemService {
  // Override methods as needed
}

// Process with custom services
const output = await main('path/to/file.mld', {
  services: {
    filesystem: new MyFileSystem()
  }
});
```

## Debugging and Visualization

Mlld provides built-in debugging facilities:

```typescript
import { main } from 'mlld';

// Enable debug mode
const output = await main('path/to/file.mld', {
  debug: true
});

// In a test environment with TestContext
const debugSessionId = await context.startDebugSession({
  captureConfig: {
    capturePoints: ['pre-transform', 'post-transform'],
    includeFields: ['variables', 'nodes']
  },
  traceOperations: true
});

const result = await main('path/to/file.mld', {
  fs: context.fs,
  services: context.services,
  debug: true
});

// Get debug results
const debugData = await context.endDebugSession(debugSessionId);
```

## Error Handling

Mlld provides specialized error classes for robust error handling:

```typescript
import { main, MlldParseError, MlldDirectiveError } from 'mlld';

try {
  const output = await main('path/to/file.mld');
} catch (error) {
  if (error instanceof MlldParseError) {
    console.error('Parse error:', error.message);
  } else if (error instanceof MlldDirectiveError) {
    console.error('Directive error:', error.message);
  } else {
    console.error('Other error:', error);
  }
}
```

## Advanced Usage

### Transformation Mode

Transformation mode replaces directive calls with their results:

```typescript
const output = await main('path/to/file.mld', {
  transformation: true
});
```

### Format Selection

Choose between output formats:

```typescript
// Get markdown output
const markdown = await main('path/to/file.mld', {
  format: 'md'
});

// Get XML (LLM) output
const xml = await main('path/to/file.mld', {
  format: 'xml'
});
```

## Test Utilities

When using Mlld in tests, the `TestContext` class provides utilities:

```typescript
import { TestContext } from 'mlld/tests';

// Create test context
const context = new TestContext();
await context.initialize();

// Create test files
await context.writeFile('test.mld', '@text greeting = "Hello"');

// Process file
const output = await main('test.mld', {
  fs: context.fs,
  services: context.services
});

// Clean up
await context.cleanup();
```