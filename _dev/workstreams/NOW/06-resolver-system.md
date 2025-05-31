# Resolver System - Security Boundary & Module Resolution

**Status**: Not Started  
**Priority**: P0 - Core security and architecture feature  
**Estimated Time**: 3-4 days  
**Dependencies**: Import syntax grammar, Security integration

## Objective

Build a pluggable resolver system that serves as **the primary security boundary** for mlld. Resolvers control all data access - modules, files, and outputs. This enables complete sandboxing while making private modules as easy as public ones.

## Key Insight: Resolvers ARE the Security Model

Resolvers aren't just for convenience - they're a complete security boundary. By controlling resolvers, you can:
- Sandbox mlld without giving filesystem access
- Control exactly what data can be read/written
- Create secure environments for untrusted scripts
- Enable web/cloud deployments safely

## Core Concept

Resolvers handle ALL data access, not just modules:

```typescript
interface Resolver {
  name: string;
  type: 'input' | 'output' | 'io';
  canResolve(ref: string): boolean;
  resolve(ref: string): Promise<Content>;
  write?(ref: string, content: string): Promise<void>;  // For output resolvers
}
```

Users configure resolvers in `mlld.lock.json` with security policies:
```json
{
  "security": {
    "policy": {
      "resolvers": {
        "allowCustom": false,  // No new resolvers
        "pathOnlyMode": true   // NO direct filesystem access
      }
    }
  },
  "registries": [
    {
      "prefix": "@data/",
      "resolver": "local",
      "type": "input",
      "config": { 
        "path": "/sandbox/data",
        "readonly": true
      }
    },
    {
      "prefix": "@output/", 
      "resolver": "s3",
      "type": "output",
      "config": { 
        "bucket": "results",
        "permissions": ["write"]
      }
    }
  ]
}
```

## Built-in Resolvers

### 1. DNS Resolver (default public)
- For public modules: `@user/module`
- Uses DNS TXT records at `public.mlld.ai`
- Makes it crystal clear these are PUBLIC modules
- No configuration needed

### 2. Local Resolver (sandboxed filesystem)
```json
{
  "prefix": "@notes/",
  "resolver": "local",
  "type": "io",
  "config": {
    "path": "~/Documents/Notes",
    "extensions": [".mld", ".md"],
    "readonly": false,
    "allowParentAccess": false  // Security: no ../
  }
}
```
Maps: `@notes/prompts/customer` → `~/Documents/Notes/prompts/customer.mld`

### 3. GitHub Resolver (private repos)
```json
{
  "prefix": "@work/",
  "resolver": "github",
  "type": "input",  // Read-only by default
  "config": {
    "org": "company",
    "repo": "private-modules",
    "branch": "main",
    "token": "${GITHUB_TOKEN}"
  }
}
```

### 4. HTTP Resolver
```json
{
  "prefix": "@api/",
  "resolver": "http",
  "type": "input",
  "config": {
    "baseUrl": "https://modules.company.com",
    "auth": "Bearer ${API_TOKEN}",
    "timeout": 30000,
    "allowedDomains": ["company.com"]  // Security whitelist
  }
}
```

### 5. Output Resolvers (New)
```json
{
  "prefix": "@logs/",
  "resolver": "local",
  "type": "output",
  "config": {
    "path": "./outputs",
    "format": "json",
    "maxSize": "10MB"
  }
}
```

## Architecture

### ResolverManager with Security
```typescript
export class ResolverManager {
  private resolvers: Map<string, Resolver> = new Map();
  private configs: RegistryConfig[] = [];
  private security: SecurityPolicy;
  
  constructor(security: SecurityPolicy) {
    this.security = security;
    
    // Register built-in resolvers
    this.register(new DNSResolver());
    this.register(new LocalResolver());
    this.register(new GitHubResolver());
    this.register(new HTTPResolver());
    this.register(new S3Resolver());
  }
  
  async resolve(ref: string): Promise<Content> {
    // Security: Block direct paths in path-only mode
    if (this.security.pathOnlyMode && !ref.startsWith('@')) {
      throw new MlldSecurityError(
        'Path-only mode: Direct filesystem access blocked. Use resolvers.'
      );
    }
    
    // Check configured registries
    for (const config of this.configs) {
      if (ref.startsWith(config.prefix)) {
        // Security: Check if resolver is allowed
        if (!this.security.isResolverAllowed(config.resolver)) {
          throw new MlldSecurityError(
            `Resolver '${config.resolver}' not allowed by security policy`
          );
        }
        
        const resolver = this.resolvers.get(config.resolver);
        if (resolver) {
          return await resolver.resolve(ref, config);
        }
      }
    }
    
    // Fallback to DNS for @user/module pattern
    if (ref.match(/^@[a-z0-9-]+\/[a-z0-9-]+/)) {
      return await this.resolvers.get('dns')!.resolve(ref);
    }
    
    throw new Error(`No resolver found for: ${ref}`);
  }
  
  async write(ref: string, content: string): Promise<void> {
    // Find output resolver for this reference
    const config = this.findOutputResolver(ref);
    if (!config) {
      throw new Error(`No output resolver for: ${ref}`);
    }
    
    const resolver = this.resolvers.get(config.resolver);
    if (resolver?.write) {
      await resolver.write(ref, content, config);
    }
  }
}
```

### Resolver Interface
```typescript
export interface Resolver {
  name: string;
  description: string;
  type: 'input' | 'output' | 'io';
  
  canResolve(ref: string, config?: any): boolean;
  
  // For input resolvers
  resolve(ref: string, config?: any): Promise<Content>;
  
  // For output resolvers
  write?(ref: string, content: string, config?: any): Promise<void>;
  
  // Optional: list available items
  list?(prefix: string, config?: any): Promise<ContentInfo[]>;
  
  // Optional: validate configuration
  validateConfig?(config: any): string[];
  
  // Security: validate access
  checkAccess?(ref: string, operation: 'read' | 'write', config?: any): Promise<boolean>;
}

export interface Content {
  content: string;
  metadata?: {
    source: string;
    timestamp: Date;
    author?: string;
    hash?: string;  // Content hash for integrity
    taintLevel?: TaintLevel;  // Security tracking
  };
}
```

## Configuration

### Complete Sandbox Example (mlld.lock.json)
```json
{
  "version": 1,
  "security": {
    "policy": {
      "resolvers": {
        "allowCustom": false,
        "allowedResolvers": ["local", "s3"],
        "pathOnlyMode": true  // Complete sandboxing!
      },
      "imports": {
        "maxDepth": 3
      }
    }
  },
  "registries": [
    {
      "prefix": "@data/",
      "resolver": "local",
      "type": "input",
      "config": {
        "path": "/sandbox/readonly",
        "readonly": true
      }
    },
    {
      "prefix": "@output/",
      "resolver": "s3",
      "type": "output",
      "config": {
        "bucket": "my-outputs",
        "region": "us-east-1"
      }
    }
  ]
}
```

### Development Setup (less restrictive)
```json
{
  "version": 1,
  "security": {
    "policy": {
      "resolvers": {
        "allowCustom": true,
        "pathOnlyMode": false  // Allow direct filesystem
      }
    }
  },
  "registries": [
    {
      "prefix": "@work/",
      "resolver": "github",
      "type": "input",
      "config": {
        "org": "company",
        "repo": "mlld-modules"
      }
    }
  ]
}
```

## Resolver Repository

### mlld-lang/resolvers
```
resolvers/
├── README.md
├── core/                   # Built-in resolvers
│   ├── dns/
│   ├── filesystem/
│   ├── github/
│   ├── obsidian/
│   └── http/
├── community/              # Community resolvers
│   ├── s3/
│   ├── gitlab/
│   ├── notion/
│   └── airtable/
├── examples/               # Example implementations
│   ├── simple/
│   └── advanced/
└── test/                   # Test harness for resolvers
```

### Resolver Development
```typescript
// example-resolver.ts
import { Resolver, ModuleContent } from '@mlld/resolver-api';

export class NotionResolver implements Resolver {
  name = 'notion';
  description = 'Load modules from Notion pages';
  
  canResolve(moduleRef: string): boolean {
    return moduleRef.includes('/');
  }
  
  async resolve(moduleRef: string, config: any): Promise<ModuleContent> {
    const pageId = this.moduleRefToPageId(moduleRef, config);
    const content = await this.fetchNotionPage(pageId, config.token);
    
    return {
      content: this.extractMlldContent(content),
      metadata: {
        source: `notion://${pageId}`,
        timestamp: new Date()
      }
    };
  }
}
```

## Implementation Plan

### Phase 1: Core Architecture with Security (Day 1)
1. [ ] Define Resolver interface with input/output types
2. [ ] Build ResolverManager with security checks
3. [ ] Create configuration loader from lock file
4. [ ] Implement path-only mode enforcement
5. [ ] Add resolver whitelist validation
6. [ ] Update Environment to use ResolverManager

### Phase 2: Built-in Resolvers (Day 1-2)
1. [ ] Refactor DNS to resolver pattern (mark as PUBLIC)
2. [ ] Implement Local resolver with security bounds
3. [ ] Implement GitHub resolver with auth
4. [ ] Implement HTTP resolver with domain whitelist
5. [ ] Implement S3 resolver for outputs
6. [ ] Add readonly/writeonly enforcement

### Phase 3: Security Integration (Day 2-3)
1. [ ] Integrate with SecurityManager
2. [ ] Add taint tracking per resolver
3. [ ] Implement access control checks
4. [ ] Add audit logging for resolver access
5. [ ] Test sandboxing scenarios
6. [ ] Document security configurations

### Phase 4: Output System Integration (Day 3)
1. [ ] Implement @output directive support
2. [ ] Add output resolver routing
3. [ ] Support multiple outputs per script
4. [ ] Add format conversion (json/xml/yaml)
5. [ ] Test output sandboxing

### Phase 5: CLI and Developer Experience (Day 3-4)
1. [ ] Add `mlld resolver list` command
2. [ ] Add `mlld resolver test` command
3. [ ] Create resolver template/generator
4. [ ] Add resolver debugging with `--debug-resolvers`
5. [ ] Write security best practices guide
6. [ ] Create sandboxing examples

## Use Cases

### Personal Knowledge Management
```json
{
  "prefix": "@notes/",
  "resolver": "local",
  "config": {
    "path": "~/Knowledge/templates/prompts"
  }
}
```

### Corporate Modules
```json
{
  "prefix": "@acme/",
  "resolver": "github",
  "config": {
    "org": "acme-corp",
    "repo": "internal-mlld",
    "token": "${GITHUB_TOKEN}"
  }
}
```

### Local Development
```json
{
  "prefix": "@dev/",
  "resolver": "filesystem",
  "config": {
    "path": "../my-modules",
    "watch": true
  }
}
```

## Success Criteria

- [ ] Public modules work unchanged
- [ ] Private modules just as easy
- [ ] Obsidian integration works
- [ ] Custom resolvers possible
- [ ] Clear error messages
- [ ] Fast resolution (<50ms)
- [ ] Secure token handling

## Security Model

### Resolvers as Security Boundary
- **Path-only mode**: No direct filesystem access, only resolvers
- **Resolver whitelist**: Control which resolvers can be used
- **Type separation**: Input vs output resolvers
- **Access control**: Each resolver validates permissions
- **Audit logging**: All resolver access logged to ~/.mlld/audit/

### Security Best Practices
- Use path-only mode for untrusted scripts
- Whitelist specific resolvers in production
- Separate input/output resolvers
- Use readonly flags where possible
- Review audit logs regularly

### Example: Complete Sandbox
```mlld
# This script can ONLY:
# - Read from @data/ (sandboxed directory)
# - Write to @output/ (S3 bucket)
# - No filesystem access
# - No network access
# - No command execution

@import { template } from @data/templates/report
@data results = @data/analysis/latest.json

@text report = [[{{template}} with {{results}}]]
@output @report to @output/reports/daily.json
```

## Future Ideas

- Resolver marketplace/registry
- Lazy loading for large vaults
- Caching strategies per resolver
- Resolution webhooks
- Multi-resolver fallback chains
- Web-based resolver for browser mlld
- Encrypted resolver for sensitive data
- Blockchain resolver for immutable modules

## Related Documentation

### Architecture & Vision
- [`_dev/ARCHITECTURE.md`](../../ARCHITECTURE.md) - Module system architecture
- [`_dev/REGISTRY-VISION.md`](../../REGISTRY-VISION.md) - Registry ecosystem vision
- [`_dev/SECURITY-PRINCIPLES.md`](../../SECURITY-PRINCIPLES.md) - Security model

### Specifications
- [`_dev/specs/import-syntax.md`](../../specs/import-syntax.md) - Import syntax spec
- [`_dev/specs/lock-file-format.md`](../../specs/lock-file-format.md) - Security policies
- [`_dev/specs/resolver-config.md`](../../specs/resolver-config.md) - Resolver configuration

### Implementation References
- [`_dev/workstreams/NOW/02-security-integration.md`](./02-security-integration.md) - Security integration
- [`_dev/workstreams/NOW/03-hash-cache-imports.md`](./03-hash-cache-imports.md) - Uses resolvers
- [`_dev/workstreams/NOW/04-registry-gists.md`](./04-registry-gists.md) - DNS resolver