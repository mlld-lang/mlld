# mlld setup Command - Implementation Plan

## Current Context
We've implemented a resolver architecture in mlld 1.4 that allows custom module sources (LOCAL, GITHUB, HTTP resolvers). However, configuring these resolvers manually in mlld.lock.json is complex and error-prone. We need a setup wizard to handle this configuration, especially for private GitHub modules.

### What Already Exists
- **Resolver System**: Working resolver architecture in `core/resolvers/`
- **GitHub Auth**: Existing `mlld auth` command in `cli/commands/auth.ts` that stores GitHub tokens
- **Lock File Support**: `mlld.lock.json` can store resolver configurations under `config.resolvers.registries`
- **Security Framework**: Existing auth system uses keytar for secure token storage

### Current Problems
1. Manual mlld.lock.json editing is error-prone
2. Users need to manage GitHub PATs manually
3. No validation of repository access before saving config
4. Resolver configuration structure is complex and undocumented for end users

## Overview
Create a `mlld setup` command that provides an interactive, user-friendly way to configure mlld projects with private modules and custom resolvers. This eliminates the manual configuration complexity we've been struggling with.

## Core Features

### 1. Interactive Setup Flow
```
$ mlld setup

Welcome to mlld setup! Let's configure your project.

? What would you like to set up?
  ❯ Private GitHub modules
    Local module directories  
    Custom HTTP module source
    Just create basic mlld.lock.json

? Would you like to use private GitHub modules? (Y/n)

? Enter your GitHub organization or username: mycompany

? Enter the repository name for your private modules: private-mlld-modules

? Which branch should we use? (default: main)

? Checking GitHub authentication...
  ✓ Authenticated as @username
  ✓ Verifying access to mycompany/private-mlld-modules...
  ✓ Repository access confirmed!

? What prefix would you like to use for these modules? (default: @mycompany/)

✓ Configuration saved to mlld.lock.json
✓ GitHub authentication configured

You can now import private modules like:
  @import { auth } from @mycompany/auth/login
```

### 2. GitHub App Integration (The Game Changer!)

Instead of requiring users to manage PATs locally:

1. **Local Development**: Use GitHub OAuth app
   - `mlld auth` opens browser for GitHub OAuth flow
   - Stores token securely in system keychain
   - Auto-refreshes tokens as needed
   - No PAT management for users!

2. **Production/CI**: Fall back to PAT
   - If no OAuth token available, check for `GITHUB_TOKEN` env var
   - Clear error messages about what's needed

### 3. Smart Defaults & Auto-Detection

The setup command should:
- Detect if we're in a git repo and suggest org/repo based on origin
- Check for existing mlld.lock.json and offer to update vs overwrite
- Validate repository access before saving config
- Auto-detect common module patterns in the target repo

### 4. Configuration Structure

Generate clean, well-documented mlld.lock.json:

```json
{
  "version": "1.0",
  "config": {
    "resolvers": {
      "registries": [
        {
          "prefix": "@mycompany/",
          "resolver": "GITHUB",
          "type": "input",
          "config": {
            "owner": "mycompany",
            "repo": "private-mlld-modules",
            "branch": "main",
            "basePath": "modules",
            // No token here! Use auth system
          }
        },
        {
          "prefix": "@local/",
          "resolver": "LOCAL",
          "type": "input", 
          "config": {
            "basePath": "./src/mlld-modules"
          }
        }
      ]
    },
    "security": {
      "allowedDomains": ["raw.githubusercontent.com", "gist.githubusercontent.com"]
    }
  },
  "modules": {},
  "cache": {}
}
```

### 5. Additional Setup Options

#### Local Module Directories
```
? Enter the path to your local modules: ./src/mlld-modules
? What prefix would you like to use? (default: @local/)
✓ Local resolver configured for @local/ → ./src/mlld-modules
```

#### Multiple Configurations
Allow adding multiple resolvers in one session:
```
? Would you like to configure another module source? (y/N)
```

## Technical Implementation Details

### Key Files to Reference
1. **Auth System**: 
   - `cli/commands/auth.ts` - Existing GitHub auth command
   - `core/auth/GitHubAuth.ts` - GitHub API integration
   - Uses keytar for secure storage: `@codeui/keytar`

2. **Resolver System**:
   - `core/resolvers/ResolverManager.ts` - Manages resolver registration
   - `core/resolvers/LocalResolver.ts` - Local file resolver
   - `core/resolvers/GitHubResolver.ts` - GitHub resolver (needs auth integration)
   - `core/registry/LockFile.ts` - Has `getResolverRegistries()` and `setResolverRegistries()`

3. **Interactive CLI Patterns**:
   - `cli/commands/init-module.ts` - Example of interactive prompts
   - Uses prompts from `cli/utils/prompts.ts`

### GitHub OAuth Integration Plan

The key innovation is using the EXISTING auth system but extending it:

1. **Current Flow** (keep this):
   ```
   mlld auth -> Enter PAT -> Stored in keytar
   ```

2. **New OAuth Flow** (add this):
   ```
   mlld auth --oauth -> Opens browser -> GitHub OAuth -> Token stored in keytar
   ```

3. **Resolver Integration**:
   - Modify `GitHubResolver` to check for auth token via `GitHubAuth.getInstance()`
   - No token in config file! The resolver gets it from the auth system
   - In production: Falls back to `GITHUB_TOKEN` env var if no keytar token

### Code Changes Needed

1. **Update GitHubResolver** (`core/resolvers/GitHubResolver.ts`):
   ```typescript
   async resolve(ref: string, config?: GitHubResolverConfig): Promise<ResolverContent> {
     // Get token from auth system, not config!
     const auth = GitHubAuth.getInstance();
     let token = await auth.getToken(); // From keytar
     
     if (!token && process.env.GITHUB_TOKEN) {
       token = process.env.GITHUB_TOKEN; // Fallback for CI/production
     }
     
     if (!token) {
       throw new Error('GitHub authentication required. Run: mlld auth');
     }
     
     // Use token for API calls...
   }
   ```

2. **Create Setup Command** (`cli/commands/setup.ts`):
   - Import prompt utilities from `cli/utils/prompts.ts`
   - Import `LockFile` to read/write configuration
   - Import `GitHubAuth` to verify repository access
   - Use `GitHubResolver` to validate configuration works

## Implementation Steps

### Phase 1: Basic Setup Command
1. Create `cli/commands/setup.ts`
2. Implement interactive prompts using existing CLI patterns
3. Basic mlld.lock.json generation
4. Path validation and resolution

### Phase 2: GitHub Integration  
1. Extend existing auth system to support OAuth app flow
2. Create GitHub App for mlld (oauth.mlld.run)
3. Implement token refresh logic
4. Secure token storage using keytar

### Phase 3: Smart Features
1. Repository access validation
2. Auto-detection of repo structure
3. Module discovery (list available modules)
4. Update vs overwrite logic

### Phase 4: Enhanced DX
1. Add `mlld setup --check` to validate existing config
2. Add `mlld setup --add-resolver` for adding to existing config
3. Migration tool for old configs
4. Better error messages with setup hints

## Benefits

1. **Zero Configuration Complexity**: Users never see the complex resolver config
2. **No Token Management**: OAuth for local dev, PAT only for CI/deploy
3. **Validated Setup**: We verify everything works before saving
4. **Discoverable**: Users can browse available modules during setup
5. **Extensible**: Easy to add new resolver types later

## Example User Journey

```bash
# New project
$ mlld init my-project
$ cd my-project
$ mlld setup
# ... interactive setup ...

# Existing project
$ mlld setup --check
✓ Configuration valid
✓ GitHub authentication active
✓ All module sources accessible

# Add new source
$ mlld setup --add-resolver
? What type of module source? Local directory
# ... configure new source ...
```

## Critical Implementation Notes

### OAuth App Setup (If Going Full OAuth Route)
1. Need to create GitHub OAuth App at github.com/settings/applications/new
2. Callback URL: `http://localhost:8765/callback` (or `https://oauth.mlld.run/callback`)
3. Store client ID/secret in environment or hardcode (client ID is public)
4. OAuth flow: Open browser → User authorizes → Redirect to callback → Exchange code for token

**HOWEVER**: The existing PAT approach might be sufficient! Users already understand it, and we can make it seamless with the auth system storing tokens.

### Testing Strategy
1. Test with real private repos
2. Test with repos user doesn't have access to (should fail gracefully)
3. Test OAuth token expiration/refresh
4. Test CI environment (no keytar, uses env var)

### Example Setup Implementation Start

```typescript
// cli/commands/setup.ts
import { prompt } from '../utils/prompts';
import { LockFile } from '@core/registry/LockFile';
import { GitHubAuth } from '@core/auth/GitHubAuth';
import * as path from 'path';

export async function setupCommand(): Promise<void> {
  console.log('Welcome to mlld setup! Let\'s configure your project.\n');
  
  // Check for existing mlld.lock.json
  const lockFilePath = path.join(process.cwd(), 'mlld.lock.json');
  const lockFile = new LockFile(lockFilePath);
  
  const setupType = await prompt({
    type: 'select',
    name: 'type',
    message: 'What would you like to set up?',
    choices: [
      { title: 'Private GitHub modules', value: 'github' },
      { title: 'Local module directories', value: 'local' },
      { title: 'Just create basic mlld.lock.json', value: 'basic' }
    ]
  });
  
  if (setupType === 'github') {
    await setupGitHubResolver(lockFile);
  }
  // ... etc
}
```

## Summary for Next Claude

1. **Main Goal**: Create `mlld setup` command that configures mlld.lock.json interactively
2. **Key Innovation**: Use existing auth system (keytar) to store GitHub tokens - no tokens in config files!
3. **Implementation Path**: 
   - Update GitHubResolver to use auth system tokens
   - Create interactive setup command
   - Validate repo access before saving config
4. **Existing Code**: Auth system, resolver system, and lock file management all exist - just need to wire them together
5. **User Experience**: Simple wizard that "just works" - no manual JSON editing

This approach is SO much better than manual configuration. It's more "mlld-like" - simple, helpful, and just works!