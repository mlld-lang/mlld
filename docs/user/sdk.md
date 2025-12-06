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
  console.log(effect.security?.labels);  // Explicit labels: ['secret', 'pii']
  console.log(effect.security?.taint);   // Accumulated: ['secret', 'pii', 'src:exec', 'src:file']
  console.log(effect.security?.sources); // Origin chain: ['file://...', 'resolver:registry']
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

Runtime module injection without filesystem I/O. Enables multi-tenant applications to inject per-user/project context from database.

### String Modules

Inject mlld source as strings:

```typescript
const result = await processMlld(template, {
  dynamicModules: {
    '@user/context': `/export { @userId, @userName }\n/var @userId = "123"\n/var @userName = "Alice"`
  }
});
```

### Object Modules

Inject structured data directly (recommended):

```typescript
const result = await processMlld(template, {
  dynamicModules: {
    '@state': {
      count: 0,
      messages: ['Hello', 'World'],
      preferences: { theme: 'dark' }
    },
    '@payload': {
      text: userInput,
      userId: session.userId
    }
  }
});
```

In your script:

```mlld
/var @count = @state.count + 1
/var @theme = @state.preferences.theme
/var @input = @payload.text
```

### Security

All dynamic modules are automatically labeled `src:dynamic`:

```typescript
result.effects.forEach(effect => {
  console.log(effect.security?.taint);  // ['src:dynamic', ...]
});
```

Guards can enforce policies on dynamic data:

```mlld
/guard before secret = when [
  @input.ctx.taint.includes('src:dynamic') =>
    deny "Cannot use dynamic data as secrets"
  * => allow
]
```

#### Custom Source Labels

Add an additional source label to distinguish between different types of dynamic modules:

```typescript
const result = await processMlld(template, {
  dynamicModules: {
    '@upload': userUploadedFile
  },
  dynamicModuleSource: 'user-upload'
});

// Modules now have both labels: ['src:dynamic', 'src:user-upload']
```

This enables fine-grained guard policies:

```mlld
// Block user-uploaded data from dangerous operations
/guard before fileWrite = when [
  @input.ctx.labels.includes('src:user-upload') =>
    deny "User uploads cannot be written to filesystem"
  * => allow
]

// Allow trusted database content through
/guard before apiCall = when [
  @input.ctx.labels.includes('src:user-upload') =>
    deny "User data cannot call external APIs"
  @input.ctx.labels.includes('src:dynamic') =>
    allow
  * => allow
]
```

Common source labels:
- `'user-upload'` - Data from user file uploads
- `'user-input'` - Data from form submissions
- `'database'` - Data from your database
- `'external-api'` - Data from third-party APIs
- `'cache'` - Data from cache layer

### Notes

- Keys are exact matches (no extension inference or fuzzy matching)
- Dynamic modules override filesystem/registry modules (highest priority)
- Object modules serialize to per-key exports internally
- Content parsed at injection time (errors surface immediately)

## State Management

Track state changes via the `state://` protocol instead of filesystem writes.

### State Write Protocol

```mlld
/var @count = @state.count + 1
/output @count to "state://count"

/var @prefs = { theme: "dark", lang: "en" }
/output @prefs to "state://preferences"
```

State writes are captured in the result:

```typescript
const result = await interpret(script, {
  mode: 'structured',
  dynamicModules: {
    '@state': { count: 0 }
  }
});

console.log(result.stateWrites);
// [
//   {
//     path: 'count',
//     value: 1,
//     timestamp: '2025-01-27T...',
//     security: { labels: [], taint: ['src:dynamic'], ... }
//   }
// ]
```

### Persisting State

Your application handles persistence:

```typescript
for (const write of result.stateWrites) {
  await database.setState(write.path, write.value);
}
```

### Nested Paths

```mlld
/output "dark" to "state://prefs.theme"
```

Captured as `{ path: 'prefs.theme', value: 'dark' }`.

### Security

State writes include security metadata:

```typescript
write.security?.labels;  // Explicit labels like 'secret', 'pii'
write.security?.taint;   // Accumulated labels including automatic ones
```

Use guards to prevent sensitive data in state:

```mlld
/guard before op:output = when [
  @ctx.op.target.startsWith('state://') &&
  @input.ctx.labels.includes('secret') =>
    deny "Secrets cannot be persisted to state"
  * => allow
]
```

## File-Based Execution

Execute mlld files with in-memory caching and state management.

### Basic Usage

```typescript
import { execute } from 'mlld';

const result = await execute('./agent.mld',
  { text: 'user input', userId: '123' },
  {
    state: { count: 0, messages: [] },
    timeout: 30000
  }
);

console.log(result.value);        // Final output
console.log(result.stateWrites);  // State updates
console.log(result.effects);      // All effects
console.log(result.metrics);      // Performance data
```

### State Hydration

State injected via `@state` module, payload via `@payload`:

```mlld
/var @count = @state.count + 1
/var @history = @state.messages
/var @input = @payload.text
/var @userId = @payload.userId
```

### AST Caching

In-memory cache with mtime-based invalidation:

```typescript
// First call parses the file
await execute('./agent.mld', payload);

// Second call uses cached AST (unless file changed)
await execute('./agent.mld', payload);
```

Cache invalidates automatically when file is modified.

### Timeout and Cancellation

```typescript
const controller = new AbortController();

const promise = execute('./agent.mld', payload, {
  timeout: 30000,  // 30 second timeout
  signal: controller.signal
});

// Cancel if needed
controller.abort();
```

Timeout throws `TimeoutError` with partial results available.

### Metrics

```typescript
console.log(result.metrics);
// {
//   totalMs: 1234,
//   parseMs: 5,
//   evaluateMs: 1229,
//   cacheHit: true,
//   effectCount: 10,
//   llmCallCount: 2,
//   llmTokensIn: 500,
//   llmTokensOut: 200,
//   guardEvaluations: 5
// }
```

### Multi-Tenant Pattern

```typescript
async function handleUserMessage(userId: string, message: string) {
  // Load per-user state from database
  const state = await loadUserState(userId);

  // Execute with user context
  const result = await execute('./agents/chat.mld',
    { text: message, userId },
    { state, timeout: 30000 }
  );

  // Persist state updates
  for (const write of result.stateWrites) {
    await saveUserState(userId, write.path, write.value);
  }

  return result.value;
}
```

### Dynamic Module Injection

Inject additional runtime data beyond `@state` and `@payload`:

```typescript
const result = await execute('./process.mld',
  { text: 'user input' },
  {
    state: { count: 0 },
    dynamicModules: {
      '@config': appConfig,
      '@features': featureFlags
    }
  }
);
```

With custom source labels for security policies:

```typescript
const result = await execute('./upload-handler.mld',
  userUploadedFile,
  {
    dynamicModules: {
      '@upload': userUploadedFile
    },
    dynamicModuleSource: 'user-upload'
  }
);

// Module will have labels: ['src:dynamic', 'src:user-upload']
// Guards can enforce policies based on the source
```

## Static Analysis

Extract metadata without execution using `analyzeModule`:

```typescript
import { analyzeModule } from 'mlld';

const analysis = await analyzeModule('./tools/github.mld');

// Check validity
if (!analysis.valid) {
  console.error('Parse errors:', analysis.errors);
  return;
}

// Discover exported functions
const exportedTools = analysis.executables
  .filter(e => analysis.exports.includes(e.name));

console.log('Tools:', exportedTools.map(e => e.name));
// ['createIssue', 'listPRs', 'mergePR']

// Check security labels
const networkFunctions = analysis.executables
  .filter(e => e.labels.some(l => l.startsWith('net:')));

console.log('Network functions:', networkFunctions.map(e => e.name));

// Get capabilities
console.log('Needs:', analysis.needs);
// { cmd: ['git', 'gh'], node: ['@octokit/rest'] }

console.log('Wants:', analysis.wants);
// [{ tier: 'full', ... }, { tier: 'minimal', ... }]

// Get guards
console.log('Guards:', analysis.guards);
// [{ name: 'preventSecretsInLogs', timing: 'before', label: 'secret' }]
```

### Use Cases

- **MCP proxy**: Discover tools from modules for tool registration
- **Module registry**: Validate exports, check capability requirements
- **IDE/LSP**: Autocomplete, go-to-definition, hover information
- **Security auditing**: Find network functions without guards, check label coverage
- **Documentation**: Generate API docs from executable signatures

### Analysis Result

```typescript
interface ModuleAnalysis {
  filepath: string;
  valid: boolean;
  errors: AnalysisError[];
  warnings: AnalysisWarning[];

  // Metadata
  frontmatter?: Record<string, unknown>;
  needs?: ModuleNeeds;
  wants?: WantsTier[];

  // Definitions
  executables: ExecutableInfo[];
  guards: GuardInfo[];
  variables: VariableInfo[];
  imports: ImportInfo[];
  exports: string[];

  // Stats
  stats: ModuleStats;

  // AST (lazy-loaded)
  ast?: () => AST;
}
```

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
| `dynamicModules` | Record<string, string \| object> | - | Runtime module injection (strings or structured objects) |

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
