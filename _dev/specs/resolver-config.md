# Resolver Configuration Specification

Version: 1.0  
Last Updated: 2025-05-30

## Overview

This document specifies how to configure module resolvers in mlld. Resolvers enable loading modules from various sources like local files, GitHub repos, or custom locations.

## Configuration Location

All resolver configuration lives in lock files:
- **Global**: `~/.mlld/mlld.lock.json` - User-wide resolvers
- **Project**: `./mlld.lock.json` - Project-specific resolvers

## Configuration Format

### Basic Structure
```json
{
  "version": 1,
  "registries": [
    {
      "prefix": "@custom-name/",
      "resolver": "resolver-type",
      "config": {
        /* resolver-specific configuration */
      }
    }
  ],
  "modules": { /* ... */ },
  "security": { /* ... */ }
}
```

### Registry Entry Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| prefix | string | Yes | Module namespace (must start with @ and end with /) |
| resolver | string | Yes | Resolver type or path to custom resolver |
| config | object | Yes | Resolver-specific configuration |

## Built-in Resolvers

### 1. DNS Resolver (public modules)
Default resolver for `@user/module` pattern - no configuration needed.

### 2. Local Resolver
```json
{
  "prefix": "@notes/",
  "resolver": "local",
  "config": {
    "path": "~/Documents/Notes",
    "extensions": [".mld", ".md"],
    "recursive": true
  }
}
```

**Config Options**:
- `path` (required): Base directory path
- `extensions`: File extensions to try (default: [".mld"])
- `recursive`: Allow nested paths (default: true)

### 3. GitHub Resolver
```json
{
  "prefix": "@work/",
  "resolver": "github",
  "config": {
    "owner": "company",
    "repo": "mlld-modules",
    "branch": "main",
    "path": "modules",
    "token": "${GITHUB_TOKEN}"
  }
}
```

**Config Options**:
- `owner` (required): GitHub username or organization
- `repo` (required): Repository name
- `branch`: Branch name (default: "main")
- `path`: Subdirectory in repo (default: "")
- `token`: Access token for private repos

### 4. HTTP Resolver
```json
{
  "prefix": "@api/",
  "resolver": "http",
  "config": {
    "baseUrl": "https://modules.example.com",
    "headers": {
      "Authorization": "Bearer ${API_TOKEN}"
    },
    "urlPattern": "{baseUrl}/{module}.mld"
  }
}
```

**Config Options**:
- `baseUrl` (required): Base URL for modules
- `headers`: HTTP headers to include
- `urlPattern`: URL template (default: "{baseUrl}/{module}.mld")

## Custom Resolvers

### Local File Resolver
```json
{
  "prefix": "@custom/",
  "resolver": "./my-resolver.js",
  "config": {
    "customOption": "value"
  }
}
```

### NPM Package Resolver
```json
{
  "prefix": "@notion/",
  "resolver": "@mlld-community/notion-resolver",
  "config": {
    "token": "${NOTION_TOKEN}",
    "workspace": "my-workspace"
  }
}
```

## Module Reference Format

With resolvers configured, import modules using their prefix:

```mlld
# Resolves via @notes/ → local resolver → ~/Documents/Notes/prompts/greeting.mld
@import { welcome } from @notes/prompts/greeting

# Resolves via @work/ → GitHub resolver → company/mlld-modules/utils/strings.mld
@import { format } from @work/utils/strings  

# Resolves via DNS (no prefix match) → alice-utils.public.mlld.ai
@import { helper } from @alice/utils
```

## Resolution Rules

### Prefix Matching
1. Exact prefix match wins
2. Longest prefix match wins for overlaps
3. First match wins for same-length prefixes
4. No match → try DNS resolver

### Examples
```json
{
  "registries": [
    { "prefix": "@work/", "resolver": "github" },
    { "prefix": "@workspace/", "resolver": "local" }
  ]
}
```

- `@work/module` → github resolver
- `@workspace/module` → local resolver  
- `@alice/module` → DNS resolver (no match)

## Environment Variables

### Variable Expansion
Use `${VARIABLE}` syntax in config values:

```json
{
  "config": {
    "token": "${GITHUB_TOKEN}",
    "path": "${HOME}/modules"
  }
}
```

### Supported Variables
- System environment variables
- `${HOME}` - User home directory
- `${PWD}` - Current working directory
- `${PROJECT_ROOT}` - mlld project root

## Security Considerations

### Token Storage
- Never commit tokens directly
- Use environment variables
- Consider secure credential stores

### Path Validation
- Resolvers should validate paths
- Prevent directory traversal
- Respect filesystem permissions

### Network Security
- HTTPS recommended for HTTP resolver
- Validate SSL certificates
- Handle timeouts gracefully

## Error Handling

### Missing Resolver
```
Error: Unknown resolver type: 'custom'

Available resolvers: local, github, http
To use a custom resolver, provide a file path or npm package name
```

### Configuration Error
```
Error: Invalid configuration for github resolver

Missing required field: 'repo'
Required fields: owner, repo
```

### Resolution Failure
```
Error: Failed to resolve @work/utils

GitHub resolver error: Repository not found (404)
Check your configuration:
  owner: company
  repo: wrong-name  ← Check this
```

## Examples

### Personal Setup
```json
{
  "registries": [
    {
      "prefix": "@prompts/",
      "resolver": "local", 
      "config": {
        "path": "~/Obsidian/Prompts"
      }
    },
    {
      "prefix": "@scratch/",
      "resolver": "local",
      "config": {
        "path": "~/Desktop/mlld-scratch"
      }
    }
  ]
}
```

### Corporate Setup
```json
{
  "registries": [
    {
      "prefix": "@internal/",
      "resolver": "github",
      "config": {
        "owner": "acme-corp",
        "repo": "mlld-internal",
        "token": "${GITHUB_ENTERPRISE_TOKEN}"
      }
    },
    {
      "prefix": "@shared/",
      "resolver": "http",
      "config": {
        "baseUrl": "https://mlld.acme.corp/modules",
        "headers": {
          "X-API-Key": "${ACME_API_KEY}"
        }
      }
    }
  ]
}
```

### Mixed Development
```json
{
  "registries": [
    {
      "prefix": "@dev/",
      "resolver": "local",
      "config": {
        "path": "./local-modules"
      }
    },
    {
      "prefix": "@prod/",
      "resolver": "github",
      "config": {
        "owner": "mycompany",
        "repo": "production-modules",
        "branch": "stable"
      }
    }
  ]
}
```

## Migration Guide

### From Hardcoded Paths
```mlld
# Old
@import { x } from [../../../shared/modules/utils.mld]

# New (with resolver)
@import { x } from @shared/utils
```

### From URLs
```mlld
# Old  
@import { x } from "https://raw.githubusercontent.com/..."

# New (with resolver)
@import { x } from @github/utils
```

## Future Extensions

- Resolver chains (fallback)
- Conditional resolvers
- Resolver middleware
- Package.json integration
- Monorepo support