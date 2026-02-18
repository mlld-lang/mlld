---
updated: 2026-02-18
tags: #arch, #modules, #imports, #needs
related-docs: docs/dev/RESOLVERS.md, docs/dev/REGISTRY.md, docs/dev/INTERPRETER.md, docs/dev/DATA.md
related-code: core/registry/types.ts, core/resolvers/types.ts, core/resolvers/HTTPResolver.ts, interpreter/eval/needs.ts, interpreter/eval/import/ImportDirectiveEvaluator.ts, interpreter/eval/import/ImportRequestRouter.ts, interpreter/eval/import/ImportPathResolver.ts, interpreter/eval/import/ImportTypePolicy.ts, interpreter/eval/import/ImportSecurityValidator.ts, interpreter/eval/import/ModuleContentProcessor.ts, interpreter/eval/import/ModuleNeedsValidator.ts, interpreter/eval/import/DirectoryImportHandler.ts, interpreter/eval/import/ModuleImportHandler.ts, interpreter/eval/import/VariableImporter.ts, interpreter/eval/import/ShadowEnvSerializer.ts, interpreter/eval/import/variable-importer/*.ts, interpreter/eval/exec/context.ts, interpreter/env/ImportResolver.ts, interpreter/eval/export.ts, core/errors/MlldImportError.ts, core/types/security.ts, cli/commands/info.ts
related-types: core/registry/types { ModuleType, MODULE_TYPE_PATHS }, core/policy/needs { NeedsDeclaration, CommandNeeds }, core/types/security { ImportType }, interpreter/eval/import/ImportPathResolver { ImportResolution }, core/resolvers/types { Resolver, ResolverCapabilities }, core/errors/MlldImportError { MlldImportErrorOptions }
---

# MODULES

## tldr

- This is the canonical module+import architecture doc.
- Import orchestration is rooted in `ImportDirectiveEvaluator` and routed through `interpreter/eval/import/*` handlers.
- `/needs` is optional module metadata and is enforced at import time (`NEEDS_UNMET`).
- Circular import detection is layered: `ModuleContentProcessor` global stack + environment/import-resolver stack checks.
- Resolver internals stay in `docs/dev/RESOLVERS.md`; this doc only tracks resolver contracts used by module/import flow.

## Principles

- Keep module packaging concerns separate from runtime import execution mechanics.
- Keep import routing (`resolveImportPath` + request router) separate from import-type policy.
- Keep `/needs` normalized before enforcement and fail fast at import boundaries.
- Keep import side effects explicit: binding collisions, policy registration, guard registration.

## Details

### Module Type Paths

Source of truth: `core/registry/types.ts` (`MODULE_TYPE_PATHS`).

| Module Type | Local Path Root | Global Path Root |
| --- | --- | --- |
| `library` | `llm/lib` | `.mlld/lib` |
| `app` | `llm/run` | `.mlld/run` |
| `command` | `.claude/commands` | `.claude/commands` |
| `skill` | `.claude/skills` | `.claude/skills` |
| `environment` | `.mlld/env` | `.mlld/env` |

### Import Evaluator Composition Boundaries

Entrypoint and composition root:

- `interpreter/eval/import/ImportDirectiveEvaluator.ts`

Evaluator-owned collaborators:

- `ImportPathResolver` (`resolveImportPath(...)`)
- `ImportRequestRouter` (routes by resolved source type)
- `McpImportHandler` (MCP directive variants)
- `ResolverContentImportHandler` (resolver-content import path)
- `ModuleNeedsValidator` (`enforceModuleNeeds(...)`)
- `ImportBindingValidator` (export binding validation)
- `PolicyImportContextManager` (policy import context)

Router boundary (`ImportRequestRouter`):

- `InputImportHandler`
- `ResolverImportHandler`
- `ModuleImportHandler`
- `NodeImportHandler`
- `FileUrlImportHandler`

Module-content processing boundary:

- `ModuleContentProcessor` composes content read/parse/eval with:
  - `ImportSecurityValidator`
  - `VariableImporter`
- `DirectoryImportHandler` enforces child `index.mld` needs using the same needs validator callback.

### Resolution Flow and Import Types

Source of truth: `ImportDirectiveEvaluator.ts`, `ImportPathResolver.ts`, `ImportTypePolicy.ts`, `core/types/security.ts`.

```ts
const resolution = await this.pathResolver.resolveImportPath(directive);
const importContext = resolveImportType(directive, resolution);
resolution.importType = importContext.importType;
```

- `ImportResolution.type` includes `'node'` (`'file' | 'url' | 'module' | 'resolver' | 'input' | 'node'`).
- Supported import keywords: `module`, `static`, `live`, `cached`, `local`, `templates`.

| Import Type | Allowed Resolution Types | Notes |
| --- | --- | --- |
| `module` | `module`, `node` | `node` resolves through module import policy path. |
| `static` | `file`, resolver `@base/@root/@project` | Resolver static scope is intentionally narrow. |
| `live` | `url`, `resolver`, `input` | No static embedding semantics. |
| `cached` | `url` | Cache duration from `cached(...)` parsed to milliseconds. |
| `local` | `module` (with `preferLocal`) or resolver `@local` | Enables local-module preference path. |
| `templates` | `file` or resolver `@base/@root/@project/@local` | Template params are only valid for this import type. |

### Circular Import Detection

- `ModuleContentProcessor` uses a global stack (`globalImportStack`) to guard module content processing entrypoints.
- `ImportSecurityValidator` delegates import lifecycle checks to environment methods:
  - `env.isImporting(...)`
  - `env.beginImport(...)`
  - `env.endImport(...)`
- `Environment` delegates those lifecycle methods to `ImportResolver`, which tracks a shared `Set<string>` stack and checks parent contexts.

### `/needs` Declaration (Optional)

Source of truth: `grammar/directives/needs-wants.peggy` and `core/policy/needs.ts`.

`/needs` is optional. Modules can omit it.

Supported package ecosystems:

- `node` / `js`
- `python` / `py`
- `ruby` / `rb`
- `go`
- `rust`

Supported boolean capabilities:

- `sh` / `bash`
- `network` / `net`
- `filesystem` / `fs`

`cmd` forms:

- wildcard: `cmd: *`
- list: `cmd: [curl, jq]`
- map: `cmd: { git: { methods: [...], subcommands: [...], flags: [...] } }`
- bare command entries normalize into command needs through the grammar `__commands` path.

### Import-Time `/needs` Enforcement

Enforcement flow:

1. `/needs` evaluation records normalized needs (`interpreter/eval/needs.ts`, env `recordModuleNeeds(...)`).
2. `ModuleContentProcessor` returns `moduleNeeds` in processing results.
3. `ImportDirectiveEvaluator.validateModuleResult(...)` enforces via `ModuleNeedsValidator.enforceModuleNeeds(...)`.
4. `DirectoryImportHandler` enforces needs for child `index.mld` modules using the same validator callback.

Failure surface:

- Exception type: `MlldImportError`
- Error code: `NEEDS_UNMET`
- Message includes detail lines per unmet capability/runtime/package/command.

### Lock Version and Binding Enforcement

- Lock-version validation is owned by `ModuleImportHandler.validateLockFileVersion(resolverContent, env)`.
- Call site is inside `ModuleImportHandler.evaluateModuleImport(...)`.
- Binding collision enforcement is owned by `ImportBindingGuards`, not `Environment`:
  - `ensureImportBindingAvailable(...)`
  - `setVariableWithImportBinding(...)`
- Successful import bindings are registered through `Environment.setImportBinding(...)`.

### VariableImporter Composition Map

Source of truth: `interpreter/eval/import/VariableImporter.ts` and `interpreter/eval/import/variable-importer/*`.

- Composition root: `VariableImporter`
- Export serialization and manifest validation:
  - `ModuleExportSerializer`
  - `ModuleExportManifestValidator`
  - `GuardExportChecker`
- Import subtype routing:
  - `ImportTypeRouter`
  - `NamespaceSelectedImportHandler`
  - `PolicyImportHandler`
- Variable reconstruction:
  - `factory/ImportVariableFactoryOrchestrator`
  - shape strategies in `factory/*ImportStrategy.ts`
- Executable/captured-env rehydration:
  - `executable/ExecutableImportRehydrator`
  - `executable/CapturedEnvRehydrator`
- Metadata envelope parsing:
  - `MetadataMapParser`

### Export Metadata and Environment Boundaries

- `ModuleExportSerializer` writes per-variable metadata to `moduleObject.__metadata__`.
- `MetadataMapParser.extractMetadataMap(...)` reads metadata for import-side reconstruction.
- Shadow-env serialization path:
  - `serializeShadowEnvironmentMaps(...)` (`ShadowEnvSerializer.ts`)
  - `CapturedEnvRehydrator.deserializeShadowEnvs(...)`
  - `deserializeShadowEnvs(...)` fallback in `interpreter/eval/exec/context.ts`
- Captured module-env serialization recursion is cycle-controlled with `WeakSet<object>` tracking.

### Optional Selected Import Behavior

- `NamespaceSelectedImportHandler.handleSelectedImport(...)` allows missing selected fields only for `@payload` and `@state` imports.
- Missing keys in those imports synthesize `null` variable bindings instead of throwing.

### Resolver Contracts (High-Level Only)

Source of truth: `core/resolvers/types.ts`.

- Resolver interface is `Resolver` (not legacy `IResolver`).
- Capability contract is `ResolverCapabilities` (`io`, `contexts`, `supportedContentTypes`, `defaultContentType`, `priority`, optional `cache`).
- HTTP resolver class is `core/resolvers/HTTPResolver.ts`.
- Resolver internals/capability specifics are tracked in `docs/dev/RESOLVERS.md`.

### Registry Info Surface

- `cli/commands/info.ts` fetches live registry JSON (`modules.json`) and caches it in-process.
- Do not document this command as mock-data based.

### Error Surface

`MlldImportError` constructor shape:

```ts
new MlldImportError(message, {
  code,
  details,
  cause,
  severity,
  context
});
```

## Regression Hazards

- Captured module-env serialization recursion control (`WeakSet` cycle prevention) in importer/export serializer paths.
- Captured shadow-env serialize/rehydrate compatibility between import and exec-context paths.
- `__metadata__` envelope parsing plus `VariableMetadataUtils` propagation for label/taint continuity.
- Binding-collision diagnostic payload shape (`IMPORT_NAME_CONFLICT`) in `ImportBindingGuards`.
- Namespace policy side effects via `PolicyImportHandler.applyNamespacePolicyImport(...)`.

## Gotchas

- `/needs` is optional; do not require it for every module.
- Keep `/needs` alias docs aligned with `normalizeNeedsDeclaration(...)`.
- Keep lock-version attribution on `ModuleImportHandler`, not `ImportDirectiveEvaluator`.
- Keep circular detection docs set-based (global + env/import-resolver), not a private array on `ImportSecurityValidator`.
- Keep `templates` in import type docs; it is part of the current `ImportType` union.
