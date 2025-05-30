# Registry MVP - Gist-based Module Storage

**Status**: Not Started  
**Priority**: P0 - Enables module sharing  
**Estimated Time**: 2 days  
**Dependencies**: Hash-cache system

## Objective

Create a minimal registry using GitHub Gists as infrastructure, with DNS TXT records for discovery. This gives us a working registry with zero server costs.

## Architecture

### Module Publishing Flow
1. Author creates a gist with their .mld file
2. Author gets the raw content URL with specific commit hash
3. Author submits PR to registry repo with module metadata
4. DNS TXT record created: `user-module.registry.mlld.ai`
5. TXT record contains gist raw URL

### Module Resolution Flow  
1. User imports: `@import { x } from @alice/utils`
2. CLI queries: `alice-utils.registry.mlld.ai` TXT record
3. TXT record returns: `v=mlld1;url=https://gist.githubuserco...`
4. CLI fetches content from URL
5. Content cached locally by hash

## Registry Repository Structure

### github.com/mlld-lang/registry
```
registry/
├── README.md
├── modules/
│   ├── alice/
│   │   ├── utils.json
│   │   └── math-helpers.json
│   └── bob/
│       └── api-client.json
├── dns/
│   ├── terraform/     # or simple scripts
│   └── records.json   # DNS record manifest
└── tools/
    ├── validate.js    # PR validation
    └── publish.js     # Author tool
```

### Module Metadata Format
```json
{
  "name": "@alice/utils",
  "description": "Common utilities for mlld scripts",
  "author": {
    "name": "Alice Johnson",
    "github": "alicej"
  },
  "source": {
    "type": "gist",
    "id": "8bb1c645c1cf0dd515bd8f834fb82fcf",
    "hash": "59d76372d3c4a93e7aae34cb98b13a8e99dfb95f",
    "url": "https://gist.githubusercontent.com/alicej/8bb1c645c1cf0dd515bd8f834fb82fcf/raw/59d76372d3c4a93e7aae34cb98b13a8e99dfb95f/utils.mld"
  },
  "keywords": ["utils", "helpers", "strings"],
  "mlldVersion": ">=0.5.0",
  "publishedAt": "2024-01-15T10:30:00Z",
  "stats": {
    "installs": 0,
    "stars": 0
  }
}
```

### DNS TXT Record Format
```
alice-utils.registry.mlld.ai. IN TXT "v=mlld1;url=https://gist.githubusercontent.com/alicej/8bb1c645c1cf0dd515bd8f834fb82fcf/raw/59d76372d3c4a93e7aae34cb98b13a8e99dfb95f/utils.mld"
```

## Implementation Components

### 1. Registry Client Updates
```typescript
// core/registry/RegistryClient.ts
export class RegistryClient {
  private dnsResolver = new DNSResolver();
  
  async resolve(moduleId: string): Promise<ModuleInfo> {
    // Convert @alice/utils to alice-utils.registry.mlld.ai
    const domain = this.moduleToDomain(moduleId);
    
    try {
      // Query DNS TXT record
      const txtRecords = await this.dnsResolver.resolveTxt(domain);
      const mlldRecord = this.parseMlldRecord(txtRecords);
      
      if (mlldRecord) {
        return {
          id: moduleId,
          url: mlldRecord.url,
          source: 'registry'
        };
      }
    } catch (e) {
      // DNS lookup failed
    }
    
    // Fallback to local registry cache
    return this.fetchFromGitHub(moduleId);
  }
  
  private parseMlldRecord(records: string[]): { url: string } | null {
    // Parse "v=mlld1;url=..." format
  }
}
```

### 2. DNS Resolver
```typescript
// core/registry/DNSResolver.ts
import { Resolver } from 'dns/promises';

export class DNSResolver {
  private resolver = new Resolver();
  
  async resolveTxt(domain: string): Promise<string[]> {
    // Use Cloudflare DNS (1.1.1.1) for consistency
    this.resolver.setServers(['1.1.1.1', '1.0.0.1']);
    
    const records = await this.resolver.resolveTxt(domain);
    return records.flat();
  }
}
```

### 3. Registry Cache
```typescript
// core/registry/RegistryCache.ts
export class RegistryCache {
  private cacheFile = '~/.mlld/registry/modules.json';
  private cache: Map<string, ModuleMetadata> = new Map();
  
  async sync(): Promise<void> {
    // Fetch latest modules.json from GitHub
    const response = await fetch(
      'https://raw.githubusercontent.com/mlld-lang/registry/main/modules.json'
    );
    
    // Update local cache
    const modules = await response.json();
    this.updateCache(modules);
  }
  
  async search(query: string): Promise<ModuleMetadata[]> {
    // Search local cache
  }
}
```

### 4. Author Tools
```typescript
// cli/commands/publish.ts
export async function publish(gistUrl: string) {
  console.log(`
To publish your module:

1. Ensure your gist is public
2. Copy the raw URL (with commit hash)
3. Fork https://github.com/mlld-lang/registry
4. Add your module metadata to modules/[username]/[module].json
5. Submit a pull request

Module metadata template:
${JSON.stringify(moduleTemplate, null, 2)}
  `);
}
```

## DNS Management

### Option 1: Terraform (Automated)
```hcl
# dns/terraform/main.tf
resource "cloudflare_record" "module" {
  for_each = local.modules
  
  zone_id = var.cloudflare_zone_id
  name    = "${each.key}.registry"
  type    = "TXT"
  value   = "v=mlld1;url=${each.value.url}"
  ttl     = 300
}
```

### Option 2: Script (Manual)
```bash
#!/bin/bash
# dns/update-records.sh

# Read modules and create DNS records
jq -r '.[] | "\(.name | sub("@";"") | sub("/";"_")).registry.mlld.ai. IN TXT \"v=mlld1;url=\(.source.url)\""' \
  modules.json > records.txt

# Use nsupdate or cloud provider CLI
```

## Registry Website Integration

Add registry browsing to mlld.ai:

### Data Fetching
```javascript
// website/src/_data/registry.js
module.exports = async function() {
  const response = await fetch(
    'https://raw.githubusercontent.com/mlld-lang/registry/main/modules.json'
  );
  
  const modules = await response.json();
  
  return {
    modules: modules,
    byAuthor: groupByAuthor(modules),
    byKeyword: groupByKeyword(modules),
    recent: getRecentModules(modules)
  };
};
```

### Browse Page
```njk
<!-- website/src/registry/index.njk -->
---
layout: base.njk
title: mlld Registry
---

<h1>Module Registry</h1>

<div class="search">
  <input type="text" id="search" placeholder="Search modules...">
</div>

<div class="modules">
  {% for module in registry.modules %}
  <div class="module-card">
    <h3><a href="/registry/{{ module.name | slug }}">{{ module.name }}</a></h3>
    <p>{{ module.description }}</p>
    <div class="meta">
      By {{ module.author.name }} • {{ module.stats.installs }} installs
    </div>
  </div>
  {% endfor %}
</div>
```

## Implementation Steps

### Phase 1: Registry Repository (Day 1 Morning)
1. [ ] Create mlld-lang/registry repository
2. [ ] Set up directory structure
3. [ ] Create example modules (3-5)
4. [ ] Write validation script
5. [ ] Set up GitHub Actions for validation

### Phase 2: DNS Infrastructure (Day 1 Afternoon)
1. [ ] Choose DNS provider (Cloudflare recommended)
2. [ ] Create registry.mlld.ai subdomain
3. [ ] Write DNS update script/terraform
4. [ ] Create initial TXT records
5. [ ] Test DNS resolution

### Phase 3: Client Integration (Day 1 Evening)
1. [ ] Add DNS resolver to RegistryClient
2. [ ] Implement TXT record parsing
3. [ ] Add fallback to GitHub registry
4. [ ] Test module resolution
5. [ ] Add caching for DNS results

### Phase 4: Registry Cache (Day 2 Morning)
1. [ ] Implement local registry cache
2. [ ] Add sync command
3. [ ] Add search functionality
4. [ ] Add offline support
5. [ ] Test various scenarios

### Phase 5: Website Integration (Day 2 Afternoon)
1. [ ] Add registry data fetching
2. [ ] Create browse page
3. [ ] Create module detail pages
4. [ ] Add search functionality
5. [ ] Deploy to mlld.ai

### Phase 6: Author Experience (Day 2 Evening)
1. [ ] Write publishing guide
2. [ ] Create PR template
3. [ ] Add module validation
4. [ ] Document best practices
5. [ ] Create example modules

## Testing

### DNS Resolution
```bash
# Test DNS lookup
dig TXT alice-utils.registry.mlld.ai

# Should return:
# "v=mlld1;url=https://gist.githubusercontent.com/..."
```

### Module Import
```mlld
@import { greet } from @alice/utils
@add [[{{greet}}]]
```

### Registry Sync
```bash
mlld registry sync
mlld registry search utils
mlld registry info @alice/utils
```

## Success Criteria

- [ ] Modules resolvable via DNS
- [ ] Zero server infrastructure needed
- [ ] Registry browsable on mlld.ai
- [ ] Clear publishing process
- [ ] Fast resolution (<200ms)
- [ ] Offline support via cache
- [ ] 10+ example modules published

## Future Enhancements

- GitHub repo support (not just gists)
- Private registries (GitHub auth)
- Module versioning (beyond hash)
- Download statistics
- Star ratings
- Advisory integration
- MCP server entries

## Notes

- Start simple, can migrate to real API later
- DNS TTL = 5 minutes for quick updates
- Gist raw URLs include commit hash for immutability
- Registry repo is source of truth
- Consider npm registry compatibility

## Related Documentation

### Architecture & Vision
- [`REGISTRY-VISION.md`](../../REGISTRY-VISION.md) - Complete registry ecosystem vision and roadmap
- [`ARCHITECTURE.md`](../../ARCHITECTURE.md) - Registry system architecture (Module System section)
- [`SECURITY-PRINCIPLES.md`](../../SECURITY-PRINCIPLES.md) - Security considerations for module distribution

### Specifications
- [`specs/import-syntax.md`](../../specs/import-syntax.md) - Module import syntax specification
- [`specs/lock-file-format.md`](../../specs/lock-file-format.md) - How modules are tracked in lock files
- [`specs/advisory-format.md`](../../specs/advisory-format.md) - Future security advisory integration

### Implementation References
- [`core/registry/`](../../../core/registry/) - Existing registry implementation
- [`archive/2025-05-evolution/REGISTRY-PHASE1-DNS.md`](../../archive/2025-05-evolution/REGISTRY-PHASE1-DNS.md) - Detailed DNS design