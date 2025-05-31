# Module Resolvers Developer Guide

This guide explains how mlld's module resolver system works, how to configure built-in resolvers, and how to create custom resolvers for private or proprietary module sources.

## Overview

The mlld resolver system enables loading modules from various sources:

- **Public Registry** (DNS-based): `@user/module` → GitHub gists via DNS TXT records
- **Local Files**: Map namespaces to local directories  
- **GitHub Repositories**: Private repos, organizations, specific branches
- **HTTP Endpoints**: Custom APIs, internal services
- **Custom Resolvers**: NPM packages or local scripts for specialized sources

All resolvers are configured in lock files and follow the same interface for consistent behavior.

## Resolver Configuration

### Configuration Location

Resolvers are configured in the `registries` section of lock files:
- **Global**: `~/.mlld/mlld.lock.json` - User-wide resolvers
- **Project**: `./mlld.lock.json` - Project-specific resolvers

### Basic Structure

```json
{
  "version": 1,
  "registries": [
    {
      "prefix": "@namespace/",
      "resolver": "resolver-type",
      "config": {
        // resolver-specific configuration
      }
    }
  ]
}
```

### Resolution Order

1. **Exact prefix match** wins first
2. **Longest prefix** wins for overlapping prefixes
3. **First match** wins for same-length prefixes
4. **DNS resolver** is tried if no prefix matches

## Built-in Resolvers

### 1. DNS Resolver (Default)

The default resolver for public modules using DNS TXT records. No configuration needed.

**Usage:**
```mlld
@import { utils } from @alice/helpers
```

**Resolution Process:**
1. Query DNS: `alice-helpers.registry.mlld.ai`
2. Extract gist URL from TXT record
3. Fetch gist content
4. Cache with SHA-256 hash
5. Update lock file

### 2. Local Resolver

Maps namespaces to local directories.

**Configuration:**
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

**Options:**
- `path` (required): Base directory (supports `~` and environment variables)
- `extensions`: File extensions to try (default: `[".mld"]`)
- `recursive`: Allow nested paths (default: `true`)

**Usage:**
```mlld
@import { welcome } from @notes/prompts/greeting << Resolves to ~/Documents/Notes/prompts/greeting.mld
```

### 3. GitHub Resolver

Access modules from GitHub repositories, including private repos.

**Configuration:**
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

**Options:**
- `owner` (required): GitHub username or organization
- `repo` (required): Repository name
- `branch`: Branch name (default: `"main"`)
- `path`: Subdirectory in repo (default: `""`)
- `token`: Access token for private repos (use environment variables)

**Usage:**
```mlld
@import { format } from @work/utils/strings << Resolves to company/mlld-modules/modules/utils/strings.mld
```

### 4. HTTP Resolver

Generic HTTP endpoint resolver for custom APIs.

**Configuration:**
```json
{
  "prefix": "@api/",
  "resolver": "http",
  "config": {
    "baseUrl": "https://modules.example.com",
    "headers": {
      "Authorization": "Bearer ${API_TOKEN}",
      "X-Client": "mlld"
    },
    "urlPattern": "{baseUrl}/{module}.mld"
  }
}
```

**Options:**
- `baseUrl` (required): Base URL for the API
- `headers`: HTTP headers to include in requests
- `urlPattern`: URL template (default: `"{baseUrl}/{module}.mld"`)

**Usage:**
```mlld
@import { forecast } from @api/weather << Fetches https://modules.example.com/weather.mld
```

## Custom Resolvers

### Creating a Custom Resolver

Custom resolvers are Node.js modules that implement the resolver interface:

```typescript
// my-resolver.js
export class CustomResolver {
  constructor(config) {
    this.config = config;
  }

  async resolve(modulePath) {
    // modulePath: "utils/strings" (without prefix)
    // Return: URL string or file path
    const url = `${this.config.baseUrl}/${modulePath}.mld`;
    return url;
  }

  async canResolve(modulePath) {
    // Optional: check if module exists without fetching
    return true;
  }
}

export default CustomResolver;
```

### Example: Notion Resolver

```javascript
// notion-resolver.js
import { Client } from '@notionhq/client';

export class NotionResolver {
  constructor(config) {
    this.notion = new Client({ auth: config.token });
    this.databaseId = config.databaseId;
  }

  async resolve(modulePath) {
    // Query Notion database for module
    const response = await this.notion.databases.query({
      database_id: this.databaseId,
      filter: {
        property: 'Module Path',
        title: { equals: modulePath }
      }
    });

    if (response.results.length === 0) {
      throw new Error(`Module not found: ${modulePath}`);
    }

    const page = response.results[0];
    const pageId = page.id;
    
    // Get page content
    const blocks = await this.notion.blocks.children.list({
      block_id: pageId
    });

    // Convert Notion blocks to markdown
    const content = this.convertBlocksToMarkdown(blocks.results);
    
    // Return content directly or write to temp file and return path
    const tempFile = `/tmp/notion-${pageId}.mld`;
    await writeFile(tempFile, content);
    return tempFile;
  }

  convertBlocksToMarkdown(blocks) {
    // Implementation to convert Notion blocks to markdown
    // This would be quite involved in practice
    return blocks.map(block => {
      // Convert each block type to markdown
      switch (block.type) {
        case 'paragraph':
          return block.paragraph.rich_text.map(t => t.plain_text).join('');
        // ... handle other block types
      }
    }).join('\n');
  }
}

export default NotionResolver;
```

### Configuration for Custom Resolvers

```json
{
  "prefix": "@notion/",
  "resolver": "./resolvers/notion-resolver.js",
  "config": {
    "token": "${NOTION_TOKEN}",
    "databaseId": "your-database-id"
  }
}
```

Or use NPM packages:

```json
{
  "prefix": "@corporate/",
  "resolver": "@company/mlld-corporate-resolver",
  "config": {
    "apiKey": "${CORPORATE_API_KEY}",
    "environment": "production"
  }
}
```

## Environment Variables

### Variable Expansion

Use `${VARIABLE}` syntax in config values:

```json
{
  "config": {
    "token": "${GITHUB_TOKEN}",
    "path": "${HOME}/modules",
    "baseUrl": "${API_BASE_URL:-https://api.example.com}"
  }
}
```

### Supported Variables

- Any system environment variable
- `${HOME}` - User home directory
- `${PWD}` - Current working directory  
- `${PROJECT_ROOT}` - mlld project root (directory containing mlld.lock.json)
- `${VARIABLE:-default}` - Use default if variable not set

## Security Considerations

### Token Storage

- **Never commit tokens directly** to lock files
- **Use environment variables** for all sensitive data
- **Consider credential managers** like keychain, vault, etc.

### Path Validation

- Local resolvers validate paths to prevent directory traversal
- Paths are resolved relative to configured base directories
- Symbolic links are followed but validated

### Network Security

- HTTPS is strongly recommended for HTTP resolvers
- SSL certificates are validated by default
- Timeouts prevent hanging requests
- Response size limits prevent memory exhaustion

### Trust and TTL

All resolvers support TTL and trust options:

```mlld
>> Cache for 1 hour, always trust
@import { internal } from @work/utils (1h) trust always

>> Always fetch fresh, verify on first use
@import { external } from @api/data (live) trust verify
```

## Error Handling

### Common Error Scenarios

**Missing Resolver:**
```
Error: Unknown resolver type: 'custom-type'

Available resolvers: local, github, http
To use a custom resolver, provide a file path or npm package name
```

**Configuration Error:**
```
Error: Invalid configuration for github resolver

Missing required field: 'repo'
Required fields: owner, repo
Optional fields: branch, path, token
```

**Resolution Failure:**
```
Error: Failed to resolve @work/utils

GitHub resolver error: Repository not found (404)
Check your configuration:
  owner: company
  repo: wrong-name  ← Check this
  token: [set]
```

**Network Error:**
```
Error: Failed to fetch module @api/data

HTTP resolver error: Connection timeout after 30s
The module may be cached locally. Try: mlld ls
```

## Performance Optimization

### Caching Strategy

- **Content Cache**: Modules cached by SHA-256 hash
- **DNS Cache**: TXT records cached with TTL
- **Negative Cache**: Failed resolutions cached briefly
- **Metadata Cache**: Resolver responses cached

### Parallel Resolution

- Multiple imports resolved concurrently
- HTTP requests use connection pooling
- GitHub API requests batched when possible

### Offline Support

- Cache-first resolution when offline
- Graceful degradation to cached versions
- Clear error messages when fresh content required

## Testing Resolvers

### Manual Testing

```bash
# Test a resolver configuration
mlld resolver test @namespace/module

# Check resolver configuration
mlld resolver list

# Clear resolver cache
mlld cache clear --resolver
```

### Automated Testing

```javascript
// test-resolver.js
import { MyResolver } from './my-resolver.js';

async function testResolver() {
  const resolver = new MyResolver({
    baseUrl: 'https://test.example.com'
  });

  try {
    const result = await resolver.resolve('test/module');
    console.log('✓ Resolver works:', result);
  } catch (error) {
    console.error('✗ Resolver failed:', error.message);
  }
}

testResolver();
```

## Migration Patterns

### From Hardcoded Paths

```mlld
>> Before
@import { x } from [../../../shared/modules/utils.mld]

>> After (with local resolver)
@import { x } from @shared/utils
```

### From URLs

```mlld
>> Before
@import { x } from "https://raw.githubusercontent.com/company/repo/main/utils.mld"

>> After (with GitHub resolver)
@import { x } from @company/utils
```

### From Mixed Sources

```mlld
>> Before - inconsistent sources
@import { a } from [./local.mld]
@import { b } from "https://api.example.com/b.mld"
@import { c } from [../../other/c.mld]

>> After - organized namespaces
@import { a } from @local/module
@import { b } from @api/module
@import { c } from @shared/module
```

## Future Enhancements

Based on the current architecture, planned enhancements include:

- **Resolver Chains**: Fallback resolvers when primary fails
- **Conditional Resolution**: Different resolvers based on environment
- **Resolver Middleware**: Transform content during resolution
- **Package.json Integration**: Auto-detect resolver config
- **Monorepo Support**: Workspace-aware resolution

*Note: Some implementation details may need verification as the resolver system is under active development. Consult the latest source code in `core/resolvers/` for current implementation status.*