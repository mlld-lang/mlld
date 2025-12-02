---
tags: #arch, #sdk, #resolvers
related-docs: docs/dev/RESOLVERS.md, docs/dev/STREAMING.md
related-code: core/resolvers/types.ts, interpreter/index.ts, sdk/types.ts
---

# DYNAMIC-MODULES

## tldr

Runtime module injection via `dynamicModules` in `interpret`/`processMlld`. `DynamicModuleResolver` sits at highest priority, matches exact keys only, and tags all content as untrusted. Used for multi-tenant context injection without filesystem I/O.

## Principles

- Simple API: `processMlld(template, { dynamicModules: {...} })`
- Resolver-based: `DynamicModuleResolver` with priority 1 (checked first)
- Always tainted: Dynamic content gets `taintLevel: 'untrusted'`
- Override semantics: Dynamic modules shadow filesystem/registry with same path
- Eager resolution: Modules provided upfront, no async fetch

## Implementation

**Resolution order:**
1. DynamicModuleResolver (priority 1)
2. LocalResolver (priority 20)
3. RegistryResolver (priority 10)
4. HTTPResolver (priority 15)

**Entry points:**
- `InterpretOptions.dynamicModules` - Module dictionary
- `ProcessOptions.dynamicModules` - Public API passthrough
- `Environment.registerDynamicModules()` - Registration at interpret time

**Taint handling:**
- Resolver returns `ctx.taint: ['src:dynamic']` and `labels: ['src:dynamic']`
- Import taint derivation treats dynamic resolver content as untrusted input
- Guards can check `@ctx.taint.includes('src:dynamic')` or `@ctx.labels.includes('src:dynamic')`

**SDK integration:**
- Structured mode: Effects from dynamic imports carry security metadata
- Stream mode: Events include taint labels
- Debug mode: `debug:import:dynamic` events with full provenance

## Gotchas

- Content must be valid mlld source (parse errors propagate normally)
- No content type detection (always treated as mlld module)
- Keys are exact match (no fuzzy matching, no extension inference)
- Circular imports between dynamic modules follow normal detection
- Memory only - no caching to disk
