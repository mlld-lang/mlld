---
updated: 2025-01-27
tags: #arch, #sdk
related-docs: docs/dev/STREAMING.md, docs/dev/EFFECTS.md, docs/dev/DYNAMIC-MODULES.md
related-code: sdk/types.ts, sdk/execute.ts, interpreter/index.ts
---

# SDK

## tldr

SDK provides execution modes (document/structured/stream/debug), runtime module injection (dynamicModules), state management (state:// protocol), and programmatic execution (execute, analyzeModule). Built on ExecutionEmitter event bridge and StructuredResult format.

## Principles

- Mode selection at API boundary (consumer controls consumption, script controls execution)
- Security-first (all effects carry metadata, dynamic modules auto-tainted)
- Single stdout writer (no double-printing, progress to stderr)
- Structured results reusable (stream/debug build on structured)
- Events are ordered and timestamped

## Details

**Entry points**:
- `processMlld(script, options)` - Simple API, returns string
- `interpret(script, options)` - Full control, mode selection
- `execute(filepath, payload, options)` - File-based execution
- `analyzeModule(filepath, options)` - Static analysis

**Core types**: InterpretMode, StructuredResult, DebugResult, StreamExecution, SDKEvent, StateWrite

**Event bridge**: ExecutionEmitter subscribes to StreamBus, emits SDK events with security context

**Effect collection**: DefaultEffectHandler.recordEffects flag enables structured collection

**State management**: state:// protocol captures updates without filesystem writes; @state is a live snapshot during a run (writes mutate the in-run snapshot) and stateWrites describe what to persist

## Architecture

### Execution Modes

```
┌─────────────┐
│   Script    │
└──────┬──────┘
       │
       ▼
┌──────────────┐    Mode Selection
│  interpret() │──────────────┐
└──────────────┘              │
                              │
       ┌──────────────────────┼──────────────────────┐
       │                      │                      │
       ▼                      ▼                      ▼
┌─────────────┐    ┌─────────────────┐    ┌──────────────────┐
│  document   │    │   structured     │    │     stream        │
│             │    │                 │    │                  │
│  → string   │    │ → { output,     │    │ → StreamExecution│
│             │    │     effects,    │    │   handle with    │
│             │    │     exports,    │    │   .on() events   │
│             │    │     stateWrites,│    │                  │
│             │    │     metrics }   │    │                  │
└─────────────┘    └─────────────────┘    └──────────────────┘
                              │
                              ▼
                   ┌──────────────────┐
                   │      debug       │
                   │                  │
                   │ → { ...structured,│
                   │     ast,         │
                   │     variables,   │
                   │     trace }      │
                   └──────────────────┘
```

### Dynamic Modules

```
DynamicModuleResolver (priority 1)
        │
        ├─ String input → parse → AST
        ├─ Object input → serialize → parse → AST
        │
        └─ Add ctx: { taint: ['src:dynamic'], labels: ['src:dynamic'] }
                │
                ▼
        deriveImportTaint()
                │
                ▼
        Variables labeled 'src:dynamic'
```

Priority order: Dynamic (1) → ProjectPath (10) → Registry (15) → HTTP/Local (20)

### State Management

```
Script:                 Runtime:
┌──────────────┐       ┌────────────────────┐
│ /output @val │       │ Environment        │
│ to "state://"│──────▶│   .emit('state_write')│
└──────────────┘       └────────┬───────────┘
                                │
                                ▼
                       ┌────────────────────┐
                       │ StateWrite[]       │
                       │  { path, value,    │
                       │    timestamp,      │
                       │    security }      │
                       └────────┬───────────┘
                                │
                                ▼
                       ┌────────────────────┐
                       │ StructuredResult   │
                       │  .stateWrites      │
                       └────────┬───────────┘
                                │
                                ▼
                       ┌────────────────────┐
                       │ Live @state        │
                       │  (snapshot updates │
                       │   during run)      │
                       └────────────────────┘
```

Application persists state; runtime only captures writes.

**Live snapshot rules**:
- `@state` is injected as a dynamic module (literal strings, no interpolation).
- `/output ... to state://path` mutates the in-run `@state` snapshot so subsequent `@state` reads/imports see the new value.
- Persistence is out-of-band via `stateWrites`; pass the saved state back on the next `execute()` call.

### Event System

```
Executor (shell/node/bash)
        │
        ├─ CHUNK events
        └─ PIPELINE/STAGE events
                │
                ▼
        StreamBus (central hub)
                │
                ▼
        ExecutionEmitter (SDK bridge)
                │
                ├─ CHUNK → stream:chunk
                ├─ PIPELINE_* → stream:progress
                ├─ STAGE_* → command:start/complete
                └─ effect emissions → effect event
                        │
                        ▼
                StreamExecution.on() handlers
```

### execute Flow

```
execute(filepath, payload, options)
        │
        ├─ Check MemoryASTCache (mtime-based)
        │   ├─ Hit: use cached AST
        │   └─ Miss: parse file, cache with mtime
        │
        ├─ Build dynamicModules:
        │   ├─ '@payload': payload object
        │   └─ '@state': options.state object
        │
        ├─ Call interpret(mode: 'structured')
        │
        └─ Return ExecuteResult:
            ├─ value (output)
            ├─ stateWrites (captured writes)
            ├─ effects (all operations)
            └─ metrics (timing, counts, tokens)
```

### analyzeModule Flow

```
analyzeModule(filepath)
        │
        ├─ Parse file to AST
        │   ├─ Success: valid = true
        │   └─ Error: valid = false, errors = [...]
        │
        ├─ Extract metadata:
        │   ├─ Frontmatter (YAML)
        │   ├─ /needs directives
        │   ├─ /wants directives
        │   └─ /export directives
        │
        ├─ Walk AST:
        │   ├─ Executables (/exe) → { name, params, labels }
        │   ├─ Guards (/guard) → { name, timing, label }
        │   ├─ Variables (/var) → { name, type }
        │   └─ Imports (/import) → { from, names }
        │
        └─ Return ModuleAnalysis (no execution)
```

## Gotchas

- `mode: 'stream'` returns handle, not Promise (attach handlers before execution completes)
- Dynamic modules override filesystem/registry (highest priority)
- State writes don't persist (app must handle stateWrites)
- Debug mode disables streaming (captures full trace instead)
- Effects include security metadata only in structured/stream/debug modes
- Object modules have size limits (1MB, 10 depth, 1000 keys/arrays)
- execute caches ASTs in-memory (process lifetime, not persistent)

## Debugging

**Check mode selection**:
```typescript
const result = await interpret(script, { mode: 'debug' });
console.log(result.trace);  // Full execution history
```

**Inspect effects**:
```typescript
const result = await interpret(script, { mode: 'structured' });
result.effects.forEach(e => {
  console.log(e.type, e.security?.taint);
});
```

**Monitor streaming**:
```typescript
const handle = interpret(script, { mode: 'stream' });
handle.on('stream:chunk', e => console.log('CHUNK:', e.text));
handle.on('effect', e => console.log('EFFECT:', e.effect.type));
```

**Analyze without execution**:
```typescript
const analysis = await analyzeModule('./module.mld');
if (!analysis.valid) {
  console.error('Parse errors:', analysis.errors);
}
```
