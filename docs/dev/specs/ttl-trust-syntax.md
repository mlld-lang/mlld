# TTL and Trust Syntax Specification

## Overview

This specification defines the syntax for Time-To-Live (TTL) caching and trust levels in mlld directives.

## Syntax Pattern

```
@directive variable = source (ttl) tail-keyword tail-value
```

Where:
- `(ttl)` is optional and appears in parentheses after the source
- `tail-keyword tail-value` pairs appear at the end of the line
- Multiple tail properties require the `with { ... }` syntax

## TTL Syntax

TTL values control caching duration for URL resources.

### Supported Directives
- `@path` - for URL-based paths
- `@import` - for URL-based imports

### TTL Format
- Numeric only: interpreted as milliseconds (e.g., `(5000)`)
- Numeric + letter: natural language duration
  - `s` - seconds (e.g., `(30s)`)
  - `m` - minutes (e.g., `(5m)`)
  - `h` - hours (e.g., `(2h)`)
  - `d` - days (e.g., `(7d)`)
  - `w` - weeks (e.g., `(2w)`)
- Special value: `(static)` - cache indefinitely

### Examples
```mlld
@path api = https://api.example.com/data.json (5m)
@path docs = https://docs.example.com/readme.md (7d)
@import { config } from [https://cdn.example.com/config.mld] (1h)
@import @author/module (static)
```

## Trust Syntax

Trust levels control security validation for resources and command execution.

### Supported Directives
- `@path` - for URL validation
- `@import` - for import source validation
- `@run` - for command execution validation (both direct and exec invocations)
- `@exec` - for exec definition validation

### Exec Command Invocations (Target Design)

Exec-defined commands support tail modifiers uniformly across all contexts:

```mlld
# Define commands
@exec deploy(env) = @run [(./deploy.sh @env)]
@exec fetchData(url) = @run [(curl -s @url)]
@exec processJSON(data) = @run python [(json.loads(@data))]

# Tail modifiers work everywhere (no @run wrapper needed)
@text result = @deploy("prod") trust always
@data output = @fetchData("api.com") | @validateJSON
@add @processJSON(data) | @format @display
@output @deploy("staging") trust verify [deploy.log]
@when @isReady() => @deploy("prod") with { trust: always, pipeline: [@log] }

# Direct @run still supports tail modifiers
@text cmd = @run [(echo "test")] | @uppercase
@data result = @run @deploy("dev") trust always  # Also valid but redundant
```

#### Key Points

1. **Uniform syntax**: Exec invocations support tail modifiers in all contexts
2. **No @run wrapper needed**: `@deploy()` instead of `@run @deploy()`
3. **Same modifier options**: trust, pipeline (|), needs, with
4. **Backwards compatible**: `@run @command()` still works

### Trust Levels
- `always` - Skip security validation (trusted source)
- `never` - Block execution/fetching entirely
- `verify` - Perform full security validation (default)

### Examples
```mlld
# Simple trust syntax
@path config = https://internal.corp.com/config.json trust always
@import [https://github.com/org/repo/file.mld] trust verify
@run [rm -rf temp/] trust always
@exec deploy() = @run [./deploy.sh] trust always

# With TTL
@path data = https://api.example.com/data.json (30m) trust verify
@import @corp/internal-tools (static) trust always
```

## Unified Tail Syntax

All tail keywords are syntactic sugar for `with` clause properties.

### Single Property (Sugar Allowed)
```mlld
@run [echo "Hello"] trust always           # → with { trust: always }
@run [echo "Hello"] | @uppercase           # → with { pipeline: [@uppercase] }
@path url = https://example.com trust verify
```

### Multiple Properties (Object Required)
```mlld
@run [curl api.com] with {
  trust: verify,
  pipeline: [@validate, @parse]
}
```

### Pipe Operator

The `|` operator is an alias for `pipeline`:

```mlld
# These are equivalent
@run [echo "hello"] | @uppercase @capitalize
@run [echo "hello"] pipeline [@uppercase, @capitalize]
@run [echo "hello"] with { pipeline: [@uppercase, @capitalize] }
```

## Grammar Implementation Notes

### Parsing Order
1. Main directive content
2. Optional TTL in parentheses (path/import only)
3. Tail keyword-value pairs
4. Convert all tail syntax to unified `with` clause in AST

### AST Representation
All syntactic sugar is normalized to `with` clause in the AST:

```javascript
// Input: @run [cmd] trust always
{
  "kind": "run",
  "values": {
    "command": [...],
    "withClause": {
      "trust": "always"
    }
  }
}

// Input: @path url = https://example.com (5d) trust verify
{
  "kind": "path",
  "values": {
    "variable": "url",
    "path": [...],
    "ttl": "5d",
    "withClause": {
      "trust": "verify"
    }
  }
}
```

## Security Considerations

1. **Trust Levels**: Default to `verify` when not specified
2. **TTL Validation**: Warn on local file paths with TTL
3. **Command Trust**: Extra validation for destructive commands
4. **URL Trust**: Validate against allowed/blocked domain lists

## Future Extensions

The tail syntax pattern allows easy addition of new modifiers:
- `timeout` - Execution timeout
- `retry` - Retry policy
- `cache` - Custom cache behavior
- `log` - Logging level