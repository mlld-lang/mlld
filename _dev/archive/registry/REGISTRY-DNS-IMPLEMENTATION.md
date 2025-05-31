# Mlld Registry: DNS for Gists Implementation

## Overview

A minimal registry that provides:
1. Human-friendly names for gist imports
2. Security advisories for known issues
3. Integration with existing security infrastructure

## Implementation Plan (2 Days)

### Day 1: Core Registry

#### 1. Create Registry Repository Structure

```
mlld-lang/registry/
├── registry.json          # Main registry
├── advisories.json        # Security advisories
├── README.md             # How to register
└── .github/
    └── PULL_REQUEST_TEMPLATE.md
```

#### 2. Registry Format

```json
{
  "version": "1.0.0",
  "updated": "2024-01-25T10:00:00Z",
  "modules": {
    "prompts/code-review": {
      "gist": "anthropics/a1f3e09a42db6c680b454f6f93efa9d8",
      "author": "anthropics",
      "description": "Code review prompt templates",
      "tags": ["prompts", "code-review", "ai"]
    },
    "utils/json-formatter": {
      "gist": "mlld-lang/b2f4e09a42db6c680b454f6f93efa9d8",
      "author": "mlld-lang",
      "description": "JSON formatting utilities",
      "tags": ["utils", "json", "formatting"]
    }
  }
}
```

#### 3. Advisories Format

```json
{
  "advisories": [
    {
      "id": "MLLD-2024-001",
      "created": "2024-01-25T10:00:00Z",
      "severity": "high",
      "affects": [
        "prompts/data-extractor",
        "utils/file-scanner"
      ],
      "gists": [
        "eviluser/c3f5e09a42db6c680b454f6f93efa9d8"
      ],
      "type": "data-exposure",
      "description": "Module may expose environment variables through template interpolation",
      "recommendation": "Review template for {{process.env}} usage before importing"
    }
  ]
}
```

#### 4. Import Resolution (~100 lines)

```typescript
// In interpreter/eval/import.ts
import { SecurityManager } from '@core/security/SecurityManager';

async function resolveRegistryImport(importPath: string): Promise<string> {
  // Extract module name from mlld://registry/prompts/code-review
  const moduleName = importPath.replace('mlld://registry/', '');
  
  // Fetch registry (with caching)
  const registry = await fetchRegistry();
  
  const module = registry.modules[moduleName];
  if (!module) {
    throw new MlldImportError(`Unknown registry module: ${moduleName}`);
  }
  
  // Check advisories
  await checkAdvisories(moduleName, module.gist);
  
  // Return resolved gist path
  return `mlld://gist/${module.gist}`;
}

async function fetchRegistry(): Promise<Registry> {
  // Use existing ImmutableCache
  const cache = SecurityManager.getInstance().getCache();
  const cacheKey = 'registry:main';
  
  // Check cache (1 hour TTL)
  const cached = await cache.get(cacheKey);
  if (cached && cached.age < 3600000) {
    return cached.data;
  }
  
  // Fetch from GitHub
  const response = await fetch(
    'https://raw.githubusercontent.com/mlld-lang/registry/main/registry.json'
  );
  const data = await response.json();
  
  // Cache it
  await cache.set(cacheKey, data, { ttl: 3600000 });
  
  return data;
}
```

### Day 2: Security Integration & CLI

#### 1. Advisory Checking (~150 lines)

```typescript
// In security/registry/AdvisoryChecker.ts
export class AdvisoryChecker {
  constructor(private securityManager: SecurityManager) {}
  
  async checkModule(moduleName: string, gistId: string): Promise<Advisory[]> {
    const advisories = await this.fetchAdvisories();
    
    return advisories.filter(advisory => 
      advisory.affects.includes(moduleName) ||
      advisory.gists.includes(gistId)
    );
  }
  
  async promptUser(advisories: Advisory[]): Promise<boolean> {
    if (advisories.length === 0) return true;
    
    console.log('\n⚠️  Security Advisories Found:');
    
    for (const advisory of advisories) {
      console.log(`\n${this.formatSeverity(advisory.severity)}: ${advisory.id}`);
      console.log(`Type: ${advisory.type}`);
      console.log(`Description: ${advisory.description}`);
      console.log(`Recommendation: ${advisory.recommendation}`);
    }
    
    // Use existing approval flow
    return await this.securityManager.promptApproval(
      'Import module with security advisories?'
    );
  }
  
  private formatSeverity(severity: string): string {
    const icons = {
      high: '🔴',
      medium: '🟡',
      low: '🟢'
    };
    return `${icons[severity]} ${severity.toUpperCase()}`;
  }
}
```

#### 2. CLI Commands (~200 lines)

```typescript
// In cli/commands/registry.ts
export async function registryCommand(args: string[]) {
  const subcommand = args[0];
  
  switch (subcommand) {
    case 'search':
      return searchRegistry(args[1]);
    case 'info':
      return showModuleInfo(args[1]);
    case 'audit':
      return auditProject();
    default:
      console.log('Usage: mlld registry [search|info|audit]');
  }
}

async function searchRegistry(query: string) {
  const registry = await fetchRegistry();
  
  const results = Object.entries(registry.modules)
    .filter(([name, module]) => 
      name.includes(query) || 
      module.description.toLowerCase().includes(query.toLowerCase()) ||
      module.tags.some(tag => tag.includes(query))
    )
    .slice(0, 10);
  
  console.log(`\nFound ${results.length} modules:\n`);
  
  for (const [name, module] of results) {
    console.log(`  ${name}`);
    console.log(`    ${module.description}`);
    console.log(`    Author: ${module.author}`);
    console.log(`    Tags: ${module.tags.join(', ')}\n`);
  }
}

async function auditProject() {
  // Find all .mld files
  const files = await glob('**/*.mld');
  const imports = new Set<string>();
  
  // Extract imports
  for (const file of files) {
    const content = await fs.readFile(file, 'utf8');
    const matches = content.matchAll(/@import.*from\s+"mlld:\/\/registry\/([^"]+)"/g);
    for (const match of matches) {
      imports.add(match[1]);
    }
  }
  
  // Check advisories
  const checker = new AdvisoryChecker(SecurityManager.getInstance());
  const allAdvisories = [];
  
  for (const moduleName of imports) {
    const registry = await fetchRegistry();
    const module = registry.modules[moduleName];
    if (module) {
      const advisories = await checker.checkModule(moduleName, module.gist);
      allAdvisories.push(...advisories);
    }
  }
  
  if (allAdvisories.length === 0) {
    console.log('✅ No security advisories found');
  } else {
    console.log(`⚠️  Found ${allAdvisories.length} advisories`);
    // Display advisories...
  }
}
```

#### 3. Integration with Import Flow

```typescript
// Update interpreter/eval/import.ts
async function evaluateImport(node: ImportNode, env: Environment): Promise<void> {
  let resolvedPath = node.path;
  
  // NEW: Handle registry imports
  if (resolvedPath.startsWith('mlld://registry/')) {
    resolvedPath = await resolveRegistryImport(resolvedPath);
  }
  
  // Existing gist handling
  if (resolvedPath.startsWith('mlld://gist/')) {
    // Check advisories for direct gist imports too
    const gistId = resolvedPath.replace('mlld://gist/', '');
    const checker = new AdvisoryChecker(env.securityManager);
    const advisories = await checker.checkModule(null, gistId);
    
    if (advisories.length > 0) {
      const approved = await checker.promptUser(advisories);
      if (!approved) {
        throw new MlldImportError('Import cancelled due to security advisories');
      }
    }
  }
  
  // Continue with existing import logic...
}
```

## Registry Submission Process

### For Module Authors

1. Fork `mlld-lang/registry`
2. Add entry to `registry.json`:
   ```json
   "category/my-module": {
     "gist": "myusername/gist-id",
     "author": "myusername",
     "description": "What it does",
     "tags": ["relevant", "tags"]
   }
   ```
3. Submit PR with:
   - Link to gist
   - Brief description
   - Example usage

### For Security Researchers

1. Email security@mlld-lang.org or
2. Submit issue to mlld-lang/registry with:
   - Affected modules/gists
   - Severity assessment
   - Proof of concept
   - Recommendation

## Integration with Existing Security

The registry integrates with the MVP security plan:

1. **Uses existing ImportApproval** for user consent
2. **Uses ImmutableCache** for registry caching
3. **Adds to audit log** when advisories are found
4. **Respects security policy** for blocked patterns

## Testing

```bash
# Test registry resolution
echo '@import { reviewer } from "mlld://registry/prompts/code-review"' > test.mld
mlld test.mld

# Test advisory detection
mlld registry audit

# Test search
mlld registry search prompt
```

## Future Enhancements

1. **Version support**: `mlld://registry/utils/json@1.2.0`
2. **Publisher verification**: Verified checkmarks
3. **Download stats**: Track popular modules
4. **Web UI**: Browse registry online

But for now, this gives us:
- Human-friendly imports ✓
- Security advisories ✓
- Zero infrastructure ✓
- Community-driven ✓