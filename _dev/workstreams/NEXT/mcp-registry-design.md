# MCP (Model Context Protocol) Registry Design

**Status**: Early Planning  
**Priority**: P2 - Future expansion  
**Estimated Time**: 2 weeks design, 1 month implementation  
**Dependencies**: Base registry system working

## Objective

Extend the mlld registry to support MCP servers, enabling mlld scripts to interact with AI tools, databases, and external services through a standardized protocol.

## Background

MCP (Model Context Protocol) is Anthropic's protocol for connecting AI assistants to external tools and data sources. By integrating MCP servers into mlld, we can:

- Enable mlld scripts to query databases
- Connect to development tools
- Access real-time data sources
- Integrate with AI services
- Create tool compositions

## Registry Extension

### Discriminated Registry Format
```json
{
  "name": "@alice/github-mcp",
  "type": "mcp-server",  // New type discriminator
  "description": "MCP server for GitHub operations",
  "author": {
    "name": "Alice Johnson",
    "github": "alicej"
  },
  "mcp": {
    "version": "0.1.0",
    "transport": ["stdio", "websocket"],
    "capabilities": {
      "tools": [
        {
          "name": "create_issue",
          "description": "Create a GitHub issue",
          "parameters": {
            "type": "object",
            "properties": {
              "repo": { "type": "string" },
              "title": { "type": "string" },
              "body": { "type": "string" }
            }
          }
        }
      ],
      "resources": [
        {
          "uri": "github://repos/*",
          "description": "Access GitHub repositories"
        }
      ]
    }
  },
  "source": {
    "type": "gist",
    "url": "https://gist.githubusercontent.com/..."
  },
  "security": {
    "permissions": ["network", "github-api"],
    "audit": {
      "lastReviewed": "2024-01-15",
      "reviewer": "@security-team"
    }
  }
}
```

## mlld Integration

### Import Syntax
```mlld
# Import MCP server
@import mcp github from @alice/github-mcp

# Use MCP tools
@mcp result = github.create_issue({
  repo: "mlld-lang/mlld",
  title: "Feature request",
  body: "Add support for..."
})

# Access MCP resources  
@mcp repos = github.resource("github://repos/mlld-lang")
```

### New Directive: @mcp
```mlld
# Call MCP tool
@mcp issue = github.create_issue(params)

# Stream from MCP
@mcp stream logs = debugger.tail_logs({ 
  service: "api-server",
  lines: 100 
})

# Query MCP resource
@mcp data = database.query({
  sql: "SELECT * FROM users WHERE active = true"
})
```

## Security Model

### Permission System
```json
{
  "mcp_permissions": {
    "@alice/github-mcp": {
      "granted": ["network", "github-api"],
      "denied": ["filesystem", "shell"],
      "trust": "verify",
      "expires": "2024-12-31"
    }
  }
}
```

### Security Controls
1. **Capability declaration**: MCP servers must declare capabilities
2. **Permission prompts**: Users approve permissions on install
3. **Sandboxing**: Run MCP servers in isolated processes
4. **Audit trail**: Log all MCP operations
5. **Resource limits**: CPU, memory, network quotas

## Implementation Architecture

### MCP Runner
```typescript
// core/mcp/MCPRunner.ts
export class MCPRunner {
  async start(serverId: string, config: MCPConfig): Promise<MCPClient> {
    // Spawn MCP server process
    // Establish transport (stdio/websocket)
    // Validate capabilities
    // Return client interface
  }
  
  async call(client: MCPClient, tool: string, params: any): Promise<any> {
    // Check permissions
    // Make RPC call
    // Handle response
    // Log operation
  }
}
```

### Registry Integration
```typescript
// core/registry/MCPRegistry.ts
export class MCPRegistry {
  async resolve(mcpRef: string): Promise<MCPMetadata> {
    // Resolve MCP server from registry
    // Validate MCP-specific metadata
    // Check security audit status
  }
  
  async install(mcpRef: string): Promise<void> {
    // Download MCP server
    // Verify integrity
    // Install dependencies
    // Register with system
  }
}
```

## CLI Commands

### MCP-Specific Commands
```bash
# List available MCP servers
mlld mcp search "github"

# Install MCP server
mlld mcp install @alice/github-mcp

# List installed MCP servers
mlld mcp list

# Show MCP server details
mlld mcp info @alice/github-mcp

# Test MCP server
mlld mcp test @alice/github-mcp

# Update permissions
mlld mcp permissions @alice/github-mcp --grant network
```

## Discovery & Documentation

### MCP Server Pages
Registry website shows:
- Available tools and resources
- Required permissions
- Usage examples
- Security audit status
- Community reviews

### Interactive Explorer
```javascript
// Try MCP tools in browser
const demo = {
  server: "@alice/github-mcp",
  tool: "search_issues",
  params: {
    query: "is:open label:bug"
  }
};
```

## Quality Standards

### MCP Server Requirements
1. **Clear documentation**: Every tool and resource documented
2. **Error handling**: Graceful failure modes
3. **Performance**: Response time <1s for most operations
4. **Security**: No arbitrary code execution
5. **Versioning**: Semantic versioning required

### Review Process
- Automated capability scanning
- Security audit for permissions
- Performance benchmarking
- Community testing period
- Approval by reviewers

## Implementation Phases

### Phase 1: Registry Support
1. [ ] Extend registry schema for MCP
2. [ ] Add MCP validation rules
3. [ ] Create MCP section on website
4. [ ] Document MCP standards
5. [ ] Create example servers

### Phase 2: Core Integration  
1. [ ] Implement @mcp directive
2. [ ] Create MCP runner
3. [ ] Add permission system
4. [ ] Build client interface
5. [ ] Add security controls

### Phase 3: Developer Tools
1. [ ] MCP server template
2. [ ] Testing framework
3. [ ] Debug/trace tools
4. [ ] Performance profiler
5. [ ] SDK for server creation

### Phase 4: Ecosystem
1. [ ] Official MCP servers
2. [ ] Integration guides
3. [ ] Certification program
4. [ ] Marketplace features
5. [ ] Usage analytics

## Example MCP Servers

### Development Tools
- `@mlld/github-mcp` - GitHub operations
- `@mlld/gitlab-mcp` - GitLab integration  
- `@mlld/jira-mcp` - Issue tracking
- `@mlld/slack-mcp` - Notifications

### Data Sources
- `@mlld/postgres-mcp` - PostgreSQL queries
- `@mlld/redis-mcp` - Cache operations
- `@mlld/elasticsearch-mcp` - Search queries
- `@mlld/prometheus-mcp` - Metrics

### AI Services
- `@mlld/openai-mcp` - GPT integration
- `@mlld/claude-mcp` - Anthropic API
- `@mlld/stable-diffusion-mcp` - Image generation

## Success Criteria

- [ ] 10+ high-quality MCP servers
- [ ] Security vulnerabilities: 0
- [ ] Average response time <500ms
- [ ] Developer satisfaction >4/5
- [ ] Clear permission model

## Future Considerations

- MCP server composition
- Cross-server communication
- Distributed MCP servers
- Real-time subscriptions
- MCP server marketplace

## Notes

- Start with read-only operations
- Focus on developer tools first
- Ensure Claude Desktop compatibility
- Consider rate limiting
- Plan for monitoring/observability

## Related Documentation

### Architecture & Vision
- [`REGISTRY-VISION.md`](../../REGISTRY-VISION.md) - MCP as part of the broader registry ecosystem (Phase 5)
- [`ARCHITECTURE.md`](../../ARCHITECTURE.md) - Extension points for MCP integration
- [`SECURITY-PRINCIPLES.md`](../../SECURITY-PRINCIPLES.md) - Security model for external tool integration

### Specifications
- [`specs/mcp-metadata.md`](../../specs/mcp-metadata.md) - MCP server metadata format
- [`specs/import-syntax.md`](../../specs/import-syntax.md) - Import syntax extensions for MCP
- [`specs/ttl-trust-syntax.md`](../../specs/ttl-trust-syntax.md) - Trust levels for MCP servers

### Related Work
- [`archive/2025-05-evolution/REGISTRY-MCP-EXPANSION.md`](../../archive/2025-05-evolution/REGISTRY-MCP-EXPANSION.md) - Original MCP registry expansion ideas
- Model Context Protocol documentation at https://modelcontextprotocol.io