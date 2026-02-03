---
id: env-blocks
title: Environment Blocks
brief: Scoped execution within an environment configuration
category: security
parent: security
tags: [environments, blocks, isolation, scoping]
related: [env-overview, env-config, policies]
related-code: [interpreter/eval/env.ts, grammar/directives/env.peggy]
updated: 2026-02-03
---

Execute directives within a scoped environment using `env @config [ ... ]`.

```mlld
var @sandbox = { tools: ["Read", "Write", "Bash"] }

env @sandbox [
  run cmd { echo "inside sandbox" }
]
```

The environment is active only within the block and released on exit.

**Return values:**

```mlld
var @config = { tools: ["Read", "Write"] }

var @result = env @config [
  => "completed"
]

show @result
```

Use `=>` to return a value from the block.

**Inline derivation with `with`:**

```mlld
var @sandbox = { tools: ["Read", "Write", "Bash"] }

var @result = env @sandbox with { tools: ["Read"] } [
  => "read-only mode"
]

show @result
```

Derives a restricted environment inline without naming it.

**Named child environments:**

```mlld
var @sandbox = { tools: ["Read", "Write", "Bash"] }
var @readOnly = new @sandbox with { tools: ["Read"] }

env @readOnly [
  run cmd { cat README.md }
]
```

Child environments can only restrict parent capabilities, never extend them.

**Notes:**
- Directives inside blocks use bare syntax (no `/` prefix)
- Environment resources are released when the block exits
- See `env-overview` for concepts, `env-config` for configuration fields
