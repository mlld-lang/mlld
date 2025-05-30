# Registry Expansion for MCP Servers

## Overview

Expand the mlld registry to include security advisories for MCP (Model Context Protocol) servers, creating a unified security registry for LLM-integrated tools.

## Proposed Registry Structure

### 1. Discriminated Union Registry Format

Each registry entry would have a `type` field:

```typescript
type RegistryEntry = MlldModule | MCPServer | LLMTool;

interface MlldModule {
  type: "mlld-module";
  gist: string;
  description: string;
  tags: string[];
  created: string;
  // mlld-specific fields
  commands?: string[];  // Detected commands
  imports?: string[];   // Dependencies
}

interface MCPServer {
  type: "mcp-server";
  repository: string;   // GitHub repo
  npm?: string;        // NPM package name
  description: string;
  tags: string[];
  created: string;
  // MCP-specific fields
  capabilities: {
    commands?: boolean;
    filesystem?: boolean;
    network?: boolean;
    databases?: string[];  // sqlite, postgres, etc.
  };
  installation: {
    method: "npm" | "uvx" | "binary";
    command: string;
  };
  config?: {
    required: string[];   // Required config fields
    optional: string[];   // Optional config fields
  };
}

interface LLMTool {
  type: "llm-tool";
  // For future expansion (Simon's llm tools, etc.)
}
```

### 2. Updated Registry Structure

```
mlld-lang/registry/
├── {author}/
│   ├── registry.json         # Author's registry index
│   ├── advisories.json       # Security advisories
│   └── {name}.json          # Individual entry details
├── adamavenir/
│   ├── registry.json
│   ├── advisories.json
│   ├── json-utils.json      # mlld module
│   └── sqlite-mcp.json      # MCP server
└── .github/
    └── workflows/
        └── validate.yml
```

### 3. Example Registry Entry for MCP Server

`adamavenir/sqlite-mcp.json`:
```json
{
  "type": "mcp-server",
  "name": "sqlite-mcp",
  "author": "adamavenir",
  "repository": "https://github.com/adamavenir/sqlite-mcp",
  "npm": "@adamavenir/sqlite-mcp",
  "description": "SQLite database access via MCP",
  "tags": ["database", "sqlite", "mcp"],
  "created": "2024-01-20T10:00:00Z",
  "version": "1.0.0",
  "capabilities": {
    "commands": false,
    "filesystem": true,
    "network": false,
    "databases": ["sqlite"]
  },
  "installation": {
    "method": "npm",
    "command": "npm install -g @adamavenir/sqlite-mcp"
  },
  "config": {
    "required": ["database_path"],
    "optional": ["readonly", "wal_mode"]
  },
  "security": {
    "review": {
      "reviewed": true,
      "reviewedAt": "2024-01-25T10:00:00Z",
      "reviewer": "security-team",
      "rating": "trusted"
    },
    "risks": [
      "filesystem:read",
      "filesystem:write",
      "database:full-access"
    ]
  }
}
```

### 4. Advisory Format Extension

Advisories can now target MCP servers:

```json
{
  "id": "MLLD-2024-002",
  "type": "mcp-server",
  "severity": "high",
  "affects": {
    "modules": ["sqlite-mcp"],
    "versions": ["< 1.0.1"]
  },
  "cwe": ["CWE-89"],
  "description": "SQL injection in query parameter handling",
  "recommendation": "Update to version 1.0.1 or later",
  "references": [
    "https://github.com/adamavenir/sqlite-mcp/security/advisories/GHSA-xxxx"
  ]
}
```

## MCP Server Installation Integration

### 1. CLI Command: `mlld mcp install`

```bash
# Install MCP server with security review
mlld mcp install adamavenir/sqlite-mcp

# Output:
⚠️  MCP Server Security Review
   adamavenir/sqlite-mcp
   
   Capabilities:
   ✓ Commands: No
   ⚠️  Filesystem: Read/Write access
   ✓ Network: No
   ⚠️  Database: Full SQLite access
   
   Security Rating: TRUSTED
   Last Review: 2024-01-25
   
   This server will be added to:
   - Claude Desktop: ~/.config/Claude/claude_desktop_config.json
   - LLM tool: ~/.config/llm/config.json (if installed)
   
Install? [y/N]: y

✅ Installed sqlite-mcp
   Added to Claude Desktop configuration
   
   Required configuration:
   - database_path: Path to your SQLite database
   
   Example:
   {
     "sqlite": {
       "command": "npx",
       "args": ["@adamavenir/sqlite-mcp"],
       "env": {
         "DATABASE_PATH": "/path/to/your.db"
       }
     }
   }
```

### 2. Configuration Management

The installer would:

1. **Check existing configs**:
```typescript
const configs = {
  claude: '~/.config/Claude/claude_desktop_config.json',
  llm: '~/.config/llm/config.json',
  cursor: '~/.cursor/config.json'
};
```

2. **Add server with security metadata**:
```json
{
  "mcpServers": {
    "sqlite": {
      "command": "npx",
      "args": ["@adamavenir/sqlite-mcp"],
      "env": {
        "DATABASE_PATH": ""
      },
      "_security": {
        "source": "mlld://adamavenir/sqlite-mcp",
        "installedAt": "2024-01-25T14:00:00Z",
        "advisories": [],
        "capabilities": ["filesystem:rw", "database:sqlite"]
      }
    }
  }
}
```

### 3. Security Audit for MCP Servers

```bash
mlld mcp audit

Auditing installed MCP servers...

Claude Desktop:
  ✓ sqlite (adamavenir/sqlite-mcp) - No advisories
  ⚠️  web-search (community/web-mcp) - 1 advisory
     HIGH: Unvalidated URL fetching (MLLD-2024-003)
  
LLM Tool:
  ✓ github (official/github-mcp) - No advisories

Found 1 security advisory
Run 'mlld mcp info community/web-mcp' for details
```

### 4. Integration API

Provide a simple API for other tools:

```bash
# Check advisories for an MCP server
curl https://registry.mlld.org/api/v1/advisories/mcp/adamavenir/sqlite-mcp

# Response:
{
  "server": "adamavenir/sqlite-mcp",
  "advisories": [],
  "security": {
    "rating": "trusted",
    "capabilities": ["filesystem:rw", "database:sqlite"],
    "lastReview": "2024-01-25T10:00:00Z"
  }
}
```

## Benefits

1. **Unified Security Registry**: One place for all LLM-integrated tool security
2. **Cross-Tool Compatibility**: Works with Claude, llm, Cursor, etc.
3. **Informed Installation**: Users see capabilities before installing
4. **Audit Trail**: Track what's installed and when
5. **Community Security**: Shared advisories benefit everyone

## Implementation Phases

### Phase 1: Registry Structure
- Extend registry format with discriminated unions
- Add MCP server metadata
- Update validation workflows

### Phase 2: CLI Integration
- `mlld mcp install` command
- `mlld mcp audit` command
- Config file management

### Phase 3: API & Tooling
- REST API for advisory lookups
- GitHub Action for CI/CD integration
- Browser extension for GitHub MCP repos

## Security Considerations

1. **Capability Declaration**: MCP servers must declare what they can do
2. **Review Process**: Community review before "trusted" rating
3. **Sandboxing Info**: Document how to run servers in restricted environments
4. **Update Notifications**: Alert when advisories affect installed servers

## Future Expansions

1. **Capability-Based Policies**: 
   ```json
   {
     "policy": {
       "allow": ["filesystem:read", "network:localhost"],
       "deny": ["filesystem:write", "network:internet"]
     }
   }
   ```

2. **Runtime Monitoring**: Track actual vs declared capabilities

3. **Integration with MCP Registry**: If/when official MCP registry exists

This expansion would position mlld's registry as the security layer for the entire LLM tooling ecosystem, not just mlld modules.