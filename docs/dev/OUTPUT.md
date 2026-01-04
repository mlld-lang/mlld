# Output Rendering Architecture

**Updated: 2025-12-02**

## Overview

mlld uses a unified output rendering system based on **OutputIntent** abstractions that solve multiple issues:
- Fixes extra blank lines (#396) through collapsible break normalization
- Eliminates Prettier dependency and hanging bug (#281)
- Removes magic display formatting (#246 - foundation for explicit control)
- Establishes infrastructure for streaming format adapters

## Core Components

### OutputIntent (`interpreter/output/intent.ts`)

Structured representation of output operations:

```typescript
interface OutputIntent {
  type: IntentType;           // 'content' | 'break' | 'progress' | 'error'
  value: string;              // Content to output
  source: IntentSource;       // 'text' | 'directive' | 'newline' | 'streaming'
  visibility: IntentVisibility; // 'always' | 'optional' | 'never'
  collapsible?: boolean;      // For breaks: can collapse with adjacent breaks
}
```

**Intent Types:**
- **content**: Document text, directive output
- **break**: Whitespace/newlines (can be collapsible)
- **progress**: CLI progress messages (stdout only, not in document)
- **error**: Error output (stderr)

**Helper Functions:**
- `contentIntent(value, source?, visibility?)` - Create content intent
- `breakIntent(value?, collapsible?, source?)` - Create break intent
- `progressIntent(value, visibility?)` - Create progress intent
- `errorIntent(value, source?)` - Create error intent

### OutputRenderer (`interpreter/output/renderer.ts`)

Buffers intents and collapses adjacent breaks using **smart buffering**:

```typescript
class OutputRenderer {
  emit(intent: OutputIntent): void
  render(): void  // Flush pending breaks
  clear(): void   // Reset buffer
}
```

**Smart Buffering Strategy:**
1. **Collapsible breaks**: Buffer for potential collapsing
2. **Non-collapsible breaks**: Flush pending, emit immediately
3. **Content/progress/error**: Flush pending breaks, emit immediately

This preserves real-time streaming while enabling break collapsing.

**Break Collapsing Algorithm:**
```
Input:  [break(coll), break(coll), content, break(coll)]
Output: [break, content, break]  // Adjacent collapsible breaks → single break
```

### Normalizer (`interpreter/output/normalizer.ts`)

Simple line-based normalization that replaces Prettier:

```typescript
function normalizeOutput(output: string): string
```

**Rules:**
1. Strip trailing whitespace per line
2. Collapse 3+ newlines to max 2 (one blank line)
3. Ensure single trailing newline

**Benefits over Prettier:**
- No hanging bug (~0ms vs ~50ms, no process.exit workaround needed)
- No JSON protection hacks
- Self-contained, predictable behavior
- Works with any content type

## Integration Flow

### Document Assembly

```
Interpreter → emitIntent() → OutputRenderer (buffer/collapse)
                                   ↓
                            intentToEffect() converter
                                   ↓
                              emitEffect() → EffectHandler
                                   ↓
                         stdout/stderr/document buffer
```

### Effect Type Mapping

| Intent Type | Effect Type | Routing |
|-------------|-------------|---------|
| `content` | `doc` | Document only |
| `break` | `doc` | Document only |
| `progress` | `stdout` | CLI only (not in document) |
| `error` | `stderr` | Error stream |

**Note**: Directive evaluators (show, run, output) still use `emitEffect` directly with routing types ('both', 'file', etc.).

## Usage Patterns

### Emitting Intents (Interpreter)

```typescript
// Text node
env.emitIntent({
  type: 'content',
  value: text,
  source: 'text',
  visibility: 'always',
  collapsible: false
});

// Newline node (collapsible!)
env.emitIntent({
  type: 'break',
  value: '\n',
  source: 'newline',
  visibility: 'always',
  collapsible: true  // Enables automatic blank line normalization
});

// Or use helpers
env.emitIntent(contentIntent(text));
env.emitIntent(breakIntent());  // Collapsible by default
```

### Document Completion

```typescript
// At end of interpretation
env.renderOutput();  // Flushes any pending breaks
```

## Streaming Compatibility

**Smart buffering preserves streaming:**
- Content intents emit immediately (no delay)
- Progress intents emit immediately
- Only breaks buffer briefly (for look-ahead collapsing)
- Streaming chunks bypass OutputRenderer (go directly to StreamBus → TerminalSink)

**Effect handler** remains separate:
- OutputRenderer handles intent-to-effect conversion
- EffectHandler routes to stdout/stderr/document buffer
- Streaming events use separate StreamBus path

## SDK Integration

The OutputIntent system is internal to the interpreter. SDK consumers interact through:

**Document mode**: Gets normalized final document
**Structured mode**: Gets effects with security metadata
**Stream mode**: Gets real-time events via StreamBus
**Debug mode**: Gets detailed execution trace

Future work: Expose intent stream in StructuredResult for custom rendering.

## Testing

**Unit Tests:**
- `tests/interpreter/output/renderer.test.ts` - OutputRenderer behavior
- `tests/interpreter/output/normalizer.test.ts` - Normalizer rules

**Integration Tests:**
- All fixture tests validate end-to-end output
- Collapsible breaks prevent blank line accumulation
- Normalization ensures consistent whitespace

## Related Files

- `interpreter/output/intent.ts` - Intent types and helpers
- `interpreter/output/renderer.ts` - OutputRenderer and DocumentRenderer
- `interpreter/output/normalizer.ts` - Normalizer utility
- `interpreter/env/Environment.ts` - emitIntent(), intentToEffect()
- `interpreter/core/interpreter.ts` - Text/newline intent emission
- `interpreter/builtin/transformers.ts` - @md transformer uses normalizer

## Migration Notes

**Old System:**
- Direct `emitEffect('doc', content)` calls
- Prettier markdown formatting
- Manual blank line normalization
- Multiple normalization code paths

**New System:**
- Structured `emitIntent()` for document nodes
- Simple line-based normalizer
- Automatic collapsible break handling
- Single normalization path

**Breaking Changes:**
- `@md` transformer now normalizes (doesn't reformat tables/spacing)
- Empty documents get trailing `\n` (from normalizer)
- Blank line behavior more consistent (collapsible breaks)

## Future Work

This establishes infrastructure for:
- **Streaming format adapters** (text/term/json output modes)
- **Universal ANSI support** (`%color%` codes)
- **Visibility flags** (`--show-thinking`, etc.)
- **Explicit formatting control** (addresses #246)

See `todo/plan-streaming-format.md` for streaming adapter roadmap.

## Issues Resolved

- **#396**: Extra blank lines → Fixed by collapsible breaks
- **#281**: JSON protection hack → Eliminated with Prettier
- **#246**: Magic formatting → Foundation for explicit control (partial)
- **Prettier hanging**: Eliminated by removing Prettier entirely

**Labels**: `architecture`, `output-rendering`, `normalization`
