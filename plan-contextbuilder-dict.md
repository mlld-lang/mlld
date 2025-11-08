# Plan: PathContextBuilder Dynamic Module Dictionary

## Goals & Constraints
- Ship **Option A** from `spec-contextbuilder-dict.md`: allow callers to inject a map of import-path → mlld source strings that PathContext uses before hitting disk.
- Keep existing `PathContextBuilder.fromFile|fromDefaults|forChildFile` call sites working while adding the new ergonomic constructor API the spec shows.
- Resolution order must be deterministic: dynamic map → resolver/filesystem → error, with explicit security/taint metadata so downstream policies can tell the difference.
- No generated files (grammar, registry) should be edited as part of this work.

## Current State (code review)
- `PathContext` only carries directory metadata (`core/services/PathContextService.ts:17-58`), so no dynamic module payload flows into the interpreter today.
- `PathContextBuilder` is a purely static helper (`core/services/PathContextService.ts:92-188`); there is no constructor, options object, or ability to stash module maps.
- The interpreter builds/receives a plain `PathContext` object and passes it into `Environment` (`interpreter/index.ts:179-207`), so any new data must be part of that object graph.
- Module imports always run through `Environment.resolveModule → ImportResolver.resolveModule → ResolverManager.resolve` (`interpreter/env/Environment.ts:1353-1363`, `interpreter/env/ImportResolver.ts:132-159`), meaning the only hook point before filesystem/network is inside `ImportResolver`.
- `/import @foo/bar` evaluation never learns where the content came from; it just pulls bytes from `env.resolveModule` and processes them (`interpreter/eval/import/ImportDirectiveEvaluator.ts:366-416`). Security taint is derived earlier solely from `ImportResolution.importType`/`resolverName` (`interpreter/eval/import/ImportDirectiveEvaluator.ts:56-90`), so we need a new signal if dynamic modules should be flagged as untrusted.

## Design Overview
1. **Extend PathContext shape**  
   Add optional `dynamicModules?: Record<string, string>` (and possibly helper metadata) directly onto `PathContext`. This keeps propagation automatic because child environments already clone/forward the context (`interpreter/env/Environment.ts:219-237`, `interpreter/env/Environment.ts:1558-1587`).

2. **Modernize PathContextBuilder**  
   - Introduce `PathContextBuilderOptions` + `DynamicModuleMap` types (likely `core/services/PathContextService.ts` or a new `core/types/context.ts`) that capture `basePath`, optional overrides, and the module dictionary.
   - Implement a real `PathContextBuilder` class that can be instantiated with either a string base path or the options object, exposes the `PathContext` fields, and offers helper methods like `resolveModule`, `listDynamicModules`, etc., per the spec.  
   - Keep the existing static methods as thin wrappers that construct a builder under the hood to remain backwards compatible.

3. **Import-time override hook**  
   Update `ImportResolver.resolveModule` to check the active `PathContext.dynamicModules` map before delegating to `ResolverManager`. When a match is found, return `{ content, contentType: 'module', metadata: { sourceType: 'dynamic', path: importPath, tainted: true } }`.

4. **Security & observability**  
   - Teach `ImportDirectiveEvaluator` (or `ImportPathResolver`) to mark `ImportResolution` objects that will hit dynamic modules so `deriveImportTaint` can classify them as untrusted. Options: set a new `resolution.sourceType = 'dynamic'` flag or assign `resolverName = 'dynamic'` and update `deriveImportTaint` accordingly.
   - Ensure we still run through `ModuleContentProcessor.processResolverContent` so frontmatter parsing, exports, audit logging, and circular detection continue to work.

5. **Validation & errors**  
   - Reject non-string entries in the modules dictionary early (throwing a `TypeError` as in the spec).  
   - When `resolveModule` misses both the map and filesystem/resolvers, surface a clear `MlldImportError` that lists which sources were checked.

## Implementation Steps
1. **Type foundations**
   - Create `PathContextBuilderOptions`, `DynamicModuleMap`, and `ModuleSource` types (either inside `core/services/PathContextService.ts` or a new `core/types/context.ts`).  
   - Extend `PathContext` with optional `dynamicModules` (Map or Record) plus any helper flags needed for tainting. Update exports so API consumers can import the new types.

2. **Builder refactor**
   - Implement the constructor-based `PathContextBuilder` class that stores `basePath`, normalized overrides, and a `Map` of modules.  
   - Provide instance methods from the spec (`resolveModule`, `hasModule`, `getDynamicModules`, etc.) and a `toPathContext()` (or `build()`) that returns a frozen `PathContext` including the map.  
   - Keep `fromFile`, `fromDefaults`, and `forChildFile` static helpers delegating to the new class so existing CLI/API code keeps working.  
   - Update `api/index.ts` re-exports or docs only as needed because the symbol name stays the same.

3. **Interpreter wiring**
   - Where `PathContextBuilder.fromFile` is used (CLI, interpreter, tests), no change is required if the helpers still return plain contexts. However, ensure `processMlld` can accept either a plain context or a `PathContextBuilder` instance (since spec examples pass the builder directly). This may mean having the builder implement the `PathContext` interface or adding a runtime guard that calls `.toPathContext()` when present.
   - Ensure `Environment` copies `dynamicModules` when creating child contexts (`interpreter/env/Environment.ts:1558-1587`) so nested imports keep the overrides.

4. **ImportResolver override**
   - Inside `interpreter/env/ImportResolver.ts:132-159`, check `this.dependencies.pathContext.dynamicModules` for the exact import reference before calling `ResolverManager`.  
   - When a match is found, wrap the string in the resolver-style return shape, tagging `metadata` with something like `{ sourceType: 'dynamic', path: reference, tainted: true }`.  
   - Decide whether to treat module keys as exact strings or support auto-appending `.mld`—spec leans toward exact keys, so start there and document it.

5. **Security/taint propagation**
   - Extend `ImportResolution` (in `interpreter/eval/import/ImportPathResolver.ts`) to carry a `sourceType?: 'dynamic' | ...` flag. When the requested import path exists in the current `PathContext.dynamicModules`, set `sourceType` before returning the resolution.  
   - Update `ImportDirectiveEvaluator` taint derivation (`interpreter/eval/import/ImportDirectiveEvaluator.ts:56-90`) to check `resolution.sourceType === 'dynamic'` and override the default descriptor (e.g., treat it like `userInput` with `['untrusted']` labels).  
   - Propagate `sourceType` into audit logs (`moduleSource.metadata`) so CLI audit features can show dynamic vs filesystem.

6. **Validation & error messaging**
   - During builder construction, validate that module keys are non-empty strings and values are strings; throw a descriptive error otherwise.  
   - Update `ImportResolver.resolveModule` to throw an `MlldImportError` that mentions both dynamic modules and the basePath when nothing is found (matching the spec example message).

7. **Testing**
   - Unit tests for builder behavior (`core/services/PathContextService.test.ts`): constructor acceptance, validation errors, resolution order, `getDynamicModules`, backwards compatibility with string constructor.  
   - Integration tests under `interpreter/eval/import` or `tests/cases`: ensure `/import @user/context` pulls from the dictionary, falls back to filesystem when missing, and errors when neither exists.  
   - Security-focused test to assert taint/sources reflect the dynamic origin (likely via `interpreter/eval/import/import-types.test.ts` or a new test that inspects the capability descriptor).  
   - CLI/API regression: a small test around `processMlld` showing builder injection works without writing files.

8. **Docs & samples**
   - Update `llms.txt` and any dev docs (probably `docs/dev/IMPORTS.md` or `docs/dev/DOCS.md`) with a short section describing the new `modules` option, usage examples, and security notes.  
   - Add a snippet to `README.md` or `docs/user` mirroring the SaaS example from the spec.

## Open Questions / Follow-ups
- **Taint classification** – Should dynamic modules map to a brand-new `ImportType` (`'dynamic'`) or reuse `'live'`/`'module'` with a special resolver name? The plan assumes a new `sourceType` flag plus taint override, but we should confirm with security owners.
- **Map mutability** – Do we allow mutating the module map after builder creation (helpful for caching) or freeze it to keep resolution deterministic? The spec implies eager, deterministic data, so freezing in the context might be safest.
- **Extension handling** – Spec examples omit `.mld`. Decide whether we normalize keys (append when missing) or require exact matches to avoid ambiguity. Document whichever choice we make.
- **Future Option B** – The resolver callback design (`future-contextbuilder-resolver.md`) will build on this work. Keep internal APIs (e.g., `ModuleSource`) flexible so we can add async resolvers without rewriting everything again.
