# Effects & Document Generation Architecture

*Updated: 2025-11-28*

## Overview

The mlld effects system handles output during document execution, providing real-time streaming for CLI users and complete document generation for API consumers. SDK v2 adds structured effect collection with security metadata for programmatic consumption.

## Core Concepts

### Effect Types

The system defines 5 effect types in `interpreter/env/EffectHandler.ts`:

1. **`'doc'`** - Document content (markdown text, headers, paragraphs)
2. **`'both'`** - Content that appears in both CLI output and final document (from `/show` directives)  
3. **`'stdout'`** - CLI-only output (bypasses document)
4. **`'stderr'`** - Error output
5. **`'file'`** - File output (from `/output` directives)

### Guard Compatibility

After-guards require non-streaming execution because streaming emits effects immediately and cannot retract them. `guard-post-hook` blocks any directive or executable that has after-timed guards when streaming is enabled; disable streaming in `with { stream: false }` or move validation to before-guards when streaming is required.

### Architecture Components

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Interpreter   │───▶│  Effect Handler  │───▶│   CLI/API       │
│                 │    │                  │    │   Output        │
│ • Plain text    │    │ • Document buffer│    │                 │
│ • /show dirs    │    │ • Streaming      │    │ • Real-time     │
│ • /run commands │    │ • Effect routing │    │ • Final doc     │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## Current Implementation

### Effect Emission (`interpreter/core/interpreter.ts:219-289`)

The interpreter emits effects during evaluation:

```typescript
// Plain markdown text → 'doc' effects
if (isText(n)) {
  env.emitEffect('doc', n.content);
} else if (isNewline(n)) {
  env.emitEffect('doc', '\n');
}
```

### Effect Handler (`interpreter/env/EffectHandler.ts:31-89`)

The `DefaultEffectHandler` processes effects:

```typescript
handleEffect(effect: Effect): void {
  switch (effect.type) {
    case 'doc':
      // Only append to document buffer
      this.documentBuffer.push(effect.content);
      break;
      
    case 'both':
      // Write to stdout if streaming
      if (this.streamingEnabled) {
        process.stdout.write(effect.content);
      }
      // Always append to document
      this.documentBuffer.push(effect.content);
      break;
  }
}
```

`'file'` effects now include a `mode` flag. When `mode === 'append'`, the handler only records metadata because the evaluator already appended the payload. Overwrite operations (`mode === 'write'` or undefined) continue to sync the document buffer to disk for compatibility with legacy workflows.

### Document Retrieval (`interpreter/index.ts:286-288`)

The final document is assembled from the effect handler:

```typescript
if (effectHandler && typeof effectHandler.getDocument === 'function') {
  output = effectHandler.getDocument();
}
```

## Current Problem

**Issue**: Plain markdown content doesn't appear in CLI output during streaming, only directive outputs do.

**Root Cause**: `'doc'` effects only go to the document buffer, never stream to stdout. This breaks the user experience where content should appear progressively in document order.

**Example**: 
```markdown
# Header
/show "Result"
```

**Current CLI output:**
```
Result
```

**Expected CLI output:**
```
# Header
Result
```

## Desired Architecture

### Real-Time Streaming Behavior

For optimal UX during LLM scripting, content should appear **progressively in document order**:

1. **Markdown content** streams immediately when processed
2. **Directive outputs** stream immediately when executed  
3. **Everything appears in natural reading order**

This is critical for long-running scripts with multiple LLM calls where users need to see progress.

### Dual-Mode Operation

The system should support both:

- **Streaming Mode** (CLI): Real-time output + document buffer
- **Document Mode** (API/files): Complete document from buffer only

### Effect Type Behavior (Desired)

| Effect Type | CLI Streaming | Document Buffer | Use Case |
|-------------|---------------|-----------------|----------|
| `'doc'`     | ✅ Yes        | ✅ Yes          | Markdown text |
| `'both'`    | ✅ Yes        | ✅ Yes          | `/show` output |
| `'stdout'`  | ✅ Yes        | ❌ No           | CLI-only messages |
| `'stderr'`  | ✅ Yes        | ❌ No           | Error output |
| `'file'`    | ❌ No         | ❌ No           | File writes happen inside directives; effect metadata exposes `mode` (`write` or `append`) |

### Append Directive

- `/append` mirrors `/output`'s source resolution but always targets files and enforces newline-delimited writes.
- `.jsonl` targets must receive valid JSON; `.json` targets are blocked to avoid corrupt objects.
- Both the directive and the pipeline `| append` operator append through `IFileSystemService.appendFile()` and emit a `'file'` effect with `mode: 'append'` so handlers can observe writes without duplicating them.
- `IFileSystemService` implementations must provide `appendFile()` in addition to `writeFile()` so evaluators and builtin pipeline effects can perform the actual writes; the effect handler is notification-only for append operations.

## Implementation Plan

### 1. Fix Effect Handler

Update `DefaultEffectHandler.handleEffect()` to stream `'doc'` effects:

```typescript
case 'doc':
  // Write to stdout if streaming (for real-time display)
  if (this.streamingEnabled) {
    process.stdout.write(effect.content);
  }
  // Always append to document
  this.documentBuffer.push(effect.content);
  break;
```

### 2. Maintain Backward Compatibility

- Tests using API should continue to pass (they use document buffer)
- CLI behavior improves to match expected UX
- No breaking changes to existing integrations

### 3. Configuration Options

Support streaming control via:
- Constructor option: `new DefaultEffectHandler({ streaming: false })`
- Environment variables: `MLLD_STREAMING=false` or `MLLD_NO_STREAMING=true`

## Testing Strategy

### CLI Tests
- Verify markdown content appears in real-time
- Verify content appears in document order
- Verify directive outputs still work

### API Tests  
- Verify existing tests continue to pass
- Verify `getDocument()` returns complete document
- Verify no regression in document generation

### Integration Tests
- Test long-running scripts with mixed content
- Test LLM workflows with progressive output
- Test file output workflows

## SDK v2 Effect Collection

When `interpret()` uses `mode: 'structured'`, `'stream'`, or `'debug'`, effects are logged with metadata:

```typescript
interface StructuredEffect extends Effect {
  capability?: CapabilityContext;  // What the effect can do
  security?: SecurityDescriptor;   // Labels, taint level, sources
  provenance?: SecurityDescriptor; // Origin chain (when provenance: true)
}
```

Enable via `recordEffects: true` in InterpretOptions (automatically set for non-document modes).

### Effect Events

In stream/debug modes, effects emit SDK events:

```typescript
handle.on('effect', (event) => {
  console.log(event.effect.type, event.effect.content);
  console.log('Security:', event.effect.security?.labels);
});
```

Security metadata is always present. Provenance is included when `provenance: true` or in debug mode.

## Related Files

- `interpreter/env/EffectHandler.ts` - Core effect handling, `recordEffects` flag
- `sdk/types.ts` - StructuredEffect, SDK event types
- `sdk/execution-emitter.ts` - Event emission bridge
- `interpreter/index.ts` - Mode handling, structured result building
- `cli/execution/FileProcessor.ts` - CLI flag → mode mapping

## SDK v2 Changes

- `DefaultEffectHandler` accepts `recordEffects` option to log effects
- `getEffects()` returns collected effects with security metadata
- Effects emit SDK events when emitter attached
- Structured mode returns `{ output, effects, exports, environment }`
- Security metadata (labels, taint, sources) always included
- Provenance chain included when requested
