---
updated: 2026-01-04
tags: #arch, #modules, #imports
related-docs: docs/modules.md, docs/registry.md, docs/resolvers.md, docs/dev/REGISTRY.md
related-code: interpreter/eval/directives/import/*.ts, core/resolvers/*.ts, interpreter/eval/import/*.ts, cli/commands/info.ts, cli/commands/docs.ts
related-types: core/types { ImportDirective, ExportManifest, ModuleLockEntry }
---

# Module System Architecture

## tldr

mlld's module system resolves imports through type-specific resolvers, evaluates module content in isolated environments with side-effect suppression, serializes exports with full scope capture, and validates versions against lock files. Import types (module/static/live/cached/local) determine resolution behavior; export manifests control visibility; captured environments preserve module scope for executables.

## Principles

- Import types declare resolution behavior explicitly (network, cache, timing)
- Module evaluation suppresses side effects via `isImporting` flag
- Exports serialize complete module scope for cross-module references
- Lock files enforce version contracts for reproducibility
- Resolvers are pluggable and type-specific

## Details

### Import Resolution Flow

Entry point: `interpreter/eval/directives/import/ImportDirectiveEvaluator.ts:48`

1. **Import Type Determination** (line 94-119)
   - Explicit: `/import module { x } from @author/mod` → Registry resolver
   - Inferred from source: `@author/mod` → module, `<file>` → static, `<url>` → cached(5m)
   - Default fallback: cached imports for URLs, static for files

2. **Resolver Selection** (`core/registry/ModuleInstaller.ts:98-104`, `core/resolvers/ResolverManager.ts:321-520`)
   - Runtime registers: `ProjectPathResolver`, `RegistryResolver`, `LocalResolver`, `GitHubResolver`, `HTTPResolver`
   - All resolution routes through `ResolverManager.resolve`
   - Import types control caching behavior, not resolver selection
   - Prefix matching (@author/, @base/, custom prefixes) determines resolver priority

3. **Lock File Validation** (`ImportDirectiveEvaluator.ts:245-276`)
   - Registry imports check `mlld-lock.json` for version/hash
   - Version mismatch throws generic `Error` when registry versions differ (`ImportDirectiveEvaluator.ts:640-650`)
   - File/URL imports are not validated (no mtime or ETag checks in current implementation)
   - Only registry modules with `registryVersion` metadata are enforced
   - Missing lock entries allowed (first import adds entry automatically)

4. **Content Resolution** (`core/resolvers/[Resolver].ts`)
   - Each resolver fetches content per its contract
   - Registry: `RegistryResolver.ts:209` fetches from `modules.json` CDN
   - Local: `LocalResolver.ts:87` reads from filesystem
   - HTTP: `HttpResolver.ts:142` fetches with cache headers
   - Integrity verification via SHA256 hash

5. **Module Processing** (`interpreter/eval/import/ModuleContentProcessor.ts:63-138`)
   - Parse content → AST
   - Create child environment with `isImporting = true`
   - Evaluate AST (side effects suppressed)
   - Extract export manifest if present
   - Serialize module scope

6. **Environment Binding** (`interpreter/eval/directives/import/VariableImporter.ts:58-124`)
   - Selected imports: bind specific names
   - Namespace imports: bind entire module object
   - Collision detection via `Environment.trackImportedBinding`
   - Throws `IMPORT_NAME_CONFLICT` with directive locations

### Export System

Entry point: `interpreter/eval/directives/export.ts:21`

**Export Manifest** (`interpreter/eval/import/ExportManifest.ts`)
- Stores set of exported identifiers
- Multiple `/export` directives accumulate
- Deduplicates automatically (Set-based)

**Evaluation** (`export.ts:7-50`)
- Collects names from `/export { name1, name2 }` AST
- Adds to environment's manifest via `env.setExportManifest`
- Wildcard `/export { * }` triggers auto-export mode
- Validation deferred until module evaluation completes

**Processing** (`VariableImporter.processModuleExports:189-310`)
- If manifest exists: filter childVars to exported names only
- Missing exported name throws `EXPORTED_NAME_NOT_FOUND` with location
- No manifest: auto-export all variables (legacy fallback)
- System variables (@base, @now, etc.) always filtered

**Serialization** (`VariableImporter.ts:321-489`)
- Primitives: direct value copy
- Executables: serialize `ExecutableDef` + `capturedModuleEnv`
- Templates: serialize `templateAst` + interpolation type + captured env
- Objects: recursive serialization via `serializeObjectForModule`
- Arrays: element-wise serialization
- Pipelines: preserve `PipelineContext` metadata

### Module Environment Capture

**Purpose**: Executables/templates reference their defining module's variables

**Capture** (`VariableImporter.ts:265-272` capture, `144-148` serialization)
- Serialize all module variables → `Record<string, SerializedVariable>`
- Recursive serialization handles nested executables
- Shadow environments serialized separately (`capturedShadowEnvs`)
- Stored in `metadata.capturedModuleEnv`
- **Executable scope**: Serialization captures the complete module scope, so executables always see sibling bindings during invocation (`interpreter/eval/exec-invocation.ts:169-214`)

**Resolution** (`interpreter/eval/exec-invocation.ts:189-215`)
- Check invocation parameters first
- Fall back to `capturedModuleEnv` for missing identifiers
- Caller environment never consulted
- Missing variables throw interpolation errors with module context

**Template Interpolation** (`interpreter/eval/template-renderer.ts:98-127`)
- `@var` syntax: resolve against captured env
- `{{var}}` syntax (triple-colon): resolve through captured module environment fallback
- Both syntaxes preserve module scope across import boundaries

### Side Effect Suppression

**Mechanism** (`Environment.ts:142, 168`)
- `setImporting(true)` before module evaluation
- `getIsImporting()` checked by directive evaluators
- `finally` block ensures flag reset

**Suppressed Directives** (`interpreter/eval/directives/`)
- `/run`: `run.ts:47` early return when importing
- `/output`: `output.ts:38` early return when importing
- `/show`: `show.ts:32` early return when importing

**Active Directives**
- `/var`: always executes (builds module state)
- `/exe`: always executes (defines functions)
- `/import`: always executes (nested imports allowed)
- `/export`: always executes (builds manifest)

### Lock File Integration

**Structure** (`core/registry/LockFile.ts:5-24`)
```typescript
interface ModuleLockEntry {
  version: string;           // "1.0.0" or "latest"
  resolved: string;          // content hash
  source: string;            // original specifier
  integrity: string;         // "sha256:..."
  fetchedAt: string;         // ISO timestamp
  registryVersion?: string;  // resolved version
  sourceUrl?: string;        // fetch URL
}
```

**Operations** (`LockFile.ts:221-298`)
- `addModule`: write new entry after successful fetch
- `updateModule`: merge updates (preserves unlisted fields)
- `verifyModuleIntegrity`: SHA256 content verification
- `calculateIntegrity`: hash generation

**Validation** (`ImportDirectiveEvaluator.ts:610-649`)
- Registry imports: enforces version match when `registryVersion` metadata is present
- File/URL imports: no mtime or ETag validation in current implementation
- Lock validation only applies to registry modules with version metadata
- Missing lock entries allowed (first import adds entry automatically)

### Import Collision Detection

**Tracking** (`Environment.ts:312-328`)
- `importedBindings: Map<string, ImportBinding>` per environment
- Records: identifier, source path, directive location

**Detection** (`VariableImporter.ensureImportBindingAvailable:141-167`)
- Check if identifier already imported
- Throws `IMPORT_NAME_CONFLICT` with:
  - Both directive locations
  - Source paths
  - Suggestion to use namespace imports

**Error Example**
```
Import collision: 'helper' already imported from '@alice/utils' at file.mld:5
Attempting to import from '@bob/tools' at file.mld:8
Use namespace imports to avoid collisions: import @alice/utils as @alice
```

### Resolver System

**Interface** (`core/resolvers/types.ts:29-71`)
```typescript
interface IResolver {
  resolve(spec: string, mx: ResolverContext): Promise<ResolverResult>;
  shouldHandle(spec: string): boolean;
  priority: number;
}
```

**Implementations**
- `RegistryResolver`: Fetches from mlld registry (modules.json)
- `LocalResolver`: Reads from filesystem (project-relative)
- `HttpResolver`: Fetches via HTTP/HTTPS with caching
- `GitHubResolver`: Resolves GitHub URLs/repo paths
- `ProjectPathResolver`: Handles @base prefix for project-relative paths

**Orchestration** (`ResolverManager.ts:321-520`)
- Prefix matching determines resolver (@author/ → Registry, @base/ → ProjectPath, custom → LocalResolver)
- Priority ordering for ambiguous cases
- All resolution routed through `ResolverManager.resolve`
- Import types control caching/timing, not which resolver is selected

### Registry Data Access

**Registry URL**: `https://raw.githubusercontent.com/mlld-lang/registry/main/modules.json`

**Entry point**: `core/resolvers/RegistryResolver.ts`

**Module Entry Structure** (from modules.json):
```typescript
{
  "@mlld/array": {
    name: "array",
    author: "mlld",
    about: "Array operations with native return values",
    version: "2.0.0",
    needs: ["node"],
    license: "CC0",
    source: {
      type: "github",
      url: "https://raw.githubusercontent.com/...",  // ← Raw content URL
      contentHash: "sha256:...",
      repository: { type: "git", url: "...", commit: "...", path: "..." }
    },
    keywords: [...],
    availableVersions: ["2.0.0"],
    tags: { latest: "2.0.0", stable: "2.0.0" },
    owners: ["mlld"]
  }
}
```

**Key Fields**:
- `source.url`: Raw URL to fetch module content (use for section extraction)
- `about`: Module description
- `version`: Current version
- `availableVersions`: All published versions
- `tags`: Named version aliases (latest, stable, beta)

**Fetching Module Info** (`RegistryResolver.ts:379-434`):
1. Fetch `modules.json` from registry CDN
2. Look up `@author/module` key
3. `source.url` points to raw module content

**CLI Usage Pattern** (for `mlld info`, `mlld docs`):
```typescript
// Fetch modules.json
const registry = await fetch(registryUrl).then(r => r.json());
const entry = registry.modules[`@${author}/${module}`];

// Get source URL for section extraction
const sourceUrl = entry.source.url;

// Use interpreter to extract sections
const source = `var @tldr = <${sourceUrl} # tldr>\nshow @tldr`;
await interpret(source, options);
```

**Private Registries**: Use `ResolverManager` for resolution - it handles both public registry and locally-configured private registries via prefix matching. Don't hardcode the public registry URL in CLI commands.

### Configuration

**mlld-config.json** (`core/registry/ConfigFile.ts:10-37`)
- `dependencies`: registry module versions
- `resolvers.prefixes`: custom resolver mappings
- `security`: allowed domains, env vars, paths
- `dev.localModulesPath`: local development path

**mlld-lock.json** (`core/registry/LockFile.ts:5-24`)
- Auto-generated, never manually edited
- Version locks for reproducibility
- Content hashes for integrity
- Fetch timestamps for debugging

## Gotchas

- `isImporting` flag must be reset in `finally` blocks (cache hits can skip try body)
- Module scope serialization is deep (recursive) - watch for circular references
- Lock validation only applies to registry imports (file/URL use different mechanisms)
- Collision detection is per-file, not global (same name from different sources in different files is fine)
- Auto-export includes all variables except system variables (@base, @now, etc.)
- CLI commands (`info`, `docs`) must use ResolverManager, not hardcoded registry URL, to support private registries
- `cli/commands/info.ts` has mock data in `fetchModuleInfo()` - needs to use real registry data

## Debugging

**Environment Variables**
- `MLLD_DEBUG=1`: log import resolution, cache hits, lock validation
- `MLLD_DEBUG_IMPORTS=1`: detailed import chain with namespace assignments

**Key Decision Points**
1. Import type inference: `ImportDirectiveEvaluator.ts:94-119`
2. Resolver selection: `ResolverManager.resolve` (core/resolvers/ResolverManager.ts:321-520)
3. Lock validation: `ImportDirectiveEvaluator.ts:245-276`
4. Export filtering: `VariableImporter.ts:237-269`
5. Collision detection: `VariableImporter.ts:141-167`

**Common Issues**
- Side effects during import: check `isImporting` flag state
- Missing exports: verify `/export` manifest matches variable names
- Version conflicts: inspect `mlld-lock.json` entries
- Resolution failures: enable `MLLD_DEBUG` to trace resolver chain
