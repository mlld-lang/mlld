# Spec: mlld Browser Runtime Build

## Goal

Ship a browser-runnable mlld runtime from `mlld/browser`. Same parser, same interpreter, same policy system, minus Node.js-only capabilities. Ephemeral/CI behavior is exposed via `mlld --ephemeral` and `mlld --ci` on the main CLI surface instead of a separate `mlldx` binary.

## What already works

These are browser-safe today with zero changes:

- **Peggy parser** — pure JS, no Node imports
- **Core interpreter** (`interpreter/core/`) — pure recursive evaluation, all I/O through `Environment`
- **`JavaScriptExecutor`** — uses `new Function()` / `new AsyncFunction()`, not `vm`
- **Policy system** — `evaluateCapabilityAccess()` is pure logic
- **URL imports** — uses global `fetch()`
- **`InMemoryModuleCache`** — already exists, Map-based (but uses `crypto.createHash` and `Buffer` — needs polyfill or swap)
- **`MemoryFileSystem`** — already exists in `tests/utils/`, implements `IFileSystemService`
- **`IFileSystemService`** interface — already has `isVirtual()` method
- **`IPathService`** interface — pure path operations

## What needs to change

### 1. `JavaScriptExecutor` — remove `process.cwd()` / `process.chdir()`

`JavaScriptExecutor.ts:54-59` uses `process.cwd()` and `process.chdir()` for working directory management. In browser mode these don't exist.

**Change:** Guard with `typeof process !== 'undefined'` or accept a `cwd` string from the environment instead of calling `process` directly. The cwd/chdir is only relevant for Node file resolution anyway — in browser mode with a VFS, it's meaningless.

### 2. `CommandExecutorFactory` — browser variant

Today the factory unconditionally instantiates all executors (Shell, JS, Node, Python, Bash) in its constructor, pulling in Node-only imports.

**Change:** Create `BrowserCommandExecutorFactory` that only instantiates `JavaScriptExecutor`. The `getCodeExecutor()` switch for bash/node/python returns `null`, which already triggers `Unsupported code language` errors. The policy system backs this up — denied capabilities throw `MlldSecurityError` before the executor is even reached.

```typescript
// New file: interpreter/env/executors/BrowserCommandExecutorFactory.ts
export class BrowserCommandExecutorFactory {
  private jsExecutor: JavaScriptExecutor;

  constructor(deps: { errorUtils: ErrorUtils; workingDirectory: string; shadowEnvironment: ShadowEnvironment }) {
    this.jsExecutor = new JavaScriptExecutor(deps.errorUtils, deps.workingDirectory, deps.shadowEnvironment);
  }

  async executeCommand(): Promise<string> {
    throw new MlldSecurityError('Shell commands are not available in browser mode');
  }

  async executeCode(code: string, language: string, ...args): Promise<string> {
    if (language === 'js' || language === 'javascript') {
      return this.jsExecutor.execute(code, ...args);
    }
    throw new MlldSecurityError(`exe ${language} is not available in browser mode. Only exe js { } is supported.`);
  }
}
```

### 3. `Environment` — browser-compatible initialization

`Environment.ts` imports `child_process` (line 19), `path` (line 20), `NodeShadowEnvironment`, `PythonShadowEnvironment`, and several resolver types that depend on Node.

**Change:** Create a `BrowserEnvironment` subclass or a factory function that:
- Uses `VirtualFS` (the new VFS from the virtualfs spec) instead of `NodeFileSystem`
- Uses `BrowserPathService` (posix-style path ops, no `path` module)
- Uses `BrowserCommandExecutorFactory` instead of the full `CommandExecutorFactory`
- Skips `NodeShadowEnvironment` and `PythonShadowEnvironment`
- Skips resolvers that need the filesystem: `LocalResolver`, `ProjectPathResolver`, `PythonPackageResolver`, `PythonAliasResolver`
- Keeps: `DynamicModuleResolver`, `RegistryResolver`, `HTTPResolver`, `GitHubResolver`
- Uses `InMemoryModuleCache` and `NoOpLockFile` (same as ephemeral mode)

The key insight: `setEphemeralMode()` already does half of this. Browser mode is ephemeral mode + VFS + restricted executors.

### 4. `InMemoryModuleCache` — remove `crypto` and `Buffer`

`InMemoryModuleCache.ts:1` imports `createHash` from `crypto`. Lines 28, 34, 36 use `Buffer.byteLength`.

**Change:** Replace `createHash('sha256')` with `crypto.subtle.digest('SHA-256', ...)` (Web Crypto API) or a simple hash function. Replace `Buffer.byteLength` with `new TextEncoder().encode(s).length`.

### 5. `BrowserPathService` — implement `IPathService`

`IPathService` has standard path operations (`resolve`, `join`, `dirname`, etc.) plus `isURL` / `validateURL` / `fetchURL`.

**Change:** Implement with pure string manipulation (posix-style). The path operations are straightforward. `fetchURL` uses browser `fetch`. Consider using the `pathe` npm package which is isomorphic and tiny.

### 6. Build target

**Change:** Add a browser entry to `tsup.config.ts`:

```typescript
{
  entry: { 'browser': 'sdk/browser.ts' },
  format: ['esm'],
  platform: 'browser',
  outDir: 'dist',
  external: [], // bundle everything
  noExternal: [/./],  // don't externalize anything
}
```

The browser entry point (`sdk/browser.ts`) imports only browser-safe code paths and exports the public API.

### 7. Package exports

In the root `package.json`, add a browser subpath export:

```json
{
  "exports": {
    ".": {
      "import": {
        "types": "./dist/index.d.ts",
        "default": "./dist/index.mjs"
      },
      "require": {
        "types": "./dist/index.d.ts",
        "default": "./dist/index.cjs"
      }
    },
    "./browser": {
      "import": {
        "types": "./dist/browser.d.ts",
        "default": "./dist/browser.mjs"
      }
    }
  }
}
```

### 8. CLI unification (`--ephemeral` / `--ci`)

Today `mlldx` exists as a separate wrapper binary/package for ephemeral mode.

**Change:** unify ephemeral/CI behavior into the primary CLI:
- `mlld --ephemeral` for in-memory/no-persistence execution
- `mlld --ci` for non-interactive CI profile defaults
- remove separate `mlldx` wrapper binary/package and update scripts/docs/changelog accordingly
- preserve migration guidance for existing `mlldx` users

## SDK surface

The browser API matches the existing SDK patterns from `docs/user/sdk.md`:

```typescript
// sdk/browser.ts — the browser entry point

export function createRuntime(options?: RuntimeOptions): BrowserRuntime;

interface RuntimeOptions {
  policy?: PolicyConfig;          // custom policy (default: deny bash/node/python/sh)
  dynamicModules?: Record<string, string | object>;
}

interface BrowserRuntime {
  fs: VirtualFS;                  // the VFS instance — populate files here

  // Same as processMlld — run script, get string output
  run(path: string): Promise<string>;

  // Same as interpret — full mode selection
  interpret(path: string, options?: { mode: 'structured' | 'stream' | 'debug' }): Promise<StructuredResult> | StreamExecution;

  // Same as analyzeModule — static analysis, no execution
  analyze(path: string): Promise<ModuleAnalysis>;
}
```

This is intentionally thin. `run()` is `processMlld()`. `interpret()` is `interpret()`. The VFS is the filesystem. Dynamic modules work the same way — pass them in `options` or write files to the VFS.

## Implementation order

1. **`BrowserPathService`** — implement `IPathService` with pure string ops
2. **`BrowserCommandExecutorFactory`** — JS-only executor factory
3. **`BrowserEnvironment`** or factory — wire VFS + browser path + browser executors + ephemeral caching
4. **Fix `InMemoryModuleCache`** — swap `crypto`/`Buffer` for web APIs
5. **Fix `JavaScriptExecutor`** — guard `process.cwd()`/`process.chdir()`
6. **`sdk/browser.ts`** — entry point, `createRuntime()`, wire everything
7. **Browser build target** — tsup config, root package `./browser` exports
8. **CLI unification** — land `--ephemeral`/`--ci`, remove `mlldx` wrapper/package
9. **Smoke tests** — run in Vitest browser mode or Playwright

## What we don't build

- No remote execution backend
- No WASM sandbox
- No polyfills for Node built-ins — if it needs Node, it doesn't ship in the browser bundle
- No separate `mlldx` binary
- No new mlld syntax or directives
- No changes to the parser or core interpreter
