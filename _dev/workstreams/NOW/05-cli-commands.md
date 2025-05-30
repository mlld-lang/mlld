# CLI Commands for Module Management

**Status**: Not Started  
**Priority**: P0 - User-facing functionality  
**Estimated Time**: 1-2 days  
**Dependencies**: Hash-cache system, Registry client

## Objective

Implement CLI commands for module management: install, update, remove, list, and search. Provide an npm-like experience for mlld users. These commands integrate with the resolver system to enable secure module distribution.

## Command Specifications

### mlld install
```bash
# Install a module (shows transitive dependencies for approval)
mlld install @alice/utils

# Install specific version (by hash)
mlld install @alice/utils@f8h4

# Install with security options
mlld install @alice/utils --trust verify
mlld install @alice/utils --ttl 7d

# Install from lock file
mlld install  # (no args, like npm install)

# Install from custom resolver
mlld install @company/internal-tools  # Uses company resolver
```

### mlld update  
```bash
# Update all modules
mlld update

# Update specific module
mlld update @alice/utils

# Check for updates (dry run)
mlld update --dry-run
```

### mlld remove
```bash
# Remove a module
mlld remove @alice/utils
mlld rm @alice/utils  # alias

# Remove unused modules
mlld remove --unused
```

### mlld list
```bash
# List installed modules
mlld list
mlld ls  # alias

# List with details
mlld list --details

# List global modules
mlld list --global

# Show tree (dependencies)
mlld list --tree
```

### mlld search
```bash
# Search registry
mlld search utils
mlld search "string helpers"

# Search with filters
mlld search utils --author alice
```

### mlld info
```bash
# Show module details
mlld info @alice/utils

# Show specific version
mlld info @alice/utils@f8h4
```

## Implementation Structure

### Command Registry (`cli/commands/index.ts`)
```typescript
export const commands = {
  install: {
    aliases: ['i', 'add'],
    description: 'Install mlld modules',
    handler: installCommand
  },
  update: {
    aliases: ['upgrade', 'up'],
    description: 'Update mlld modules',
    handler: updateCommand
  },
  remove: {
    aliases: ['rm', 'uninstall'],
    description: 'Remove mlld modules',
    handler: removeCommand
  },
  list: {
    aliases: ['ls'],
    description: 'List installed modules',
    handler: listCommand
  },
  search: {
    aliases: ['find'],
    description: 'Search for modules',
    handler: searchCommand
  },
  info: {
    aliases: ['show'],
    description: 'Show module details',
    handler: infoCommand
  }
};
```

### Install Command (`cli/commands/install.ts`)
```typescript
interface InstallOptions {
  global?: boolean;
  saveDev?: boolean;
  force?: boolean;
}

export async function installCommand(args: string[], options: InstallOptions) {
  const config = await loadConfig();
  const lockFile = new LockFile(options.global ? config.globalLockPath : './mlld.lock.json');
  const resolver = new ModuleResolver(cache, registry, lockFile);
  
  if (args.length === 0) {
    // Install from lock file
    return installFromLockFile(lockFile, resolver);
  }
  
  // Parse module references
  const modules = args.map(parseModuleReference);
  
  for (const module of modules) {
    console.log(`Installing ${module.name}...`);
    
    try {
      // Resolve and install
      const resolved = await resolver.resolve(module.name, {
        version: module.version,
        ttl: options.ttl,
        trust: options.trust
      });
      
      // Show transitive dependencies for approval
      if (resolved.dependencies && Object.keys(resolved.dependencies).length > 0) {
        console.log('\nThis module includes the following dependencies:');
        for (const [dep, hash] of Object.entries(resolved.dependencies)) {
          console.log(`  ${dep}@${hash.slice(0, 8)}`);
        }
        const approved = await confirm('Install all dependencies?');
        if (!approved) {
          console.log('Installation cancelled.');
          return;
        }
      }
      
      // Update lock file
      await lockFile.addModule(module.name, {
        resolved: resolved.hash,
        integrity: resolved.integrity,
        source: resolved.source,
        fetchedAt: new Date().toISOString(),
        resolver: resolved.resolver,
        dependencies: resolved.dependencies
      });
      
      console.log(`✓ Installed ${module.name}@${resolved.hash.slice(0, 8)}`);
      
    } catch (error) {
      console.error(`✗ Failed to install ${module.name}: ${error.message}`);
      process.exit(1);
    }
  }
  
  await lockFile.save();
  console.log('\nDone! Run `mlld list` to see installed modules.');
}
```

### Update Command (`cli/commands/update.ts`)
```typescript
export async function updateCommand(args: string[], options: UpdateOptions) {
  const lockFile = await LockFile.load('./mlld.lock.json');
  const updates: ModuleUpdate[] = [];
  
  // Check for updates
  const modules = args.length > 0 ? args : Object.keys(lockFile.modules);
  
  for (const moduleName of modules) {
    const current = lockFile.modules[moduleName];
    if (!current) continue;
    
    // Check registry for latest
    const latest = await registry.getLatest(moduleName);
    
    if (latest.hash !== current.resolved) {
      updates.push({
        name: moduleName,
        current: current.resolved.slice(0, 8),
        latest: latest.hash.slice(0, 8)
      });
    }
  }
  
  if (updates.length === 0) {
    console.log('All modules are up to date!');
    return;
  }
  
  // Show updates
  console.log('Updates available:');
  updates.forEach(u => {
    console.log(`  ${u.name}: ${u.current} → ${u.latest}`);
  });
  
  if (options.dryRun) return;
  
  // Confirm and update
  const confirmed = await confirm('Install updates?');
  if (!confirmed) return;
  
  for (const update of updates) {
    await installCommand([update.name], { force: true });
  }
}
```

### List Command (`cli/commands/list.ts`)
```typescript
export async function listCommand(args: string[], options: ListOptions) {
  const lockFile = await LockFile.load('./mlld.lock.json');
  
  if (Object.keys(lockFile.modules).length === 0) {
    console.log('No modules installed.');
    return;
  }
  
  console.log('Installed modules:');
  
  if (options.details) {
    // Detailed view
    for (const [name, info] of Object.entries(lockFile.modules)) {
      console.log(`\n${name}`);
      console.log(`  Version: ${info.resolved.slice(0, 8)}`);
      console.log(`  Source: ${info.source}`);
      console.log(`  Installed: ${new Date(info.fetchedAt).toLocaleDateString()}`);
      
      if (info.ttl) console.log(`  TTL: ${info.ttl}`);
      if (info.trust) console.log(`  Trust: ${info.trust}`);
    }
  } else {
    // Simple list
    for (const [name, info] of Object.entries(lockFile.modules)) {
      console.log(`  ${name}@${info.resolved.slice(0, 8)}`);
    }
  }
  
  console.log(`\n${Object.keys(lockFile.modules).length} modules installed`);
}
```

### Search Command (`cli/commands/search.ts`)
```typescript
export async function searchCommand(args: string[], options: SearchOptions) {
  const query = args.join(' ');
  
  if (!query) {
    console.error('Please provide a search query');
    return;
  }
  
  console.log(`Searching for "${query}"...`);
  
  // Search registry
  const results = await registry.search(query, {
    author: options.author,
    limit: options.limit || 10
  });
  
  if (results.length === 0) {
    console.log('No modules found.');
    return;
  }
  
  // Display results
  results.forEach(module => {
    console.log(`\n${module.name}`);
    console.log(`  ${module.description}`);
    console.log(`  by ${module.author.name} • ${module.stats.installs} installs`);
  });
  
  console.log(`\nFound ${results.length} modules`);
}
```

## User Experience Enhancements

### Progress Indicators
```typescript
import ora from 'ora';

const spinner = ora('Installing modules...').start();
// ... do work
spinner.succeed('Installation complete!');
```

### Interactive Prompts
```typescript
import { confirm, select } from '@inquirer/prompts';

const proceed = await confirm({
  message: 'Install 3 modules?',
  default: true
});
```

### Pretty Output
```typescript
import chalk from 'chalk';

console.log(chalk.green('✓'), `Installed ${chalk.bold(moduleName)}`);
console.log(chalk.red('✗'), `Failed to install ${moduleName}`);
```

### Error Messages
```typescript
class ModuleNotFoundError extends MlldError {
  constructor(moduleName: string) {
    super(`Module not found: ${moduleName}`);
    this.hint = 'Try searching with: mlld search ' + moduleName.split('/')[1];
  }
}

class SecurityWarning extends MlldError {
  constructor(pattern: string, risk: string) {
    super(`Security Warning: ${pattern} detected`);
    this.hint = `This module contains ${risk}. Review carefully before proceeding.`;
    // Note: We warn but don't block - user decides
  }
}
```

## Lock File Integration

### Lock File Format
```json
{
  "version": 1,
  "registries": [
    {
      "prefix": "@company/",
      "resolver": "local",
      "type": "input",
      "config": {
        "path": "/company/modules"
      }
    }
  ],
  "security": {
    "policy": {
      "resolvers": {
        "allowCustom": false,
        "pathOnlyMode": false
      },
      "imports": {
        "maxDepth": 3
      }
    }
  },
  "modules": {
    "@alice/utils": {
      "resolved": "f8h4a9c2b5e1d7f3a8b2c9d5e2f7a1b4c8d9e3f5",
      "integrity": "sha256-base64hash",
      "source": "https://gist.githubusercontent.com/...",
      "fetchedAt": "2024-01-15T10:30:00Z",
      "ttl": "7d",
      "trust": "verify",
      "resolver": "dns-public",
      "dependencies": {
        "@bob/helpers": "a8c3f2d4e5b6c7d8e9f0a1b2c3d4e5f6"
      }
    }
  },
  "metadata": {
    "mlldVersion": "0.5.0",
    "createdAt": "2024-01-15T10:00:00Z",
    "updatedAt": "2024-01-15T10:30:00Z"
  }
}
```

## Implementation Steps

### Phase 1: Core Commands (Day 1 Morning)
1. [ ] Set up command infrastructure
2. [ ] Implement install command basics
3. [ ] Implement list command
4. [ ] Add command aliases
5. [ ] Test basic workflows

### Phase 2: Lock File Integration (Day 1 Afternoon)
1. [ ] Enhance LockFile class for modules
2. [ ] Add install from lock file
3. [ ] Add dev dependencies support
4. [ ] Test lock file updates
5. [ ] Handle concurrent modifications

### Phase 3: Advanced Commands (Day 1 Evening)
1. [ ] Implement update command
2. [ ] Implement remove command
3. [ ] Implement search command
4. [ ] Implement info command
5. [ ] Add dry-run support

### Phase 4: User Experience (Day 2 Morning)
1. [ ] Add progress indicators
2. [ ] Add interactive prompts
3. [ ] Improve error messages
4. [ ] Add colored output
5. [ ] Add verbose/quiet modes

### Phase 5: Testing & Edge Cases (Day 2 Afternoon)
1. [ ] Test offline behavior
2. [ ] Test network failures
3. [ ] Test invalid modules
4. [ ] Test version conflicts
5. [ ] Add integration tests

## Success Criteria

- [ ] All commands work as specified
- [ ] Clear, helpful error messages
- [ ] Fast execution (<500ms for cached)
- [ ] Offline support for installed modules
- [ ] Lock file stays consistent
- [ ] Good progress feedback
- [ ] Intuitive command structure
- [ ] Transitive dependency approval flow
- [ ] Resolver configuration respected
- [ ] Security policies enforced

## Future Enhancements

- Module publishing commands
- Dependency resolution
- Version ranges (not just hashes)
- Global vs local modules
- Module scripts/hooks
- Workspace support
- Audit command for security
- Path-only mode enforcement
- Custom resolver management
- `@output` directive support

## Notes

- Keep CLI simple and familiar (npm-like)
- Fail fast with clear errors
- Always update lock file atomically
- Consider Windows path differences
- Support both long and short command forms
- Security warnings are informative, not blocking
- Show users what mlld is doing (transparency)
- Resolvers are the security boundary, not the CLI

## Related Documentation

### Architecture & Vision
- [`ARCHITECTURE.md`](../../ARCHITECTURE.md) - CLI integration architecture
- [`REGISTRY-VISION.md`](../../REGISTRY-VISION.md) - Registry ecosystem and CLI role
- [`SECURITY-PRINCIPLES.md`](../../SECURITY-PRINCIPLES.md) - Security considerations for module installation

### Specifications
- [`specs/import-syntax.md`](../../specs/import-syntax.md) - Module reference syntax
- [`specs/lock-file-format.md`](../../specs/lock-file-format.md) - Lock file format specification
- [`specs/ttl-trust-syntax.md`](../../specs/ttl-trust-syntax.md) - TTL/Trust options for CLI commands

### Related Work
- [`cli/commands/`](../../../cli/commands/) - Existing CLI command structure
- [`core/registry/`](../../../core/registry/) - Registry components used by CLI