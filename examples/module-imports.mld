# Module Import Examples

This example demonstrates importing from custom resolvers and the public registry.

## Custom Resolver Import

Import from a custom resolver prefix (requires resolver configuration):

```mlld
@import { utils, config } from @mycompany/shared/utilities
@import { * as helpers } from @internal/lib/helpers
```

## Public Registry Import (DNS-based)

Import from the public registry using username/module pattern:

```mlld
@import { formatDate, parseDate } from @jdoe/date-utils
@import { Chart, Graph } from @dataviz/charts
```

## How It Works

1. **Custom Resolvers** (`@prefix/...`):
   - The ResolverManager checks configured resolver prefixes
   - Each prefix can map to different sources (local, GitHub, HTTP, etc.)
   - Configure in mlld.config.json or mlld.lock.json

2. **Public Registry** (`@username/module`):
   - Falls back to DNS resolution when no resolver prefix matches
   - Looks up TXT records at `_mlld.username.domain`
   - Supports versioning and integrity checks

## Example Configuration

In `mlld.config.json`:
```json
{
  "resolvers": {
    "@mycompany": {
      "type": "github",
      "repo": "mycompany/mlld-modules"
    },
    "@internal": {
      "type": "local",
      "path": "./internal-modules"
    }
  }
}
```

## Security Features

- All imports go through the ImportApproval system
- Content integrity verification via hashes
- Immutable caching for approved imports
- TTL support for time-limited trust