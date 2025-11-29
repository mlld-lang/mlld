# SDK Usage

## tldr

```typescript
import { processMlld } from 'mlld';

const result = await processMlld('/var @name = "World"\nHello, @name!');
console.log(result); // "Hello, World!"
```

## Basic Usage

Process mlld content and get the output:

```typescript
import { processMlld } from 'mlld';

const script = `
/var @greeting = "Hello"
/show @greeting
`;

const output = await processMlld(script);
console.log(output); // "Hello"
```

With a file path for imports:

```typescript
const output = await processMlld(script, {
  filePath: './scripts/my-script.mld'
});
```

## Execution Modes

The SDK supports four execution modes for different use cases.

### Document Mode (Default)

Returns plain text output:

```typescript
const output = await processMlld(script);
// Returns: string
```

### Structured Mode

Returns output with effects, exports, and metadata:

```typescript
import { interpret } from 'mlld/interpreter';

const result = await interpret(script, {
  mode: 'structured',
  fileSystem,
  pathService
});

console.log(result.output);     // Final text
console.log(result.effects);    // All effects with security metadata
console.log(result.exports);    // Exported variables
console.log(result.environment); // Full environment
```

Each effect includes security metadata:

```typescript
result.effects.forEach(effect => {
  console.log(effect.type);              // 'doc', 'both', 'file'
  console.log(effect.security?.labels);  // ['secret', 'pii']
  console.log(effect.security?.taintLevel);
});
```

### Stream Mode

Returns a handle for real-time event consumption:

```typescript
import { interpret } from 'mlld/interpreter';

const handle = interpret(script, {
  mode: 'stream',
  fileSystem,
  pathService
});

// Attach handlers before execution completes
handle.on('stream:chunk', (event) => {
  process.stdout.write(event.event.text);
});

handle.on('effect', (event) => {
  console.log('Effect:', event.effect.type);
});

handle.on('execution:complete', (event) => {
  console.log('Done');
});

// Wait for completion
await handle.done();

// Or get the structured result
const result = await handle.result();
```

Handle methods:

| Method | Returns | Description |
|--------|---------|-------------|
| `.on(type, handler)` | void | Subscribe to events |
| `.off(type, handler)` | void | Unsubscribe |
| `.once(type, handler)` | void | One-time handler |
| `.done()` | `Promise<void>` | Resolves on completion |
| `.result()` | `Promise<StructuredResult>` | Get final result |
| `.isComplete()` | boolean | Check if finished |
| `.abort()` | void | Cancel execution |

Event types:

- `stream:chunk` - Streaming output chunks
- `stream:progress` - Pipeline progress updates
- `command:start` / `command:complete` - Command execution
- `effect` - Effect emissions
- `execution:complete` - Script finished

### Debug Mode

Returns full execution trace for debugging:

```typescript
import { interpret } from 'mlld/interpreter';

const result = await interpret(script, {
  mode: 'debug',
  fileSystem,
  pathService
});

console.log(result.ast);        // Parsed AST
console.log(result.variables);  // All variables (not just exports)
console.log(result.trace);      // Ordered event trace
console.log(result.durationMs); // Execution time
```

The trace includes every operation:

```typescript
result.trace.forEach(event => {
  switch (event.type) {
    case 'debug:directive:start':
      console.log(`Starting: ${event.directive}`);
      break;
    case 'debug:variable:create':
      console.log(`Created: ${event.name}`);
      break;
    case 'debug:guard:before':
      console.log(`Guard: ${event.guard} → ${event.decision}`);
      break;
  }
});
```

## Provenance Tracking

Track where data comes from with the `provenance` option:

```typescript
const result = await interpret(script, {
  mode: 'structured',
  provenance: true,
  fileSystem,
  pathService
});

result.effects.forEach(effect => {
  console.log(effect.provenance); // Origin chain
});
```

Debug mode includes provenance by default.

## Dynamic Modules

Inject modules at runtime without writing files:

```typescript
import { processMlld } from 'mlld';

const result = await processMlld(template, {
  dynamicModules: {
    '@user/context': `/export
@userId = "123"
@userName = "Alice"`,
    '@project/settings': `/export
@projectId = "456"`
  }
});
```

Use case: Multi-tenant apps that fetch context from databases.

The template imports as usual:

```mlld
/import @user/context
/import @project/settings

Hello @userName! Project: @projectId
```

Dynamic modules:
- Are checked first (override filesystem/registry)
- Are automatically marked as tainted
- Appear in debug traces with full provenance

## Error Handling

```typescript
import { processMlld, MlldError, formatError } from 'mlld';

try {
  await processMlld(script);
} catch (error) {
  if (error instanceof MlldError) {
    const formatted = await formatError(error, {
      useSmartPaths: true,
      basePath: process.cwd()
    });

    console.error(formatted.formatted); // Human-readable
    console.error(formatted.json);      // Structured data
  }
}
```

## Options Reference

### ProcessOptions

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `format` | `'markdown' \| 'xml'` | `'markdown'` | Output format |
| `filePath` | string | - | File path for import resolution |
| `pathContext` | PathContext | - | Explicit path context |
| `fileSystem` | IFileSystemService | NodeFileSystem | Custom filesystem |
| `pathService` | IPathService | PathService | Custom path service |
| `normalizeBlankLines` | boolean | true | Normalize blank lines |
| `useMarkdownFormatter` | boolean | true | Use prettier |
| `dynamicModules` | Record<string, string> | - | Runtime modules |

### InterpretOptions (Advanced)

For direct `interpret()` calls, additional options:

| Option | Type | Description |
|--------|------|-------------|
| `mode` | `'document' \| 'structured' \| 'stream' \| 'debug'` | Execution mode |
| `provenance` | boolean | Include provenance chains |
| `streaming` | StreamingOptions | Streaming configuration |
| `emitter` | ExecutionEmitter | Custom event emitter |

## See Also

- [CLI Usage](cli.md) - Command line interface
- [Modules](modules.md) - Import system
- [Security](security.md) - Guards and taint tracking
