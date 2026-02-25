---
id: modules-importing-node
title: Importing Node Modules
brief: Import Node.js packages with automatic wrapping
category: modules
parent: importing
tags: [modules, imports, node, npm, packages]
related: [modules-importing-local, modules-importing-namespace]
related-code: [interpreter/eval/import/NodeImportHandler.ts, interpreter/utils/node-interop.ts, grammar/directives/import.peggy]
updated: 2026-02-16
qa_tier: 2
---

**Basic node imports:**

```mlld
import { basename } from node @path
var @name = @basename("/tmp/file.txt")
show @name
```

**Namespace imports:**

```mlld
import { posix } from node @path
var @dir = @posix.dirname("/tmp/file.txt")
show @dir
```

**Constructor expressions:**

```mlld
import { URL } from node @url
exe @site = new @URL("https://example.com/path?x=1")
show @site.hostname
show @site.pathname
```

**Automatic wrapping:**
- Functions are wrapped to accept and return mlld values
- Method binding is preserved (correct `this` context)
- Classes support `new @Constructor()` syntax
- Async iterables are wrapped as streams
- Promises work transparently
- Callback-style functions trigger warnings

**Module resolution:**
- Uses Node.js module resolution from the importing file's directory
- Supports both CommonJS and ES modules
- Built-in modules: `node @path`, `node @fs`, `node @url`, etc.
- NPM packages: Use package name without leading `@` (e.g., `node @chalk`)
