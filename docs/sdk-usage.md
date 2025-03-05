# Meld SDK Usage

The Meld SDK allows you to integrate Meld processing into your JavaScript or TypeScript applications.

## Installation

```bash
npm install meld
```

## Core Functions

The SDK provides three main functions for working with Meld content:

### Parse Meld Content

Parse raw Meld content into an Abstract Syntax Tree (AST):

```typescript
import { parseMeld } from 'meld';

const content = `
@text name = "World"
Hello, {{name}}!
`;

const nodes = parseMeld(content);
```

The parsed AST contains nodes representing directives and text content, which can be further processed or manipulated.

### Interpret Meld AST

Interpret parsed AST nodes with optional initial state:

```typescript
import { interpretMeld, InterpreterState } from 'meld';

// Create initial state (optional)
const initialState = new InterpreterState();
initialState.setText('greeting', 'Hi');

// Interpret the nodes
const finalState = interpretMeld(nodes, initialState);
```

Interpretation executes directives, resolves variables, and produces a final state containing all defined variables and the processed content.

### Run Meld Files

Convenience function to read and interpret Meld files in one step:

```typescript
import { runMeld } from 'meld';

// Run with default options (XML format)
const { state, output } = await runMeld('path/to/file.meld');

// Run with custom options
const { state, output } = await runMeld('path/to/file.meld', {
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
import { InterpreterState } from 'meld';

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

The SDK provides specialized error types for robust error handling:

```typescript
import { 
  parseMeld, 
  MeldParseError, 
  MeldInterpreterError,
  MeldFileNotFoundError,
  MeldError
} from 'meld';

try {
  const nodes = parseMeld(invalidContent);
} catch (error) {
  if (error instanceof MeldParseError) {
    console.error('Parse error:', error.message);
    console.error('Line:', error.line);
    console.error('Column:', error.column);
  } else if (error instanceof MeldInterpreterError) {
    console.error('Interpreter error:', error.message);
  } else if (error instanceof MeldFileNotFoundError) {
    console.error('File not found:', error.message);
  } else if (error instanceof MeldError) {
    console.error('General Meld error:', error.message);
  } else {
    console.error('Unknown error:', error);
  }
}
```

## Advanced Usage

### Custom Format Handlers

You can register custom format handlers for variable formatting:

```typescript
import { registerFormatHandler } from 'meld';

// Register a custom format handler
registerFormatHandler('uppercase', (value) => {
  return String(value).toUpperCase();
});

// Now you can use it in Meld code
// @text name = "alice"
// @text greeting = `Hello, {{name>>(uppercase)}}!`
// Result: "Hello, ALICE!"
```

### File System Customization

You can provide custom file system handlers for testing or special environments:

```typescript
import { runMeld, createMemoryFileSystem } from 'meld';

// Create an in-memory file system for testing
const memfs = createMemoryFileSystem({
  '/test/file.md': 'This is a test file',
  '/test/data.json': '{"key": "value"}'
});

// Use the custom file system
const { state, output } = await runMeld('path/to/file.meld', {
  fileSystem: memfs
});
```

## Integration Example

Here's a complete example of integrating Meld into an application:

```typescript
import { parseMeld, interpretMeld, InterpreterState } from 'meld';
import * as fs from 'fs';

// Read a Meld file
const content = fs.readFileSync('template.meld', 'utf-8');

try {
  // Parse the content
  const nodes = parseMeld(content);
  
  // Create initial state with user data
  const state = new InterpreterState();
  state.setText('username', 'Alice');
  state.setData('userData', { 
    id: 12345,
    role: 'admin',
    preferences: { theme: 'dark' }
  });
  
  // Interpret the nodes
  const finalState = interpretMeld(nodes, state);
  
  // Get the processed content
  const result = finalState.getContent();
  
  // Output the result
  fs.writeFileSync('output.md', result, 'utf-8');
  console.log('Processing complete!');
  
} catch (error) {
  console.error('Error processing Meld file:', error.message);
}
```