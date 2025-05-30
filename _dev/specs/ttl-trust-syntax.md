# TTL and Trust Syntax Specification

Version: 1.0  
Last Updated: 2025-05-29

## Overview

TTL (Time To Live) and Trust options provide inline control over caching and security policies in mlld. These options can be applied to imports, URLs, and commands.

## Syntax Forms

### Basic Structure
```mlld
directive source (ttl) <trust level>
```

Both options are optional and can be used independently or together:
- `(ttl)` - Controls cache behavior
- `<trust level>` - Controls security verification

## TTL (Time To Live)

### Purpose
TTL controls how long content should be cached before refreshing from the source.

### Syntax
```mlld
(value)(unit)
```

### Time Units
| Unit | Meaning | Example |
|------|---------|---------|
| s | seconds | `(30s)` |
| m | minutes | `(5m)` |
| h | hours | `(1h)` |
| d | days | `(7d)` |
| w | weeks | `(2w)` |

### Special Values
| Value | Meaning | Use Case |
|-------|---------|----------|
| `(live)` | Always fetch fresh | Real-time data |
| `(static)` | Never refresh (default) | Immutable content |

### Examples
```mlld
# Refresh every 30 minutes
@import { weather } from @api/weather (30m)

# Always get latest
@text news = @url "https://api.news.com/latest" (live)

# Cache for a week  
@path data = [./remote-data.json] (7d)

# Never refresh (explicit)
@import { utils } from @alice/helpers (static)
```

### Default TTL Values
- Local files: `(static)`
- Registry modules: `(static)` 
- URLs: `(24h)`
- Commands: N/A (not cached)

## Trust Levels

### Purpose
Trust levels control security verification and approval requirements.

### Syntax
```mlld
<trust level>
```

### Trust Levels
| Level | Behavior | Use Case |
|-------|----------|----------|
| `<trust always>` | Skip all security checks | Trusted internal code |
| `<trust verify>` | Prompt for approval (default) | Unknown sources |
| `<trust never>` | Block execution/import | Known dangerous code |

### Examples
```mlld
# Always trust internal tools
@import { deploy } from @company/tools <trust always>

# Verify external modules (default)
@import { parse } from @community/parser <trust verify>

# Block dangerous operations
@exec cleanup() = @run [rm -rf /] <trust never>

# Trust specific commands
@run [npm test] <trust always>
```

### Default Trust Levels
- Local files: `<trust always>`
- Registry modules: `<trust verify>`
- URLs: `<trust verify>`
- Commands: `<trust verify>`

## Combined Usage

### Syntax Order
TTL always comes before trust level:
```mlld
directive source (ttl) <trust level>
```

### Examples
```mlld
# API with cache and verification
@import { api } from @external/service (1h) <trust verify>

# Live data, always trusted
@text status = @url "https://internal.company.com/status" (live) <trust always>

# Cached but needs verification
@import { toolkit } from @tools/cli (7d) <trust verify>

# Never cache, never trust
@path config = @url "https://sketchy.site/config" (live) <trust never>
```

## Whitespace Rules

### Flexible Spacing
All of these are valid:
```mlld
@import{x}from@alice/utils(1h)<trust always>  # Minimal
@import { x } from @alice/utils (1h) <trust always>  # Normal
@import { x } from @alice/utils (1h)   <trust always>  # Extra space
@import { x } from @alice/utils
  (1h) 
  <trust always>  # Multiline
```

### Not Allowed
```mlld
# Wrong order
@import { x } from @alice/utils <trust always> (1h)  # ❌

# Invalid unit
@import { x } from @alice/utils (30minutes)  # ❌

# Missing brackets/angles
@import { x } from @alice/utils 1h trust always  # ❌
```

## Applicable Directives

### Import Directive
```mlld
@import { name } from source (ttl) <trust>
```
Applies to: modules, files, URLs, stdin

### Text Directive (URL/Path RHS)
```mlld
@text content = @url "https://..." (ttl) <trust>
@text data = @path [./file] (ttl) <trust>  
```

### Path Directive
```mlld
@path file = [./data.json] (ttl) <trust>
@path remote = @url "https://..." (ttl) <trust>
```

### Add Directive (URL/Path sources)
```mlld
@add @url "https://..." (ttl) <trust>
@add @path [./template.mld] (ttl) <trust>
```

### Run/Exec Directives (Trust only)
```mlld
@run [command] <trust>
@exec cmd() = @run [command] <trust>
```
Note: Commands don't have TTL (not cached)

## Precedence Rules

### TTL Precedence (Specific Wins)
```
Inline > Project Lock > Global Lock > Default
  ↓         ↓              ↓           ↓
 (30m)     (1h)           (7d)      (static)
```

More specific contexts can optimize caching.

### Trust Precedence (Restrictive Wins)  
```
Global Block > Project Block > Inline > Default
     ↓             ↓            ↓         ↓
  <never>       <never>      <verify>  <verify>
```

Security restrictions cannot be overridden.

## Lock File Integration

TTL and trust decisions are recorded in lock files:

```json
{
  "modules": {
    "@alice/utils": {
      "resolved": "f8h4a9c2...",
      "ttl": "7d",
      "trust": "verify"
    }
  }
}
```

## Error Messages

### Invalid TTL
```
Error: Invalid TTL value: (30min)
       Valid units are: s, m, h, d, w
       Example: (30m) for 30 minutes
```

### Invalid Trust  
```
Error: Invalid trust level: <trust sometimes>
       Valid levels are: always, verify, never
```

### Security Block
```
Error: Operation blocked by trust policy
  @import { dangerous } from @hack/tools <trust never>
  
This has been explicitly marked as untrusted.
```

## Best Practices

### TTL Guidelines
- `(live)` - Real-time data (stock prices, status)
- `(5m)` to `(1h)` - Frequently updated data
- `(1d)` to `(7d)` - Stable external data
- `(static)` - Your own code, immutable data

### Trust Guidelines  
- `<trust always>` - Your code, company internal
- `<trust verify>` - Community modules, new sources
- `<trust never>` - Known bad, learning examples

### Performance vs Security
- TTL affects performance (cache vs fresh)
- Trust affects security (skip vs verify)
- They're independent - tune separately
- Document unusual choices

## Future Extensions

- Conditional TTL: `(live if production else 1h)`
- Trust with expiry: `<trust always until 2024-12-31>`
- Trust delegation: `<trust as @alice>`
- Cache warming: `(1h, prefetch)``