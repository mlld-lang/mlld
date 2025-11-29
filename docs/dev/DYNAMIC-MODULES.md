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
- Resolver returns `ctx.taintLevel: 'resolver'`
- `core/security/taint.ts` maps dynamic resolver name to untrusted taint and adds `dynamic-module` to taint sources
- Guards can check `@ctx.sources.includes('dynamic-module')`

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
