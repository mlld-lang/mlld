# MCP Server Metadata Specification

Version: 1.0  
Last Updated: 2025-05-29

## Overview

This document specifies the metadata format for MCP (Model Context Protocol) servers in the mlld registry. MCP servers enable mlld scripts to interact with external tools and services.

## Metadata Structure

```json
{
  "name": "@user/module-mcp",
  "type": "mcp-server",
  "version": "1.0.0",
  "description": "Brief description of the MCP server",
  "author": { ... },
  "mcp": { ... },
  "source": { ... },
  "security": { ... },
  "requirements": { ... },
  "metadata": { ... }
}
```

## Field Specifications

### name (required)
Module identifier following mlld naming convention
- Format: `@user/module-mcp`
- Example: `@alice/github-mcp`

### type (required)
Must be: `"mcp-server"`

This discriminator differentiates MCP servers from regular mlld modules.

### version (required)
Semantic version of the MCP server
- Format: `X.Y.Z`
- Example: `"1.2.3"`

### description (required)
Brief description, <200 characters

Examples:
- "GitHub API integration for mlld scripts"
- "PostgreSQL database access via MCP"
- "Slack notifications and messaging"

### author (required)
Author information

Format:
```json
{
  "name": "Alice Johnson",
  "email": "alice@example.com",  // optional
  "github": "alicej",            // optional
  "url": "https://alice.dev"     // optional
}
```

### mcp (required)
MCP-specific configuration

Format:
```json
{
  "version": "0.1.0",           // MCP protocol version
  "transport": ["stdio", "websocket"],
  "executable": "github-mcp",   // Binary name or path
  "capabilities": { ... },
  "configuration": { ... }
}
```

#### capabilities
Declares server capabilities:

```json
{
  "tools": [
    {
      "name": "create_issue",
      "description": "Create a GitHub issue",
      "parameters": {
        "type": "object",
        "properties": {
          "repo": {
            "type": "string",
            "description": "Repository name (owner/repo)"
          },
          "title": {
            "type": "string", 
            "description": "Issue title"
          },
          "body": {
            "type": "string",
            "description": "Issue body (markdown)"
          },
          "labels": {
            "type": "array",
            "items": { "type": "string" },
            "description": "Issue labels"
          }
        },
        "required": ["repo", "title"]
      }
    }
  ],
  "resources": [
    {
      "uri": "github://repos/*",
      "description": "Access GitHub repositories",
      "mimeType": "application/json"
    }
  ],
  "prompts": [
    {
      "name": "pr_review",
      "description": "Generate a pull request review",
      "arguments": [
        {
          "name": "pr_url",
          "description": "Pull request URL",
          "required": true
        }
      ]
    }
  ]
}
```

#### configuration
Schema for server configuration:

```json
{
  "schema": {
    "type": "object",
    "properties": {
      "github_token": {
        "type": "string",
        "description": "GitHub personal access token",
        "secret": true
      },
      "api_url": {
        "type": "string", 
        "description": "GitHub API URL",
        "default": "https://api.github.com"
      }
    },
    "required": ["github_token"]
  }
}
```

### source (required)
Where to obtain the MCP server

Format:
```json
{
  "type": "gist|github|npm|binary",
  "url": "https://...",
  "hash": "sha256-...",
  "size": 1048576,  // bytes
  "platforms": {
    "darwin-arm64": {
      "url": "https://...",
      "hash": "sha256-..."
    },
    "linux-x64": {
      "url": "https://...", 
      "hash": "sha256-..."
    }
  }
}
```

### security (required)
Security requirements and audit information

Format:
```json
{
  "permissions": [
    "network",      // Makes network requests
    "filesystem",   // Reads/writes files
    "process",      // Spawns processes
    "github-api"    // Domain-specific permissions
  ],
  "sandbox": {
    "required": true,
    "type": "process|wasm|docker"
  },
  "audit": {
    "lastReviewed": "2024-01-15T10:00:00Z",
    "reviewer": "@security-team",
    "report": "https://github.com/mlld-lang/audits/mcp/github-mcp-v1.0.0.md"
  },
  "vulnerabilities": []  // Known CVEs or advisories
}
```

### requirements (optional)
System requirements

Format:
```json
{
  "mlldVersion": ">=0.5.0",
  "runtime": {
    "node": ">=18.0.0",     // If Node.js based
    "python": ">=3.9",      // If Python based
    "binary": true          // If standalone binary
  },
  "os": ["darwin", "linux", "win32"],
  "arch": ["x64", "arm64"]
}
```

### metadata (required)
Registry metadata

Format:
```json
{
  "publishedAt": "2024-01-15T10:00:00Z",
  "updatedAt": "2024-01-15T14:00:00Z",
  "downloads": 1234,
  "stars": 56,
  "keywords": ["github", "api", "vcs"],
  "license": "MIT",
  "homepage": "https://github.com/alice/github-mcp",
  "bugs": "https://github.com/alice/github-mcp/issues",
  "repository": "https://github.com/alice/github-mcp"
}
```

## Complete Example

```json
{
  "name": "@alice/github-mcp",
  "type": "mcp-server",
  "version": "1.0.0",
  "description": "GitHub API integration for mlld scripts via MCP",
  "author": {
    "name": "Alice Johnson",
    "github": "alicej",
    "email": "alice@example.com"
  },
  "mcp": {
    "version": "0.1.0",
    "transport": ["stdio"],
    "executable": "github-mcp",
    "capabilities": {
      "tools": [
        {
          "name": "create_issue",
          "description": "Create a GitHub issue",
          "parameters": {
            "type": "object",
            "properties": {
              "repo": {
                "type": "string",
                "description": "Repository (owner/repo)"
              },
              "title": {
                "type": "string",
                "description": "Issue title"  
              },
              "body": {
                "type": "string",
                "description": "Issue body"
              }
            },
            "required": ["repo", "title"]
          }
        },
        {
          "name": "search_code",
          "description": "Search code across GitHub",
          "parameters": {
            "type": "object", 
            "properties": {
              "query": {
                "type": "string",
                "description": "Search query"
              },
              "language": {
                "type": "string",
                "description": "Programming language"
              }
            },
            "required": ["query"]
          }
        }
      ],
      "resources": [
        {
          "uri": "github://repos/*",
          "description": "Repository information",
          "mimeType": "application/json"
        }
      ]
    },
    "configuration": {
      "schema": {
        "type": "object",
        "properties": {
          "github_token": {
            "type": "string",
            "description": "GitHub personal access token",
            "secret": true
          }
        },
        "required": ["github_token"]
      }
    }
  },
  "source": {
    "type": "github",
    "url": "https://github.com/alice/github-mcp/releases/download/v1.0.0/github-mcp.tar.gz",
    "hash": "sha256-Qw1bHtLNfhLjfW5V7HgqTB3G6HgpTbSjs8yH4rPkLJI=",
    "size": 2097152,
    "platforms": {
      "darwin-arm64": {
        "url": "https://github.com/alice/github-mcp/releases/download/v1.0.0/github-mcp-darwin-arm64",
        "hash": "sha256-abc123..."
      },
      "linux-x64": {
        "url": "https://github.com/alice/github-mcp/releases/download/v1.0.0/github-mcp-linux-x64",
        "hash": "sha256-def456..."
      }
    }
  },
  "security": {
    "permissions": ["network", "github-api"],
    "sandbox": {
      "required": true,
      "type": "process"
    },
    "audit": {
      "lastReviewed": "2024-01-15T10:00:00Z",
      "reviewer": "@security-team",
      "report": "https://github.com/mlld-lang/audits/mcp/github-mcp-v1.0.0.md"
    },
    "vulnerabilities": []
  },
  "requirements": {
    "mlldVersion": ">=0.5.0",
    "os": ["darwin", "linux"],
    "arch": ["x64", "arm64"]
  },
  "metadata": {
    "publishedAt": "2024-01-15T10:00:00Z",
    "updatedAt": "2024-01-15T14:00:00Z",
    "downloads": 1234,
    "stars": 56,
    "keywords": ["github", "api", "vcs", "mcp"],
    "license": "MIT",
    "homepage": "https://github.com/alice/github-mcp",
    "bugs": "https://github.com/alice/github-mcp/issues",
    "repository": "https://github.com/alice/github-mcp"
  }
}
```

## Usage in mlld

### Import and Use
```mlld
# Import MCP server
@import mcp github from @alice/github-mcp

# Configure (prompts for token if not cached)
@mcp:config github {
  github_token: "{{GITHUB_TOKEN}}"
}

# Use tools
@mcp issue = github.create_issue({
  repo: "mlld-lang/mlld",
  title: "Feature request: Add MCP support",
  body: "It would be great if..."
})

# Access resources
@mcp repo = github.resource("github://repos/mlld-lang/mlld")
```

## Validation Rules

### Required Fields
All fields marked as required must be present.

### Type Validation
- `type` must be exactly `"mcp-server"`
- `version` must be valid semver
- `mcp.version` must be supported MCP version

### Capability Validation
- Tool names must be unique
- Parameters must be valid JSON Schema
- Resource URIs must follow pattern

### Security Validation  
- Permissions must be from allowed set
- Audit required for network permissions
- Sandbox required for process permissions

## Future Extensions

- Streaming capabilities
- Event subscriptions  
- Batch operations
- Capability negotiation
- Version compatibility matrix