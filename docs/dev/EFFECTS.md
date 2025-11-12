# Effects & Document Generation Architecture

## Overview

The mlld effects system is responsible for handling output during document execution, providing both real-time streaming for CLI users and complete document generation for API consumers and file output.

## Core Concepts

### Effect Types

The system defines 5 effect types in `interpreter/env/EffectHandler.ts`:

1. **`'doc'`** - Document content (markdown text, headers, paragraphs)
2. **`'both'`** - Content that appears in both CLI output and final document (from `/show` directives)  
3. **`'stdout'`** - CLI-only output (bypasses document)
4. **`'stderr'`** - Error output
5. **`'file'`** - File output (from `/output` directives)

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

## Related Files

- `interpreter/env/EffectHandler.ts` - Core effect handling
- `interpreter/core/interpreter.ts` - Effect emission  
- `interpreter/index.ts` - Document assembly
- `cli/index.ts` - CLI output handling
- Tests in `tests/cases/valid/` - Validation examples

## Migration Notes

This change improves UX without breaking existing functionality:

- **API users**: No change, continue using `getDocument()`
- **CLI users**: Better real-time experience  
- **File output**: No change, uses document buffer
- **Existing tests**: Should continue to pass

The architecture supports the core mlld use case: progressive LLM scripting where users need immediate feedback as their workflows execute.
