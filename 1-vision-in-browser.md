# mlld In The Browser

mlld provides a browser-native runtime. It runs mlld scripts entirely in the browser with no server and no Node.js runtime.

## Quick start

```html
<script type="module">
import { createRuntime } from 'mlld/browser';

const runtime = createRuntime();

// Load files into the virtual filesystem
runtime.fs.write('/prompt.md', `
# Summarize
/var @text = /read input.md
/exe @summary = js { return text.slice(0, 100) }
/out @summary
`);
runtime.fs.write('/input.md', document.getElementById('content').textContent);

// Run
const output = await runtime.run('/prompt.md');
console.log(output);
</script>
```

## What works

The browser runtime uses the same parser and interpreter as mlld. Everything that doesn't need a host OS works:

- **Parsing and validation** — full mlld syntax, same grammar
- **Variables, interpolation, conditionals** — `var`, `if`, `when`, `for`, all of it
- **`exe js { }`** — inline JavaScript via `Function()` constructor, same as Node mlld
- **URL imports** — `import` from HTTP/HTTPS URLs using the browser's native `fetch`
- **Registry modules** — fetch and run modules from the mlld registry
- **Policy enforcement** — same policy system, same capability checks

## What doesn't work

Capabilities that require a host OS are denied by default:

- `exe bash { }`, `exe sh { }` — no shell
- `exe node { }` — no Node.js VM
- `exe python { }` — no Python runtime

These are blocked by a built-in browser policy. Attempting to use them throws a `MlldSecurityError` with a clear message, same as any policy denial.

## Virtual filesystem

There is no disk in the browser. The runtime provides an in-memory virtual filesystem that you populate via the SDK.

```js
const runtime = createRuntime();

// Add files the script can read
runtime.fs.write('/docs/readme.md', readmeContent);
runtime.fs.write('/docs/changelog.md', changelogContent);
runtime.fs.write('/config.yaml', yamlConfig);

// Scripts can read and write within the VFS
const result = await runtime.run('/my-script.md');

// Inspect what the script wrote
const output = runtime.fs.read('/output.md');
const allFiles = runtime.fs.list('/');
```

Files written by the script go to the same VFS. Nothing touches the user's machine.

## In-memory modules

Modules imported by URL are cached in memory for the lifetime of the runtime. No `.mlld-cache` directory, no lockfile. Create a fresh runtime for a clean slate.

```js
// Modules fetched once, cached for this runtime instance
const runtime = createRuntime();
await runtime.run('/script-that-imports-modules.md');

// Same runtime reuses cached modules
await runtime.run('/another-script.md');
```

## Use cases

### Playground

Embed a live mlld editor in your docs site. Users write mlld, hit run, see output. No backend.

### Client-side orchestration

Run mlld scripts in a web app. Populate the VFS with user data, run a template, get the result. Useful for client-side content generation or LLM prompt assembly.

### Testing and CI

Import `mlld/browser` in test suites that run in browser environments (Playwright, Vitest browser mode). Validate mlld scripts without Node.js.

## Package And Import Path

```bash
npm install mlld
```

The browser runtime is shipped from the main mlld package as a browser entrypoint.

```js
// ESM
import { createRuntime } from 'mlld/browser';
```

## CLI Ephemeral/CI Modes

Node/CI ephemeral execution is part of the main CLI surface:

```bash
mlld --ephemeral script.mld
mlld --ci script.mld
```

There is no separate `mlldx` binary requirement when using these modes.
