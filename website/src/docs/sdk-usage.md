---
layout: docs.njk
title: "SDK Usage"
---

# SDK Usage

The mlld SDK allows you to integrate mlld processing into your JavaScript or TypeScript applications.

## Installation

```bash
npm install mlld
```

## Core Functions

The SDK provides three main functions for working with mlld content:

### Parse mlld Content

Parse raw mlld content into an Abstract Syntax Tree (AST):

```typescript
import { parsemlld } from 'mlld';

const content = `
@text name = "World"
Hello, {{name}}!
`;

const nodes = parsemlld(content);
```

The parsed AST contains nodes representing directives and text content, which can be further processed or manipulated.

### Interpret mlld AST

Interpret parsed AST nodes with optional initial state:

```typescript
import { interpretmlld, InterpreterState } from 'mlld';

// Create initial state (optional)
const initialState = new InterpreterState();
initialState.setText('greeting', 'Hi');

// Interpret the nodes
const finalState = interpretmlld(nodes, initialState);
```

Interpretation executes directives, resolves variables, and produces a final state containing all defined variables and the processed content.

### Run mlld Files

Convenience function to read and interpret mlld files in one step:

```typescript
import { runmlld } from 'mlld';

// Run with default options (XML format)
const { state, output } = await runmlld('path/to/file.mld');

// Run with custom options
const { state, output } = await runmlld('path/to/file.mld', {
  format: 'md',  // or 'xml'
  initialState: new InterpreterState()
});

// Use the state for further operations
console.log(state.getVariables());

// Use the formatted output
console.log(output);
```

## Working with State

The `InterpreterState` class manages variables, commands, and content during interpretation:

```typescript
import { InterpreterState } from 'mlld';

// Create new state
const state = new InterpreterState();

// Set and get text variables
state.setText('name', 'Alice');
const name = state.getText('name');

// Set and get data variables
state.setData('user', { name: 'Alice', id: 123 });
const user = state.getData('user');

// Set and get path variables
state.setPath('docs', '/path/to/docs');
const docsPath = state.getPath('docs');

// Get all variables
const variables = state.getVariables();
```

## Error Handling

The SDK provides comprehensive error handling with enhanced formatting:

### Basic Error Handling

```typescript
import { interpret, mlldError } from 'mlld';

try {
  const result = await interpret(content, options);
  console.log(result);
} catch (error) {
  if (error instanceof mlldError) {
    console.error('mlld Error:', error.message);
    console.error('Error Code:', error.code);
    console.error('Severity:', error.severity);
  } else {
    console.error('Unexpected error:', error);
  }
}
```

### Enhanced Error Formatting

Use the `formatError` function for rich error display:

```typescript
import { interpret, formatError } from 'mlld';
import { NodeFileSystem } from 'mlld';

try {
  const result = await interpret(content, options);
} catch (error) {
  const fileSystem = new NodeFileSystem();
  
  // Format error with enhanced display
  const formatted = await formatError(error, {
    fileSystem,
    useSourceContext: true,
    useSmartPaths: true,
    useColors: process.stdout.isTTY,
    basePath: process.cwd(),
    contextLines: 2
  });
  
  // Display formatted error
  console.error(formatted.formatted);
  
  // Access structured error data
  console.log('Error details:', formatted.json);
  
  // Access source context if available
  if (formatted.sourceContext) {
    console.log('Error in file:', formatted.sourceContext.file);
    console.log('At line:', formatted.sourceContext.errorLine);
  }
}
```

### Error Format Options

- **`useSourceContext`**: Show source code around the error location
- **`useSmartPaths`**: Display relative paths when within a project
- **`useColors`**: Enable colorized output (auto-detected for terminals)
- **`basePath`**: Project root for relative path calculation
- **`contextLines`**: Number of context lines to show (default: 2)

### Auto-Detecting Error Format

The SDK can automatically choose the best error format:

```typescript
import { interpret, ErrorFormatSelector } from 'mlld';

try {
  const result = await interpret(content, options);
} catch (error) {
  const formatter = new ErrorFormatSelector(fileSystem);
  
  // Auto-detects CLI vs API format based on environment
  const formatted = await formatter.formatAuto(error, {
    useSourceContext: true,
    useSmartPaths: true,
    basePath: process.cwd()
  });
  
  if (typeof formatted === 'string') {
    // CLI format (when running in terminal)
    console.error(formatted);
  } else {
    // API format (when running programmatically)
    console.error(formatted.formatted);
    // Access structured data: formatted.json, formatted.sourceContext
  }
}
```

### Error Types

The SDK provides specialized error types for robust error handling:

```typescript
import { 
  parsemlld, 
  mlldParseError, 
  mlldInterpreterError,
  mlldFileNotFoundError,
  mlldError
} from 'mlld';

try {
  const nodes = parsemlld(invalidContent);
} catch (error) {
  if (error instanceof mlldParseError) {
    console.error('Parse error:', error.message);
    console.error('Line:', error.line);
    console.error('Column:', error.column);
  } else if (error instanceof mlldInterpreterError) {
    console.error('Interpreter error:', error.message);
  } else if (error instanceof mlldFileNotFoundError) {
    console.error('File not found:', error.message);
  } else if (error instanceof mlldError) {
    console.error('General mlld error:', error.message);
  } else {
    console.error('Unknown error:', error);
  }
}
```

## Advanced Usage

### Custom Format Handlers

You can register custom format handlers for variable formatting:

```typescript
import { registerFormatHandler } from 'mlld';

// Register a custom format handler
registerFormatHandler('uppercase', (value) => {
  return String(value).toUpperCase();
});

// Now you can use it in mlld code
// @text name = "alice"
// @text greeting = `Hello, {{name>>(uppercase)}}!`
// Result: "Hello, ALICE!"
```

### File System Customization

You can provide custom file system handlers for testing or special environments:

```typescript
import { runmlld, createMemoryFileSystem } from 'mlld';

// Create an in-memory file system for testing
const memfs = createMemoryFileSystem({
  '/test/file.md': 'This is a test file',
  '/test/data.json': '{"key": "value"}'
});

// Use the custom file system
const { state, output } = await runmlld('path/to/file.mld', {
  fileSystem: memfs
});
```

## Integration Example

Here's a complete example of integrating mlld into an application:

```typescript
import { parsemlld, interpretmlld, InterpreterState } from 'mlld';
import * as fs from 'fs';

// Read a mlld file
const content = fs.readFileSync('template.mld', 'utf-8');

try {
  // Parse the content
  const nodes = parsemlld(content);
  
  // Create initial state with user data
  const state = new InterpreterState();
  state.setText('username', 'Alice');
  state.setData('userData', { 
    id: 12345,
    role: 'admin',
    preferences: { theme: 'dark' }
  });
  
  // Interpret the nodes
  const finalState = interpretmlld(nodes, state);
  
  // Get the processed content
  const result = finalState.getContent();
  
  // Output the result
  fs.writeFileSync('output.md', result, 'utf-8');
  console.log('Processing complete!');
  
} catch (error) {
  console.error('Error processing mlld file:', error.message);
}
```