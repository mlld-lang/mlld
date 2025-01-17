# SDK Module Documentation

## Overview
The SDK module provides a clean, programmatic interface for using Meld in other applications. It exposes core functionality like parsing, interpreting, and running Meld content through a well-defined API.

## Architecture

```
+------------------+
|    SDK API       |
+--------+---------+
         |
    +----+----+
    |         |
+---v---+ +---v---+
| parse | | run   |
+-------+ +-------+
```

## Core Components

### Public API
```typescript
import { runMeld, parseMeld, interpretMeld } from '@meld/sdk'
```

### Key Functions

#### `runMeld(options: MeldOptions): Promise<string>`
- Main entry point for processing Meld content
- Handles full pipeline: parse → interpret → convert
- Returns processed output

```typescript
const result = await runMeld({
  input: 'path/to/file.meld',
  format: 'md'
});
```

#### `parseMeld(content: string): MeldNode[]`
- Parses raw Meld content into AST nodes
- Returns array of parsed nodes
- Throws `MeldParseError` on invalid syntax

```typescript
const nodes = parseMeld('@data x = {"value": 42}');
```

#### `interpretMeld(nodes: MeldNode[], options?: InterpretOptions): InterpreterState`
- Interprets parsed nodes
- Manages state and directive execution
- Returns final interpreter state

```typescript
const state = interpretMeld(nodes, {
  workingDirectory: process.cwd()
});
```

## Configuration

### MeldOptions
```typescript
interface MeldOptions {
  input: string;              // Input file path or content
  format?: 'md' | 'llm';      // Output format
  workingDirectory?: string;  // Base directory for relative paths
  logger?: Logger;           // Custom logger implementation
}
```

### InterpretOptions
```typescript
interface InterpretOptions {
  workingDirectory?: string;
  initialState?: InterpreterState;
  mode?: 'toplevel' | 'rightside';
}
```

## Error Handling
- All errors extend `MeldError`
- Typed errors for different scenarios:
  - `MeldParseError`
  - `MeldInterpretError`
  - `MeldDirectiveError`
- Location tracking in errors

## Logging
- Configurable logging system
- Default Winston logger
- Custom logger support
- Debug and error levels

## Examples

### Basic Usage
```typescript
import { runMeld } from '@meld/sdk';

async function processMeld() {
  const result = await runMeld({
    input: './input.meld',
    format: 'md'
  });
  console.log(result);
}
```

### Custom Logger
```typescript
import { runMeld } from '@meld/sdk';
import { createLogger } from 'winston';

const logger = createLogger({
  // custom configuration
});

await runMeld({
  input: './input.meld',
  logger
});
```

### Advanced Usage
```typescript
import { parseMeld, interpretMeld } from '@meld/sdk';

const nodes = parseMeld(content);
const state = interpretMeld(nodes, {
  workingDirectory: __dirname,
  mode: 'toplevel'
});
```

## Troubleshooting

### Common Issues
- **"File not found"**
  - Solution: Verify file paths and working directory
- **"Invalid syntax"**
  - Solution: Check Meld content format
- **"Logger configuration error"**
  - Solution: Verify logger setup

### Debugging Tips
1. Enable debug logging
2. Check file paths
3. Verify input content
4. Review error stack traces

## References
- [Architecture Overview](../../../docs/ARCHITECTURE.md)
- [CLI Documentation](../../cli/__docs__/README.md)
- [Interpreter Documentation](../../interpreter/__docs__/README.md) 