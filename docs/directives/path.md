---
layout: docs.njk
title: "@path Directive"
---

# @path Directive

The `@path` directive defines filesystem path and URL variables that can be used in `@add` and `@run` commands. It supports both local file paths and remote URLs with intelligent caching and security controls.

## Syntax

### Basic Paths
```mlld
@path identifier = "$HOMEPATH/path"
@path identifier = "$~/path"
@path identifier = "$PROJECTPATH/path"
@path identifier = "$./path"
@path identifier = "/absolute/path"
@path identifier = "relative/path"
@path identifier = "../parent/path"
@path identifier = "./current/path"
```

### URLs with Caching and Security
```mlld
@path identifier = "https://example.com/file.md"
@path (TTL) identifier = "https://example.com/file.md"
@path (TTL) trust LEVEL identifier = "https://example.com/file.md"
```

Where:
- `identifier` is the variable name (must be a valid identifier)
- `TTL` is the cache time-to-live (optional, see [URL Caching](#url-caching))
- `LEVEL` is the security trust level (optional, see [Security Options](#security-options))
- Path segments are separated by forward slashes
- Path/URL must be quoted (single, double, or backtick quotes)

## Identifier Requirements

- Must start with a letter or underscore
- Can contain letters, numbers, and underscores
- Case-sensitive
- Cannot be empty

## Path Value Rules

- Must not be empty
- Cannot contain null bytes
- Any standard path format is allowed:
  - Absolute paths (e.g., `/usr/local/bin`) 
  - Relative paths (e.g., `path/to/file`)
  - Paths with dot segments (e.g., `./current` or `../parent`)
  - Paths with special variables (e.g., `$HOMEPATH/path`)

## Special Path Variables (Optional)

Mlld provides special path variables for enhanced cross-platform portability:

- `$HOMEPATH` or `$~`: Refers to the user's home directory
- `$PROJECTPATH` or `$.`: Refers to the current project root directory

Using special path variables is recommended (but not required) for best cross-platform portability.

## Referencing Path Variables

Path variables are referenced using the `$identifier` syntax:

```mlld
@path docs = "$PROJECTPATH/docs"
@add [$docs/guide.md]
```

Path variables can be used:
- Inside square brackets `[...]` for paths and commands
- After a space in command arguments
- With additional path segments appended using `/`

## Examples

Basic path variables:
```mlld
@path docs = "$PROJECTPATH/docs"
@path configs = "$PROJECTPATH/configs"
@path home = "$HOMEPATH/mlld"
```

Using path variables in commands:
```mlld
@path src = "$PROJECTPATH/src"
@run [ls -la $src]
```

Embedding files with path variables:
```mlld
@path templates = "$PROJECTPATH/templates"
@add [$templates/header.md]
```

Using path segments:
```mlld
@path src = "$PROJECTPATH/src"
@add [$src/components/button.js]
```

## Error Handling

The following errors are possible with path directives:
- `INVALID_PATH`: Path is empty or malformed
- `NULL_BYTE`: Path contains null bytes (security restriction)

## Variables in Paths

Paths can include variables, which are resolved during execution:

```mlld
@text dir = "docs"
@path docs = "$PROJECTPATH/{{dir}}"
```

## Path Best Practices

- For cross-platform compatibility, use special path variables `$PROJECTPATH` and `$HOMEPATH`
- Use forward slashes for path separators (even on Windows)
- Be cautious when using absolute paths or parent directory references (`..`), as they may make your Mlld files less portable
- Consider using path variables to encapsulate filesystem paths for better maintainability

## URL Caching

The `@path` directive supports intelligent URL caching to improve performance and reduce network requests.

### TTL (Time-To-Live) Options

Control how long URL content is cached:

```mlld
# Duration-based TTL
@path (30s) api = "https://api.example.com/data.json"    # 30 seconds
@path (5m) template = "https://example.com/template.md"  # 5 minutes  
@path (2h) config = "https://example.com/config.yaml"   # 2 hours
@path (1d) docs = "https://example.com/docs.md"         # 1 day
@path (1w) archive = "https://example.com/archive.zip"  # 1 week
```

```mlld
# Special TTL values
@path (live) feed = "https://api.example.com/live-feed.json"  # Always fetch fresh
@path (static) logo = "https://example.com/logo.png"         # Cache indefinitely
```

**TTL Units:**
- `s`, `sec`, `second`, `seconds` - seconds
- `m`, `min`, `minute`, `minutes` - minutes  
- `h`, `hr`, `hour`, `hours` - hours
- `d`, `day`, `days` - days
- `w`, `week`, `weeks` - weeks

**Special Values:**
- `live` - Always fetch fresh content (no caching)
- `static` - Cache indefinitely (until manual cache clear)

### Default TTL

If no TTL is specified, URLs are cached for **24 hours** by default.

## Security Options

URL access can be controlled with trust levels:

```mlld
@path (30m) trust always api = "http://internal.company.com/api"
@path (1h) trust verify docs = "https://public-docs.example.com"  
@path (1d) trust never unsafe = "http://suspicious-site.com"
```

### Trust Levels

- **`trust always`**: Allow any URL (HTTP or HTTPS)
- **`trust verify`**: Only allow secure HTTPS URLs (default for security)
- **`trust never`**: Block URL access completely

### Security Best Practices

- Use `trust verify` for external URLs to ensure HTTPS
- Use `trust always` only for trusted internal URLs
- Use `trust never` to explicitly block dangerous URLs
- Default trust level is `verify` if not specified

## Combining TTL and Security

Both options can be used together:

```mlld
@path (30m) trust verify template = "https://example.com/template.md"
@path (live) trust always internal = "http://internal.api/live-data"
@path (static) trust verify cdn = "https://cdn.example.com/assets.zip"
```

## Cache Storage

URL cache is stored in your project's `.mlld/` directory:

```
.mlld/
├── cache/           # Content cache (shared with modules)
└── mlld.lock.json   # Cache metadata and TTL settings
```

**Lock File Format:**
```json
{
  "cache": {
    "urls": {
      "https://example.com/template.md": {
        "hash": "sha256-abc123...",
        "cachedAt": "2024-05-30T12:00:00Z", 
        "ttl": "30m",
        "trust": "verify",
        "configuredBy": "@template",
        "expiresAt": "2024-05-30T12:30:00Z"
      }
    }
  }
}
```

## Cache Management

### Automatic Cleanup
- Expired cache entries are automatically removed when accessed
- Cache integrity is verified using SHA-256 hashes
- Corrupted cache entries are automatically regenerated

### Manual Cache Control
```bash
# Clear all URL cache
rm -rf .mlld/cache/

# Clear specific URL from lock file
# Edit .mlld/mlld.lock.json and remove the URL entry
```

## URL Examples

### API Data Caching
```mlld
# Cache API responses for 5 minutes
@path (5m) trust verify weather = "https://api.weather.com/current"
@path (1h) trust verify rates = "https://api.exchange.com/rates"

# Use the cached data
@add @weather
@add @rates
```

### Template Management
```mlld
# Static templates (cache indefinitely)
@path (static) trust verify header = "https://cdn.company.com/header.md"
@path (static) trust verify footer = "https://cdn.company.com/footer.md"

# Live content (always fresh)
@path (live) trust verify news = "https://api.news.com/latest"

@add @header
@add @news
@add @footer
```

### Development vs Production
```mlld
# Development - always fetch fresh
@path (live) trust always dev_config = "http://localhost:3000/config.json"

# Production - cache for 1 hour
@path (1h) trust verify prod_config = "https://api.prod.com/config.json"
```

### Content Distribution
```mlld
# Long-term cacheable assets
@path (1w) trust verify docs = "https://docs.example.com/guide.md"
@path (1d) trust verify images = "https://cdn.example.com/images.zip"

# Frequently updated content  
@path (15m) trust verify blog = "https://blog.example.com/latest.md"
@path (5m) trust verify status = "https://status.example.com/current.json"
```

## Error Handling

### Network Errors
If URL fetching fails, the path variable will fall back to the URL string itself:

```mlld
@path (30m) trust verify unreachable = "https://down.example.com/file.md"
@add @unreachable  # Outputs: https://down.example.com/file.md
```

### Trust Violations
```mlld
@path (30m) trust verify insecure = "http://insecure.example.com/file.md"
# Error: Insecure URL not allowed with trust verify
```

### Cache Corruption
Corrupted cache entries are automatically detected and re-fetched:
- SHA-256 hash mismatches trigger fresh downloads
- Missing cache files are transparently re-fetched
- Lock file inconsistencies are automatically resolved

## Performance Benefits

URL caching provides significant performance improvements:

- **Faster builds**: Cached content loads instantly
- **Reduced bandwidth**: No repeated downloads within TTL
- **Offline capability**: Cached content works without internet
- **Reliability**: Protection against temporary network issues

Example performance comparison:
```
Without caching: 2.3s per build (5 network requests)
With caching:     0.1s per build (0 network requests)
```

## Notes

- Path variables cannot use field access or formatting
- Path variables are distinct from text and data variables  
- In test mode, existence checks can be bypassed
- URL caching works with both `@path` variables and direct URLs in `@add`
- Cache is persistent across mlld runs and shared between projects
- HTTPS URLs are preferred for security; HTTP requires `trust always`