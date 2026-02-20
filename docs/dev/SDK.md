---
updated: 2026-02-18
tags: #arch, #sdk, #dynamic-modules
related-docs: docs/dev/STREAMING.md, docs/dev/RESOLVERS.md, docs/dev/INTERPRETER.md
related-code: sdk/index.ts, sdk/execute.ts, sdk/cache/memory-ast-cache.ts, sdk/execution-emitter.ts, sdk/types.ts, interpreter/index.ts, interpreter/env/Environment.ts, core/resolvers/DynamicModuleResolver.ts
related-types: sdk/types { StructuredResult, StreamExecution, SDKEvent, StreamingResult }, core/resolvers/DynamicModuleResolver { DynamicModuleOptions }
---

# SDK

## tldr

- SDK/runtime entrypoints are `processMlld(...)`, `execute(...)`, `analyzeModule(...)`, and interpreter `interpret(...)`.
- `execute(...)` injects runtime data via dynamic modules (`@payload`, optional `@state`).
- AST caching is content-based (`source` equality), keyed by `filePath:mode`.
- `ExecutionEmitter` is an event hub only; StreamBus subscription is wired by `Environment.enableSDKEvents(...)`.
- Dynamic modules are always tainted with `src:dynamic` (plus optional source label) and enforce strict object-size limits.

## Principles

- Keep SDK APIs mode-driven (`document`, `structured`, `stream`, `debug`).
- Keep runtime event transport separate from user callback dispatch.
- Keep dynamic-module injection explicit and security-labeled.
- Keep wrappers thin over canonical CLI/runtime behavior.

## Details

### Entry Points

- `sdk/index.ts`
  - `processMlld(content, options?)`
  - exports `execute`, `analyzeModule`, `ExecutionEmitter`, `StreamExecution`
- `sdk/execute.ts`
  - `execute(filePath, payload, options?)` for structured/stream execution with metrics.
- `sdk/analyze.ts`
  - `analyzeModule(...)` for static module analysis without runtime execution.

### `execute(...)` Flow (SDK)

Source: `sdk/execute.ts`, `sdk/cache/memory-ast-cache.ts`.

1. Resolve parse mode and read source.
2. Query `MemoryAstCache`.
   - Cache key: ``${filePath}:${mode}``
   - Cache hit requires `cached.source === currentSource`.
3. Build `dynamicModules`:
   - merge `options.dynamicModules`
   - inject `@payload` from `payload` argument
   - inject `@state` from `options.state` when provided
4. Call `interpret(...)` in `structured` or `stream` mode.
5. Return `StructuredResult` or `StreamExecution` with SDK metrics enrichment.

### Event Bridge Architecture

Source: `sdk/execution-emitter.ts`, `interpreter/env/Environment.ts`.

- `ExecutionEmitter` provides `on/off/once/emit` only.
- It does not subscribe to `StreamBus` directly.
- StreamBus bridging happens in environment:
  - `Environment.enableSDKEvents(emitter)`
  - root environment subscribes to `StreamBus`
  - stream/stage events are mapped to SDK events (`stream:*`, `command:*`) and emitted through `ExecutionEmitter`.

### Dynamic Modules (SDK-Facing Behavior)

Source: `sdk/execute.ts`, `interpreter/index.ts`, `interpreter/env/Environment.ts`, `core/resolvers/DynamicModuleResolver.ts`.

- Dynamic modules are passed via `InterpretOptions.dynamicModules` / SDK `ExecuteOptions.dynamicModules`.
- `execute(...)` always injects `@payload`; it injects `@state` when `options.state` is provided.
- Interpreter registration splits modules:
  - `@payload` and `@state` register with `literalStrings: true`
  - other dynamic modules register with default serialization mode
- Dynamic modules are resolved by `DynamicModuleResolver` (resolver name `dynamic`).
- Resolver metadata labels/taint include:
  - `src:dynamic`
  - optional `src:<dynamicModuleSource>` when provided

### Dynamic Object-Module Limits

Source: `core/resolvers/DynamicModuleResolver.ts`.

- max serialized module size: `1MB`
- max depth: `10`
- max keys per object: `1000`
- max elements per array: `1000`
- max total nodes: `10000`

### `@state` Runtime Snapshot Semantics

Source: `interpreter/env/Environment.ts`.

- When `@state` is injected, runtime tracks a mutable in-run snapshot.
- `state://` writes update the in-run snapshot for subsequent reads during that run.
- Persistence remains application-owned via `StructuredResult.stateWrites`.

### Language Wrappers

SDK wrappers exist in:

- `sdk/go/`
- `sdk/python/`
- `sdk/ruby/`
- `sdk/rust/`

## Gotchas

- `mode: 'stream'` returns `StreamExecution`, not `Promise<StructuredResult>`.
- Dynamic modules use exact key matching (`@name` must match resolver key exactly).
- SDK AST cache is process-memory only.
- Dynamic modules are untrusted by default (`src:dynamic` taint/labels).
