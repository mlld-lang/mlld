---
id: publishing-private
qa_tier: 3
title: Publishing Private Modules
brief: Private and internal module distribution
category: modules
parent: publishing
tags: [modules, publishing, private, resolvers]
related: [resolvers, publishing-public, local-development]
related-code: [cli/commands/install.ts]
updated: 2026-02-24
---

For private or internal modules, use local imports or custom resolvers instead of the public registry.

## Local Filesystem

Distribute modules via git or file sharing:

```mlld
import { @helper } from "./shared/utils.mld"
import "./lib/internal" as @internal
```

## Custom Resolvers

Configure custom `@` prefixes for private registries or internal repos:

```json
{
  "resolvers": {
    "@company": "https://internal-registry.company.com/modules"
  }
}
```

```mlld
import { @auth } from @company/auth-utils
```

See `mlld howto resolvers` for resolver configuration.

## Development Modules

Use `llm/modules/` for in-development modules:

```mlld
import local { @tool } from @alice/dev-module
```

These are resolved from the local `llm/modules/` directory without registry lookup.
