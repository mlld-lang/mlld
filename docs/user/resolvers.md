# mlld Resolvers

## tldr

Resolvers control how mlld imports find content. Use custom resolvers to create @ -prefixed aliases for local paths, private repos, or any content source. Configure with `mlld setup` or `mlld alias`.

## Built-in Resolvers

mlld includes resolvers for common sources:

### Registry Resolver

Registry modules from mlld-lang/registry:

```mlld
import { @helper } from @alice/utils
import { @helper } from @alice/utils@1.0.0
import { @helper } from @alice/utils@beta
import { @helper } from @alice/utils@^1.0.0
```

- Requires: `mlld install @alice/utils`
- Offline after install
- Version-locked via mlld-lock.json
- Content-addressed caching
- Supports version specifiers (@module@1.0.0)
- Supports tags (@module@beta, @module@latest)
- Supports semver ranges (@module@^1.0.0, @module@~1.2.0)

### Local Resolver

Project-relative file paths:

```mlld
import { @config } from <./config.mld>
import { @helpers } from <../shared/utils.mld>
```

- Reads from filesystem
- No caching (always fresh)
- Relative to current file
- Fuzzy file extension matching (tries `.mld`, `.mld.md`, `.md`)
- Automatic extension resolution (you can omit the extension)

### HTTP Resolver

Web resources via HTTPS/HTTP:

```mlld
import cached(1h) <https://example.com/utils.mld> as @remote
```

- Caches with TTL (time-to-live)
- Validates via ETag/Last-Modified
- Default TTL: 5 minutes

### GitHub Resolver

GitHub repositories and raw URLs:

```mlld
import <https://raw.githubusercontent.com/alice/repo/main/module.mld> as @mod
```

- Works with public repos
- Supports branch/tag/commit references
- Caches by commit SHA

### Static Import Type

**Not a separate resolver** - an import type that uses existing resolvers but embeds content at parse time:

```mlld
import static <./prompt.md> as @systemPrompt
```

- Content embedded in AST during evaluation
- Zero runtime fetch cost after initial load
- Good for templates/prompts
- Works with any resolver (Local, HTTP, GitHub, etc.)

### Local Development Mode

**Not a separate resolver** - configuration of LocalResolver for development:

```mlld
import local { @helper } from @alice/dev-module
```

- Uses LocalResolver configured to read from `llm/modules/`
- Scans **flat directory structure** (all `.mld` files at the top level)
- Matches module name from frontmatter metadata (`author` + `name`)
- Module files should be named descriptively but matching happens via frontmatter
- No caching (always fresh)
- Bypasses registry entirely

**Directory structure:**
```
llm/modules/
├── helper-utils.mld      # Has: author: alice, name: dev-module
├── auth-tools.mld        # Has: author: bob, name: auth
└── data-parser.mld       # Has: author: alice, name: parser
```

**Not this:**
```
llm/modules/
└── @alice/               # ❌ Nested paths won't be discovered
    └── dev-module.mld
```

## Custom Resolvers

Create @ -prefixed aliases for any content source.

### Quick Setup

Interactive wizard:
```bash
mlld setup
```

Prompts for:
- Alias name (e.g., `@notes/`)
- Path or repo URL
- Access type (input/output/both)

### Local Path Alias

Map @ prefix to local directory:

```bash
mlld alias --name notes --path ~/Documents/notes
```

Creates resolver in `mlld-config.json`:
```json
{
  "resolvers": {
    "prefixes": [
      {
        "prefix": "@notes/",
        "resolver": "LOCAL",
        "type": "input",
        "config": {
          "basePath": "/Users/you/Documents/notes"
        }
      }
    ]
  }
}
```

Use it:
```mlld
import <@notes/ideas.md> as @ideas
show @ideas
```

### Private GitHub Repo

Connect private repo:

```bash
mlld setup --github
```

Prompts for:
- Organization/username
- Repository name
- Branch (default: main)
- Base path (default: /)

Creates resolver:
```json
{
  "resolvers": {
    "prefixes": [
      {
        "prefix": "@company/",
        "resolver": "GITHUB",
        "type": "input",
        "config": {
          "repository": "company/private-modules",
          "branch": "main",
          "basePath": "llm/modules"
        }
      }
    ]
  }
}
```

Use it:
```mlld
import { @auth } from @company/auth-utils
```

Requires GitHub auth:
```bash
mlld auth login
```

### Global Aliases

Make alias available everywhere:

```bash
mlld alias --name desktop --path ~/Desktop --global
```

Saves to `~/.config/mlld/mlld-config.json`.

## Resolver Configuration

### Manual Configuration

Edit `mlld-config.json`:

```json
{
  "resolvers": {
    "prefixes": [
      {
        "prefix": "@lib/",
        "resolver": "LOCAL",
        "type": "input",
        "config": {
          "basePath": "./src/lib"
        }
      },
      {
        "prefix": "@shared/",
        "resolver": "LOCAL",
        "type": "input",
        "config": {
          "basePath": "../shared-modules"
        }
      },
      {
        "prefix": "@private/",
        "resolver": "GITHUB",
        "type": "input",
        "config": {
          "repository": "user/private-mlld",
          "branch": "main",
          "basePath": "modules"
        }
      }
    ]
  }
}
```

### Resolver Types

**LOCAL** - Filesystem paths
```json
{
  "prefix": "@notes/",
  "resolver": "LOCAL",
  "config": {
    "basePath": "/path/to/notes"
  }
}
```

**GITHUB** - GitHub repositories
```json
{
  "prefix": "@org/",
  "resolver": "GITHUB",
  "config": {
    "repository": "org/repo",
    "branch": "main",
    "basePath": "llm/modules"
  }
}
```

**HTTP** - Web resources
```json
{
  "prefix": "@cdn/",
  "resolver": "HTTP",
  "config": {
    "baseUrl": "https://cdn.example.com/modules",
    "cacheTTL": "1h"
  }
}
```

### Access Types

Control import/output permissions:

**input** - Import only (read)
```json
{
  "type": "input"
}
```

**output** - Output only (write)
```json
{
  "type": "output"
}
```

**io** - Both import and output
```json
{
  "type": "io"
}
```

## Resolution Priority

When multiple resolvers could handle an import, priority determines which wins:

1. **Exact prefix match** - `@notes/` matches `@notes/ideas.md`
2. **Longest prefix** - `@company/auth/` beats `@company/`
3. **Import type** - Explicit type overrides prefix matching
4. **Built-in priority** - Registry > Local > HTTP

Example:
```mlld
>> These all resolve differently
import { @x } from @alice/utils  >> Registry resolver
import local { @x } from @alice/utils  >> Local dev resolver
import <@notes/utils.mld> as @x  >> Custom @notes/ resolver
```

## Resolver Patterns

### Project Organization

```bash
mlld alias --name lib --path ./src/lib
mlld alias --name shared --path ../shared
mlld alias --name tests --path ./tests
```

Import cleanly:
```mlld
import { @api } from @lib/api
import { @common } from @shared/utils
import { @fixtures } from @tests/fixtures
```

### Team Modules

```json
{
  "resolvers": {
    "prefixes": [
      {
        "prefix": "@team/",
        "resolver": "GITHUB",
        "type": "input",
        "config": {
          "repository": "company/team-modules",
          "branch": "main"
        }
      }
    ]
  }
}
```

Team members import:
```mlld
import { @logger } from @team/logging
import { @db } from @team/database
```

### Multi-Environment

```json
{
  "resolvers": {
    "prefixes": [
      {
        "prefix": "@prod/",
        "resolver": "GITHUB",
        "config": {
          "repository": "company/configs",
          "branch": "production"
        }
      },
      {
        "prefix": "@staging/",
        "resolver": "GITHUB",
        "config": {
          "repository": "company/configs",
          "branch": "staging"
        }
      }
    ]
  }
}
```

Use appropriate alias:
```mlld
import <@prod/config.mld> as @config
>> or
import <@staging/config.mld> as @config
```

### Personal Library

Global alias for personal modules:

```bash
mlld alias --name me --path ~/mlld-modules --global
```

Available in any project:
```mlld
import { @snippet } from @me/snippets
import <@me/prompts/code-review.md> as @prompt
```

## Security Configuration

Control what resolvers can access:

### Allowed Domains

```json
{
  "security": {
    "allowedDomains": [
      "raw.githubusercontent.com",
      "gist.githubusercontent.com",
      "cdn.example.com"
    ]
  }
}
```

### Trusted Domains

Skip approval prompts:

```json
{
  "security": {
    "trustedDomains": [
      "raw.githubusercontent.com"
    ]
  }
}
```

### Blocked Patterns

```json
{
  "security": {
    "blockedPatterns": [
      "*.evil.com",
      "http://*"
    ]
  }
}
```

### Absolute Paths

Control absolute filesystem access:

```json
{
  "security": {
    "allowAbsolutePaths": false
  }
}
```

Requires flag when enabled:
```bash
mlld --allow-absolute script.mld
```

## Caching Behavior

Different resolvers cache differently:

### Registry Modules
- Content-addressed cache in `.mlld/cache/`
- Keyed by SHA256 hash
- Never expires (immutable)
- Offline-capable after install

### Local Files
- No caching
- Read fresh every time
- Detects changes immediately

### HTTP Resources
- Cached with TTL
- Validates with ETag/Last-Modified
- Default TTL: 5 minutes
- Override with `cached(TTL)`

### GitHub Resources
- Cached by commit SHA
- Permanent for commit references
- Revalidated for branch references

## Import Type Override

Force specific resolver:

```mlld
>> Force static (embed)
import static <https://example.com/data.json> as @data

>> Force live (always fresh)
import live <./config.mld> as @config

>> Force cached with TTL
import cached(30m) <@company/utils.mld> as @utils

>> Force local dev
import local { @helper } from @alice/utils
```

Import type takes precedence over resolver configuration.

## Commands

### Setup Resolvers
```bash
mlld setup                    # Interactive wizard
mlld setup --github           # GitHub only
mlld setup --local            # Local paths only
mlld setup --check            # Verify config
mlld setup --add-resolver     # Add new resolver
```

### Create Alias
```bash
mlld alias --name <alias> --path <path>
mlld alias --name <alias> --path <path> --global
```

### Check Configuration
```bash
mlld setup --check
```

Shows:
- Configured resolvers
- Prefix mappings
- Access types
- Validity status

## Troubleshooting

### Resolver Not Found

**Symptom**: `Unknown resolver prefix: @notes/`

**Fix**: Create resolver:
```bash
mlld alias --name notes --path /path/to/notes
```

### Permission Denied

**Symptom**: `Access denied for resolver @company/`

**Fix**: Check access type in config. Should be `input` or `io` for imports.

### GitHub Auth Failed

**Symptom**: `GitHub authentication required`

**Fix**:
```bash
mlld auth login
```

### Cache Issues

**Symptom**: Getting stale content

**Fix**: Adjust caching:
```mlld
>> Force fresh
import live <@resolver/module.mld> as @mod

>> Shorter TTL
import cached(1m) <@resolver/module.mld> as @mod
```

### Path Not Found

**Symptom**: `Module not found: @lib/utils`

**Fix**: Verify basePath in config:
```bash
mlld setup --check
```

Ensure files exist at configured path.

## Best Practices

**Use prefixes consistently**:
- `@lib/` for library code
- `@shared/` for shared modules
- `@company/` for org modules

**Document team aliases**:
Include resolver config in README for team projects.

**Separate dev and prod**:
```mlld
import local { @db } from @team/database  >> Dev
>> vs
import { @db } from @team/database  >> Prod (registry)
```

**Version control config**:
Commit `mlld-config.json` for reproducible imports.

**Use global sparingly**:
Reserve global aliases for truly personal modules.

**Test resolver changes**:
```bash
mlld setup --check  # Before committing
```

## Examples

### Company Setup

```json
{
  "resolvers": {
    "prefixes": [
      {
        "prefix": "@company/",
        "resolver": "GITHUB",
        "type": "input",
        "config": {
          "repository": "company/mlld-modules",
          "branch": "main",
          "basePath": "modules"
        }
      },
      {
        "prefix": "@internal/",
        "resolver": "HTTP",
        "type": "input",
        "config": {
          "baseUrl": "https://internal.company.com/modules",
          "cacheTTL": "1h"
        }
      }
    ]
  }
}
```

### Multi-Project Setup

```json
{
  "resolvers": {
    "prefixes": [
      {
        "prefix": "@project-a/",
        "resolver": "LOCAL",
        "config": { "basePath": "../project-a/modules" }
      },
      {
        "prefix": "@project-b/",
        "resolver": "LOCAL",
        "config": { "basePath": "../project-b/modules" }
      },
      {
        "prefix": "@shared/",
        "resolver": "LOCAL",
        "config": { "basePath": "../shared-modules" }
      }
    ]
  }
}
```

Use across projects:
```mlld
import { @helpers } from @shared/utils
import { @api } from @project-a/client
import { @types } from @project-b/schema
```
