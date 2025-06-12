# Registry System Developer Guide

This guide explains how the mlld registry system works from a developer perspective, including both the code in the mlld codebase and the structure of the `github.com/mlld-lang/registry` repository.

## Overview

The mlld registry is a centralized system where modules are published to a single `modules.json` file in the registry repository. This provides:

- **Module Resolution**: Maps friendly names like `@author/module` to GitHub URLs or Gists
- **Versioning**: Modules include version information and mlld compatibility
- **Caching**: Local cache for offline usage
- **Dependencies**: Track runtime dependencies (js, node, py, sh)
- **Security**: Content hash validation ensures integrity

## Architecture

### Registry Repository Structure

The `github.com/mlld-lang/registry` repository uses a single-file structure:

```
registry/
├── README.md
├── modules.json         # All published modules
├── allowlist.json       # Auto-merge allowlist
├── tools/               # Registry management tools
│   ├── publish.js
│   ├── validate.js
│   └── build-registry.js
└── llm/                 # LLM-based review system
    └── review-pr.mld
```

### Registry Format

The `modules.json` file contains all modules:

```json
{
  "@author/module-name": {
    "name": "module-name",
    "author": "author",
    "version": "1.0.0",
    "about": "Brief description of the module",
    "needs": ["js", "node", "py", "sh"],  // Runtime dependencies
    "repo": "https://github.com/author/repo",
    "keywords": ["tag1", "tag2"],
    "bugs": "https://github.com/author/repo/issues",
    "homepage": "https://example.com",
    "license": "CC0",
    "mlldVersion": "1.0.0",
    "ownerGithubUserIds": [12345],
    "source": {
      "type": "github" | "gist",
      "url": "https://raw.githubusercontent.com/...",
      "contentHash": "sha256:...",
      "repository": {  // Only for github type
        "type": "git",
        "url": "https://github.com/author/repo",
        "commit": "abc123",
        "path": "path/to/module.mld"
      },
      "gistId": "..."  // Only for gist type
    },
    "dependencies": {
      "js": {
        "packages": ["package1", "package2"]
      },
      "node": {
        "node": ">=18.0.0",
        "packages": ["fs-extra", "chalk"]
      },
      "py": {
        "python": ">=3.8",
        "packages": ["requests", "numpy"]
      },
      "sh": {
        "commands": ["git", "docker", "curl"]
      }
    },
    "publishedAt": "2024-05-28T00:00:00Z"
  }
}
```

## Module Metadata

### Required Fields

- `name`: Module name (lowercase, hyphens allowed)
- `author`: GitHub username or organization
- `about`: Brief description
- `needs`: Array of runtime dependencies (can be empty `[]`)
- `license`: Always "CC0" (required by registry)

### Optional Fields

- `version`: Semantic version (default: "1.0.0")
- `repo`: Source repository URL
- `bugs`: Issue tracker URL
- `keywords`: Array of searchable tags
- `homepage`: Project homepage
- `mlldVersion`: Compatible mlld version

### Runtime Dependencies

The `needs` array specifies which runtimes the module requires:

- `"js"`: Browser-compatible JavaScript (no Node.js APIs)
- `"node"`: Node.js-specific JavaScript (uses fs, path, etc.)
- `"py"`: Python code
- `"sh"`: Shell commands or scripts

Each runtime in `needs` can have a corresponding detailed dependency specification:

- `needs-js`: For browser JavaScript dependencies
- `needs-node`: For Node.js dependencies
- `needs-py`: For Python dependencies
- `needs-sh`: For shell command dependencies

### JavaScript vs Node.js Distinction

The registry distinguishes between browser-compatible JavaScript (`js`) and Node.js-specific code (`node`):

- Use `needs: ["js"]` for code that runs in browsers or any JavaScript environment
- Use `needs: ["node"]` for code that uses Node.js APIs like `fs`, `path`, `process`, etc.
- The dependency detector automatically identifies Node.js usage by checking for:
  - `require()` calls
  - Node.js built-in modules
  - Node.js global variables (`__dirname`, `process`, etc.)

## Core Components

### 1. RegistryResolver (`core/registry/RegistryResolver.ts`)

Resolves `@author/module` imports to URLs:

```typescript
class RegistryResolver {
  async resolve(moduleRef: string): Promise<string> {
    // Parse @author/module
    // Fetch registry modules.json
    // Look up module entry
    // Return source URL
  }
  
  async getModuleInfo(moduleRef: string): Promise<ModuleInfo>
  async listModules(author?: string): Promise<ModuleInfo[]>
}
```

### 2. DependencyDetector (`core/utils/dependency-detector.ts`)

Automatically detects runtime dependencies from mlld code:

```typescript
class DependencyDetector {
  detectRuntimeNeeds(ast: MlldNode[]): string[]  // Returns ["js", "node", "py", "sh"]
  detectJavaScriptPackages(ast: MlldNode[]): string[]
  detectNodePackages(ast: MlldNode[]): string[]
  detectPythonPackages(ast: MlldNode[]): string[]
  detectShellCommands(ast: MlldNode[]): string[]
}
```

### 3. GitHubAuthService (`core/registry/auth/GitHubAuthService.ts`)

Handles GitHub authentication for publishing:

```typescript
class GitHubAuthService {
  async authenticate(): Promise<void>
  async getOctokit(): Promise<Octokit>
  async getGitHubUser(): Promise<GitHubUser>
}
```

## CLI Commands

### Publishing (`cli/commands/publish.ts`)

The `mlld publish` command:

1. Validates module metadata
2. Auto-detects runtime dependencies
3. Creates source (git repo or gist)
4. Creates PR to registry

```bash
mlld publish module.mld.md
mlld publish --use-gist    # Force gist creation
mlld publish --use-repo    # Force repository publishing
```

### Module Creation (`cli/commands/init-module.ts`)

The `mlld init` command creates new modules:

```bash
mlld init my-module.mld.md
```

Prompts for:
- Module name
- Description
- Author
- Runtime dependencies
- Optional metadata

### Module Installation (`cli/commands/install.ts`)

The `mlld install` command:

```bash
mlld install @author/module
mlld install  # Install from lock file
```

## Publishing Flow

1. **Validation Phase**:
   - Check mlld version is up to date
   - Validate required metadata fields
   - Verify author permissions
   - Parse and validate mlld syntax
   - Auto-detect dependencies

2. **Source Creation**:
   - If in git repo: Use GitHub raw URL
   - Otherwise: Create GitHub gist
   - Calculate content hash

3. **Registry PR**:
   - Fork registry repository
   - Update modules.json
   - Create pull request
   - Auto-merge if on allowlist

## Module Import Resolution

1. User writes: `@import { utils } from @author/module`
2. Import evaluator detects `@` prefix
3. RegistryResolver:
   - Fetches registry modules.json
   - Finds module entry for `@author/module`
   - Returns source URL
4. Module content is fetched and cached
5. Lock file is updated with resolved URL and hash

## Security Considerations

1. **Content Integrity**: SHA256 hashes ensure content hasn't changed
2. **Author Validation**: Only module authors can publish updates
3. **License Requirement**: All modules must be CC0 licensed
4. **PR Review**: Registry changes go through pull request review

## Testing

Key test scenarios:
- Dependency detection (js vs node distinction)
- Module validation
- Publishing flow
- Import resolution
- Cache behavior

## Future Enhancements

1. **Version Ranges**: Support for semantic versioning
2. **Private Registries**: Self-hosted registry support
3. **Web UI**: Browse modules online
4. **Analytics**: Download statistics
5. **Module Search**: Full-text search capabilities