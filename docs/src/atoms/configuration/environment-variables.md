---
id: config-env-vars
title: Environment Variables
brief: Import environment variables via @input
category: configuration
parent: configuration
tags: [configuration, environment, variables, input]
related: [config-files, reserved-variables]
related-code: [interpreter/eval/import.ts, core/env/EnvironmentVariables.ts]
updated: 2026-01-05
---

Allow env vars in config, then import via `@input`.

**mlld-lock.json:**

```json
{
  "security": {
    "allowedEnv": ["MLLD_NODE_ENV", "MLLD_API_KEY", "MLLD_GITHUB_TOKEN"]
  }
}
```

**Usage:**

```mlld
import { @MLLD_NODE_ENV, @MLLD_API_KEY } from @input
show `Running in @MLLD_NODE_ENV`
```

All env vars must be prefixed with `MLLD_`.
