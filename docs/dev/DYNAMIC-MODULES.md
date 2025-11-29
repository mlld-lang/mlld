---
updated: 2025-11-28
tags: #arch, #sdk, #resolvers
related-docs: docs/dev/RESOLVERS.md, docs/dev/STREAMING.md, docs/user/sdk.md
related-code: core/resolvers/DynamicModuleResolver.ts, interpreter/index.ts, sdk/types.ts
---

# DYNAMIC-MODULES

## tldr

Runtime module injection via `dynamicModules` option. Implemented as highest-priority resolver. All dynamic content auto-tainted. Used for multi-tenant context injection without filesystem I/O.

## Principles

- Simple API: `processMlld(template, { dynamicModules: {...} })`
- Resolver-based: `DynamicModuleResolver` with priority 1 (checked first)
- Always tainted: Dynamic content is untrusted by default
- Override semantics: Dynamic modules shadow filesystem/registry with same path
- Eager resolution: Modules provided upfront, no async fetch

## Details

**Resolution order:**
1. DynamicModuleResolver (priority 1)
2. LocalResolver (priority 5)
3. RegistryResolver (priority 10)
4. HTTPResolver (priority 15)

**Entry points:**
- `InterpretOptions.dynamicModules` - Module dictionary
- `ProcessOptions.dynamicModules` - Public API passthrough
- `Environment.registerDynamicModules()` - Registration at interpret time

**Taint handling:**
- `core/security/taint.ts` recognizes `dynamic` resolver name
- Returns high taint level with `['dynamic-module', 'untrusted']` labels
- Guards can check `@ctx.sources.includes('dynamic-module')`

**SDK integration:**
- Structured mode: Dynamic imports appear in effects with `source: 'dynamic://...'`
- Stream mode: Emits `debug:import:dynamic` events
- Debug mode: Full provenance including exported variable names

## Gotchas

- Content must be valid mlld source (parse errors propagate normally)
- No content type detection (always treated as mlld module)
- Keys are exact match (no fuzzy matching, no extension inference)
- Circular imports between dynamic modules follow normal detection
- Memory only - no caching to disk
