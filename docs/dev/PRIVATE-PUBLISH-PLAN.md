# Private Repository Publishing Plan

## Overview

This plan details the implementation of private repository publishing support for mlld modules, allowing users to publish modules directly to private repositories without creating gists or public PRs.

## User Requirements

1. **Private Flag**: Add `--private` flag to skip interactive prompts and enable private publishing
2. **Private Repo Detection**: When a private repo is detected with write access, offer choice between gist or private publish
3. **Skip PR by Default**: For private publish, skip PR creation unless `--pr` flag is specified
4. **Default Path**: Write to `mlld/modules/` folder unless `--path` flag specifies otherwise

## Current Flow Analysis

### Current Publishing Flow

1. **Module Validation**
   - Read module and parse metadata
   - Validate syntax and metadata fields
   - Auto-add missing required fields
   - Check for uncommitted changes

2. **Repository Detection**
   - Detect if in git repository
   - Extract owner/repo/sha/branch info
   - Check if repo is public via GitHub API

3. **Publishing Decision**
   - Public repo → Offer git-native or gist publishing
   - Private repo → Force gist creation
   - No repo → Create gist

4. **Registry PR Creation**
   - Fork registry repository
   - Update modules.json
   - Create pull request

### Key Components

- **GitInfo Detection**: Lines 853-920 detect git repository information
- **Public/Private Check**: Lines 560-572 check if repository is public
- **Publishing Logic**: Lines 268-379 handle the publishing decision tree
- **Interactive Prompts**: Lines 284-309 for repository publishing choices

## Proposed Changes

### 1. Add Private Publishing Flags

```typescript
export interface PublishOptions {
  // Existing options...
  private?: boolean;     // Skip prompts, enable private publishing
  pr?: boolean;          // Create PR even for private publish
  path?: string;         // Custom path for private publish (default: mlld/modules/)
}
```

### 2. Enhanced Repository Detection

```typescript
interface GitInfo {
  // Existing fields...
  hasWriteAccess?: boolean;  // Can push to this repository
}

private async detectGitInfo(filePath: string): Promise<GitInfo> {
  // Existing detection...
  
  // Check write access
  let hasWriteAccess = false;
  try {
    // Try to push a dry-run to check access
    execSync('git push --dry-run origin HEAD', { 
      cwd: gitRoot, 
      stdio: 'ignore' 
    });
    hasWriteAccess = true;
  } catch {
    hasWriteAccess = false;
  }
  
  return { ...existingInfo, hasWriteAccess };
}
```

### 3. Private Repository Publishing Flow

```typescript
// Around line 268, modify the repository detection logic
if (gitInfo.isGitRepo && !options.useGist && gitInfo.remoteUrl?.includes('github.com')) {
  const isPublicRepo = await this.checkIfRepoIsPublic(octokit, gitInfo.owner!, gitInfo.repo!);
  
  if (!isPublicRepo) {
    // NEW: Handle private repository with write access
    if (gitInfo.hasWriteAccess && !options.useGist) {
      if (options.private) {
        // Skip prompt with --private flag
        await this.publishToPrivateRepo(
          filePath, 
          content, 
          metadata, 
          gitInfo, 
          options
        );
        return;
      } else {
        // Interactive prompt for private repo
        console.log(chalk.yellow('\n⚠️  Repository is private but you have write access.'));
        console.log(chalk.gray('Choose publishing method:'));
        console.log(chalk.gray('  1. Publish directly to this private repository'));
        console.log(chalk.gray('  2. Create a public gist instead'));
        
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
        });
        
        const choice = await rl.question('\nChoice [1]: ');
        rl.close();
        
        if (choice !== '2') {
          await this.publishToPrivateRepo(
            filePath, 
            content, 
            metadata, 
            gitInfo, 
            options
          );
          return;
        }
        // Fall through to gist creation
      }
    } else {
      // No write access, fall back to gist
      console.log(chalk.yellow('\n⚠️  Repository is private. Switching to gist creation...'));
    }
  }
}
```

### 4. Private Repository Publishing Implementation

```typescript
private async publishToPrivateRepo(
  filePath: string,
  content: string,
  metadata: ModuleMetadata,
  gitInfo: GitInfo,
  options: PublishOptions
): Promise<void> {
  const { execSync } = await import('child_process');
  
  try {
    // Determine target path
    const targetDir = options.path || 'mlld/modules';
    const targetFileName = `${metadata.name}.mld.md`;
    const targetPath = path.join(gitInfo.gitRoot!, targetDir, targetFileName);
    
    console.log(chalk.blue(`\n📦 Publishing to private repository...`));
    console.log(chalk.gray(`   Target: ${targetDir}/${targetFileName}`));
    
    // Create directory if needed
    const targetDirPath = path.dirname(targetPath);
    await fs.mkdir(targetDirPath, { recursive: true });
    
    // Copy module to target location
    if (filePath !== targetPath) {
      await fs.copyFile(filePath, targetPath);
      console.log(chalk.green(`✅ Module copied to ${path.relative(gitInfo.gitRoot!, targetPath)}`));
    }
    
    // Create/update module manifest
    const manifestPath = path.join(targetDirPath, 'manifest.json');
    let manifest: Record<string, any> = {};
    
    try {
      const existingManifest = await fs.readFile(manifestPath, 'utf8');
      manifest = JSON.parse(existingManifest);
    } catch {
      // No existing manifest
    }
    
    // Add/update module entry
    const moduleId = `@${metadata.author}/${metadata.name}`;
    manifest[moduleId] = {
      name: metadata.name,
      author: metadata.author,
      version: metadata.version || '1.0.0',
      about: metadata.about,
      needs: metadata.needs || [],
      source: {
        type: 'private',
        path: path.relative(path.dirname(manifestPath), targetPath),
        repository: {
          url: gitInfo.remoteUrl,
          commit: gitInfo.sha,
          branch: gitInfo.branch
        }
      },
      publishedAt: new Date().toISOString()
    };
    
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
    console.log(chalk.green(`✅ Updated manifest.json`));
    
    // Commit changes
    execSync(`git add "${targetPath}" "${manifestPath}"`, { 
      cwd: gitInfo.gitRoot! 
    });
    
    const commitMessage = `Add module ${moduleId}`;
    execSync(`git commit -m "${commitMessage}"`, { 
      cwd: gitInfo.gitRoot! 
    });
    console.log(chalk.green(`✅ Changes committed`));
    
    // Push to remote
    execSync(`git push origin ${gitInfo.branch}`, { 
      cwd: gitInfo.gitRoot! 
    });
    console.log(chalk.green(`✅ Pushed to ${gitInfo.branch}`));
    
    // Success message
    console.log(chalk.green('\n✅ Module published to private repository!\n'));
    console.log(chalk.bold('Module Information:'));
    console.log(`  Path: ${path.relative(gitInfo.gitRoot!, targetPath)}`);
    console.log(`  Import: @import { ... } from "${targetPath}"`);
    
    // Optional: Create PR if requested
    if (options.pr && !options.dryRun) {
      console.log(chalk.blue('\n🔀 Creating pull request to registry...'));
      // Use existing createRegistryPR but mark as private source
      const registryEntry = {
        ...this.buildRegistryEntry(metadata, content),
        source: {
          type: 'private' as const,
          repository: gitInfo.remoteUrl,
          note: 'This module is hosted in a private repository'
        }
      };
      const prUrl = await this.createRegistryPR(octokit, user, registryEntry, options);
      console.log(`  Pull request: ${chalk.cyan(prUrl)}`);
    }
    
  } catch (error: any) {
    throw new MlldError(
      `Failed to publish to private repository: ${error.message}`,
      { code: 'PRIVATE_PUBLISH_FAILED', severity: ErrorSeverity.Fatal }
    );
  }
}
```

### 5. CLI Integration

Update the command creation to support new flags:

```typescript
export function createPublishCommand() {
  return {
    name: 'publish',
    description: 'Publish module to mlld registry',
    
    async execute(args: string[], flags: Record<string, any> = {}): Promise<void> {
      const options: PublishOptions = {
        // Existing options...
        private: flags.private || flags.p,
        pr: flags.pr,
        path: flags.path,
      };
      
      // Rest of implementation...
    }
  };
}
```

## Technical Implementation Details

### 1. Write Access Detection
- Use `git push --dry-run` to check if user can push
- Cache result to avoid multiple checks
- Handle different authentication methods (SSH, HTTPS with token)

### 2. Private Repository Structure
```
private-repo/
├── mlld/
│   └── modules/
│       ├── manifest.json      # Local module registry
│       ├── module1.mld.md
│       └── module2.mld.md
└── other-project-files/
```

### 3. Manifest Format
```json
{
  "@author/module-name": {
    "name": "module-name",
    "author": "author",
    "version": "1.0.0",
    "about": "Module description",
    "needs": [],
    "source": {
      "type": "private",
      "path": "module-name.mld.md",
      "repository": {
        "url": "git@github.com:owner/repo.git",
        "commit": "abc123",
        "branch": "main"
      }
    },
    "publishedAt": "2024-01-01T00:00:00Z"
  }
}
```

### 4. Import Resolution for Private Modules
- Extend ResolverManager to support private repository resolution
- Use manifest.json to map module names to file paths
- Support both relative and absolute imports

## UX Considerations

### 1. Interactive Flow
- Default to private publishing when in private repo with write access
- Clear messaging about what will happen
- Confirmation before committing/pushing

### 2. Error Handling
- Clear error when no write access
- Helpful message if target directory is protected
- Rollback on failure (using git reset)

### 3. Success Feedback
- Show where module was published
- Provide import example
- Mention if PR was created

## Edge Cases

### 1. Existing Module Updates
- Check if module already exists at target path
- Offer to update or choose different name
- Preserve version history

### 2. Path Conflicts
- Validate target path doesn't conflict with existing files
- Handle case where mlld/modules/ already exists with different structure
- Support custom paths via --path flag

### 3. Authentication Issues
- Detect different auth failures (expired token, no permissions)
- Provide helpful guidance for fixing auth
- Support different git remote URLs (SSH, HTTPS)

### 4. Branch Protection
- Detect if branch is protected
- Suggest creating feature branch
- Handle PR workflow for protected branches

## Security Considerations

### 1. Access Control
- Only allow publishing to repos user can write to
- Don't expose private repo contents in PR
- Validate module doesn't reference other private files

### 2. Private Module Usage
- Private modules can only be imported within same repo
- No public registry entry for private modules (unless --pr used)
- Clear documentation about visibility

## Migration Path

### 1. Existing Users
- No breaking changes to current flow
- Private publishing is opt-in
- Existing gist-based modules continue working

### 2. Documentation Updates
- Update publishing guide with private option
- Add examples of private module usage
- Document manifest.json format

## Testing Strategy

### 1. Unit Tests
- Mock git commands for write access detection
- Test manifest.json creation/updates
- Validate error handling

### 2. Integration Tests
- Test full flow with mock git repository
- Verify file operations
- Check git commit/push behavior

### 3. Manual Testing
- Test with real private repositories
- Verify different auth methods
- Test edge cases and error scenarios

## Implementation Timeline

### Phase 1: Core Implementation (2-3 days)
- Add flags and options
- Implement write access detection
- Basic private publishing flow

### Phase 2: Enhanced Features (2-3 days)
- Manifest.json management
- PR creation for private modules
- Error handling and rollback

### Phase 3: Testing & Documentation (2-3 days)
- Comprehensive test coverage
- Documentation updates
- Example repositories

## Future Enhancements

### 1. Module Discovery
- `mlld ls --private` to list private modules
- Search within private repositories
- Module dependency resolution

### 2. Advanced Features
- Module versioning in private repos
- Automated changelog generation
- CI/CD integration for validation

### 3. Organization Support
- Shared private module repositories
- Team-based access control
- Module approval workflows