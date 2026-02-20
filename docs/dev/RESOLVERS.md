---
updated: 2026-02-18
tags: #arch, #resolvers, #dynamic-modules
related-docs: docs/dev/MODULES.md, docs/dev/SDK.md, docs/dev/STREAMING.md
related-code: core/resolvers/types.ts, core/resolvers/ResolverManager.ts, core/resolvers/ProjectPathResolver.ts, core/resolvers/RegistryResolver.ts, core/resolvers/LocalResolver.ts, core/resolvers/GitHubResolver.ts, core/resolvers/HTTPResolver.ts, core/resolvers/PythonPackageResolver.ts, core/resolvers/DynamicModuleResolver.ts, core/resolvers/builtin/*.ts, interpreter/env/bootstrap/EnvironmentBootstrap.ts, interpreter/env/Environment.ts, core/errors/ResolverError.ts, core/registry/ProjectConfig.ts
related-types: core/resolvers/types { Resolver, ResolverCapabilities, ResolverContent, PrefixConfig, ResolverOptions }, core/errors/ResolverError { ResolverErrorCode }
---

# RESOLVERS

## tldr

- Resolver contracts are defined in `core/resolvers/types.ts` (`Resolver`, `ResolverCapabilities`, `ResolverContent`).
- `ResolverManager` resolves references through prefix config, direct resolver lookup, then priority fallback.
- Canonical project files are `mlld-config.json` and `mlld-lock.json` (with legacy lock fallbacks).
- Dynamic modules are implemented by `DynamicModuleResolver` with exact-key matching and security labels (`src:dynamic`).
- SDK/runtime dynamic-module behavior is documented in `docs/dev/SDK.md`; this doc covers resolver internals.

## Principles

- Keep resolver contracts strict and capability-driven (`contexts`, `io`, content types).
- Keep prefix configuration explicit (`PrefixConfig`) and validated before use.
- Keep resolver internals separate from import-policy/module orchestration docs.
- Keep dynamic module data treated as untrusted input by default.

## Details

### Resolver Contracts

Source of truth: `core/resolvers/types.ts`.

- `Resolver` interface includes:
  - identity (`name`, `description`, `type`)
  - capabilities (`ResolverCapabilities`)
  - `canResolve(ref, config?)`
  - `resolve(ref, config?)`
  - optional `write`, `list`, `validateConfig`, `checkAccess`
- `ResolverCapabilities` includes:
  - `io` (`read/write/list`)
  - `contexts` (`import/path/output`)
  - `supportedContentTypes`
  - `defaultContentType`
  - `priority`
  - optional cache config.
- `ResolverContent` carries `content`, `contentType`, and resolver metadata under `mx`.

### ResolverManager Resolution Flow

Source of truth: `core/resolvers/ResolverManager.ts`.

`ResolverManager.resolve(ref, options?)` finds a resolver in this order:

1. local module prefixes (`configureLocalModules(...)` / discovered author prefixes)
2. configured prefixes (`configurePrefixes(...)`, longest prefix first)
3. direct resolver-name lookup (`@now`, `@debug`, etc.)
4. priority-ordered resolver fallback (`resolversByPriority`)

Context compatibility is enforced via `canResolveInContext(...)` using resolver capability contexts.

### Default Resolver Registration

Bootstrap registration (`interpreter/env/bootstrap/EnvironmentBootstrap.ts`):

- `ProjectPathResolver` (`name: 'base'`, alias: `root`)
- `RegistryResolver`
- `PythonPackageResolver` (`py`) and `PythonAliasResolver` (`python`)
- `LocalResolver`
- `GitHubResolver`
- `HTTPResolver`

Built-in function resolvers are registered at runtime (`Environment.registerBuiltinResolvers()`):

- `NowResolver` (`now`)
- `DebugResolver` (`debug`)
- `InputResolver` (`input`)
- `KeychainResolver` (`keychain`)

### Built-in Behavior Corrections

- `NowResolver` supports `import` and `path` contexts (`contexts.path === true`), and returns ISO text for variable/path usage.
- Project-path resolver identity is `base` with alias `root` (class `ProjectPathResolver`), not `PROJECTPATH`.

### Config and Lock Files

Canonical files are managed by `ProjectConfig` (`core/registry/ProjectConfig.ts`):

- config: `mlld-config.json`
- lock: `mlld-lock.json`

Legacy lock compatibility is still supported via fallback paths:

- `mlld.lock.json`
- `.mlld/mlld.lock.json`

### Dynamic Resolver Internals

Source of truth: `core/resolvers/DynamicModuleResolver.ts`, `interpreter/env/Environment.ts`.

Resolver behavior:

- resolver name: `dynamic`
- exact key match: `canResolve(ref)` checks `modules.has(ref)`
- supported input values:
  - raw module source string
  - plain object (serialized into module source)

Object serialization path:

- object keys are sorted
- each key becomes `/var @key = ...`
- export list is emitted as `/export { @key1, @key2, ... }`

Security labeling:

- every dynamic resolve includes labels/taint `src:dynamic`
- optional source label `src:<source>` is added when provided

Update semantics:

- `Environment.registerDynamicModules(...)` reuses existing dynamic resolver when present.
- existing dynamic entries are updated via `updateModule(...)`; resolver is not re-registered.

Dynamic object-module limits:

- max serialized size: `1MB`
- max depth: `10`
- max keys per object: `1000`
- max elements per array: `1000`
- max total nodes: `10000`

### Resolver Error Model

Source of truth: `core/errors/ResolverError.ts`.

Constructor signature:

```ts
new ResolverError(message, code?, details?)
```

Where:

- `code` is `ResolverErrorCode` (defaults to `GENERIC`)
- `details` is `ResolverErrorDetails` (resolver name, reference, context, operation, etc.)

## Gotchas

- Do not document nonexistent resolver abstractions such as `MCPResolver`, `TTLCacheService`, `resolveAtReference(...)`, or `joinPathSegments(...)` as current architecture.
- Use `mlld-config.json` / `mlld-lock.json` as canonical names; mention legacy lock names only as compatibility.
- Keep resolver internals here; module/import orchestration lives in `docs/dev/MODULES.md`.
