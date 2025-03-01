# Meld API Reference

## Overview

Meld provides a JavaScript/TypeScript API for processing Meld documents programmatically. This API allows you to:

1. Parse Meld content into an AST
2. Interpret Meld AST with custom state
3. Process Meld files with various output formats
4. Customize the processing pipeline with your own services

## Core Functions

### `main(filePath, options)`

The primary entry point for processing Meld files.

```typescript
async function main(
  filePath: string, 
  options?: ProcessOptions
): Promise<string>;
```

**Parameters:**
- `filePath` - Path to the Meld file to process
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
import { main } from 'meld';

// Basic usage
const output = await main('path/to/file.meld');

// With options
const output = await main('path/to/file.meld', {
  transformation: true,
  format: 'md'
});
```

**Throws:**
- `MeldFileNotFoundError` - If the file doesn't exist
- `MeldParseError` - If there's a syntax error in the Meld document
- `MeldDirectiveError` - If there's an error in a directive
- `MeldInterpreterError` - If there's an error during interpretation
- Other errors depending on the specific operation

## Service Types

Meld uses a service-based architecture that allows for customization and extension. The core services include:

### `FileSystemService`

Handles file operations like reading and writing files.

### `PathService`

Manages path resolution, validation, and special path variables.

### `ParserService`

Parses Meld content into an abstract syntax tree (AST).

### `InterpreterService`

Interprets the AST and executes directives.

### `DirectiveService`

Handles the registration and execution of directive handlers.

### `StateService`

Manages the interpreter state, including variables and transformation.

### `OutputService`

Converts processed Meld content to different output formats.

## Customization

You can customize the Meld processing pipeline by providing your own service implementations:

```typescript
import { main, FileSystemService, PathService } from 'meld';

// Create custom file system
class MyFileSystem extends FileSystemService {
  // Override methods as needed
}

// Process with custom services
const output = await main('path/to/file.meld', {
  services: {
    filesystem: new MyFileSystem()
  }
});
```

## Debugging and Visualization

Meld provides built-in debugging facilities:

```typescript
import { main } from 'meld';

// Enable debug mode
const output = await main('path/to/file.meld', {
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

const result = await main('path/to/file.meld', {
  fs: context.fs,
  services: context.services,
  debug: true
});

// Get debug results
const debugData = await context.endDebugSession(debugSessionId);
```

## Error Handling

Meld provides specialized error classes for robust error handling:

```typescript
import { main, MeldParseError, MeldDirectiveError } from 'meld';

try {
  const output = await main('path/to/file.meld');
} catch (error) {
  if (error instanceof MeldParseError) {
    console.error('Parse error:', error.message);
  } else if (error instanceof MeldDirectiveError) {
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
const output = await main('path/to/file.meld', {
  transformation: true
});
```

### Format Selection

Choose between output formats:

```typescript
// Get markdown output
const markdown = await main('path/to/file.meld', {
  format: 'md'
});

// Get XML (LLM) output
const xml = await main('path/to/file.meld', {
  format: 'xml'
});
```

## Test Utilities

When using Meld in tests, the `TestContext` class provides utilities:

```typescript
import { TestContext } from 'meld/tests';

// Create test context
const context = new TestContext();
await context.initialize();

// Create test files
await context.writeFile('test.meld', '@text greeting = "Hello"');

// Process file
const output = await main('test.meld', {
  fs: context.fs,
  services: context.services
});

// Clean up
await context.cleanup();
```