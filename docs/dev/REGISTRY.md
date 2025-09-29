# mlld Registry System

The mlld registry is a decentralized module repository hosted on GitHub that provides:
- Module discovery and resolution for `@author/module` imports with version support
- Automated review via LLM-powered webhook service
- Version management with semver resolution and tags
- Direct publishing API for established authors
- Content integrity via SHA256 hashes
- Backward-compatible module format

## Architecture Overview

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  mlld publish   │────▶│ GitHub Registry  │◀────│ Vercel Webhook  │
│  (local CLI)    │     │ (mlld-lang/      │     │ (review service)│
│                 │     │  registry)       │     └─────────────────┘
│  First publish: │     └──────────────────┘
│    → PR flow    │              │
│  Updates:       │              ▼
│    → API flow   │     ┌──────────────────┐     ┌─────────────────┐
└─────────────────┘     │ modules.json     │     │ Registry API    │
         │              │ (CDN distributed) │     │ (Vercel service)│
         └──────────────┼──────────────────┘     └─────────────────┘
                        │                                  ^
                        └──────────────────────────────────┘
                           Direct publish for updates
```


## CLI Workflows

- `mlld install` reads dependencies from `mlld-config.json` and fetches registry modules using the module installer
- `mlld update` refreshes entries in `mlld-lock.json` and content cache, respecting version constraints
- `mlld outdated` inspects the registry for newer versions without modifying lock files
- Configuration stored in `mlld-config.json` (user settings), locks stored in `mlld-lock.json` (resolved versions)


## Repository Structure

### Registry Repository (`github.com/mlld-lang/registry`)

```
registry/
├── modules/                     # Module storage
│   ├── {author}/               # Author namespace
│   │   ├── {module}/           # Module directory (new structure)
│   │   │   ├── metadata.json   # Core module info, owners
│   │   │   ├── 1.0.0.json      # Version-specific data
│   │   │   ├── 1.0.1.json      # Another version
│   │   │   └── tags.json       # Tag → version mappings
│   │   └── {module}.json       # Legacy single-file format
├── modules.json                # Generated registry (minified)
├── modules.generated.json      # Generated registry (formatted)
├── tools/
│   ├── build-registry.js       # Combines modules into registry
│   └── migrate-to-versions.js  # Migration script
├── llm/                        # LLM review scripts
│   ├── run/
│   │   └── review-pr.mld       # Main review orchestration
│   ├── modules/                # Shared utilities
│   │   ├── registry-utils.mld  # Module validation
│   │   └── claude-utils.mld    # Claude API integration
│   └── templates/              # Review templates
├── allowlist.json              # Trusted authors (skip LLM review)
└── .github/
    └── workflows/
        └── build-registry.yml  # Auto-build on merge
```

### Review Service (`github.com/mlld-lang/registry-review`)

```
registry-review/
├── api/
│   └── webhook.ts              # Vercel webhook handler
├── lib/
│   ├── review.ts               # Core review logic
│   ├── security.ts             # Webhook validation
│   └── types.ts                # TypeScript definitions
└── vercel.json                 # Vercel configuration
```

### Registry API (`registry-api.mlld.org`)

```
registry-api/
├── api/
│   ├── publish.ts              # Direct publish endpoint
│   ├── resolve.ts              # Version resolution endpoint
│   └── auth.ts                 # Authentication check
├── lib/
│   ├── auth.ts                 # GitHub auth helpers
│   ├── permissions.ts          # Module ownership checking
│   ├── storage.ts              # Registry file operations
│   ├── validation.ts           # Module validation
│   └── types.ts                # Shared types
└── vercel.json                 # Vercel configuration
```

## Module Format

### New Versioned Structure

Modules are now stored in `modules/{author}/{module}/` directories:

**metadata.json** - Core module information:
```json
{
  "name": "module-name",
  "author": "github-username",
  "about": "Brief description",
  "owners": ["github-username"],     // Can publish updates
  "maintainers": [],                  // Can also publish
  "created": "2024-01-01T00:00:00Z",
  "createdBy": 12345,                 // GitHub user ID
  "firstPublishPR": 123               // PR number for tracking
}
```

**{version}.json** - Version-specific data:
```json
{
  "version": "1.0.0",
  "needs": ["js", "py", "sh"],
  "license": "CC0",
  "mlldVersion": ">=1.0.0",
  "source": {
    "type": "github",
    "url": "https://raw.githubusercontent.com/author/repo/commit/path/module.mld",
    "contentHash": "sha256:abc123...",
    "repository": {
      "type": "git", 
      "url": "https://github.com/author/repo",
      "commit": "abc123",
      "path": "path/to/module.mld"
    }
  },
  "dependencies": {
    "js": { "packages": ["lodash", "axios"] },
    "py": { "python": ">=3.8", "packages": ["requests"] },
    "sh": { "commands": ["git", "curl"] }
  },
  "keywords": ["utility", "automation"],
  "repo": "https://github.com/author/repo",
  "bugs": "https://github.com/author/repo/issues",
  "homepage": "https://example.com",
  "publishedAt": "2024-01-01T00:00:00Z",
  "publishedBy": 12345
}
```

**tags.json** - Version tags:
```json
{
  "latest": "1.0.1",
  "stable": "1.0.1",
  "beta": "2.0.0-beta.1"
}
```

### Legacy Format

The system still supports the original flat structure in `modules/{author}/{module}.json` for backward compatibility.

### Required Fields
- `name`: Module identifier (lowercase, hyphens)
- `author`: GitHub username (must match PR author)
- `about`: Brief description
- `needs`: Runtime requirements (`[]` if none)
- `license`: Must be "CC0"
- `source`: Where to fetch the module code

### Runtime Dependencies (`needs`)
- `js`: Browser-compatible JavaScript
- `node`: Node.js-specific code (uses fs, path, etc.)
- `py`: Python code
- `sh`: Shell commands

## Publishing Flow

### 1. Local Publishing (`mlld publish`)

```bash
mlld publish my-module.mld.md
```

The CLI determines the publishing path:

**First-time module** → PR workflow:
1. Validates module metadata
2. Auto-detects runtime dependencies via AST analysis
3. Creates source (GitHub repo or Gist)
4. Calculates SHA256 content hash
5. Creates PR with module files
6. Adds welcome message for first-time authors

**Module updates** → Direct API (when available):
1. Checks if user is owner/maintainer
2. Prompts for version bump if needed
3. Validates against existing versions
4. Publishes directly via API
5. Updates tags automatically

**Existing PR detection**:
- If open PR exists for module, offers to:
  - Update the existing PR
  - Close and create new PR
  - View PR in browser

### 2. Automated Review

When PR is created or updated:
1. GitHub webhook triggers Vercel service
2. Vercel validates webhook signature
3. Fetches `review-pr.mld` from registry main branch
4. Runs script with injected credentials:
   - `MLLD_GITHUB_TOKEN`
   - `MLLD_ANTHROPIC_API_KEY`
   - `MLLD_PR_NUMBER`
   - `MLLD_REPO_OWNER`
   - `MLLD_REPO_NAME`
5. Script extracts module(s) from PR diff
6. Validates structure and metadata:
   - For new modules: checks all required files
   - For updates: validates version files
7. Queries Claude for security/quality review
8. Posts review comment with decision:
   - **APPROVE**: Ready to merge
   - **REQUEST_CHANGES**: Issues to fix
   - **COMMENT**: Needs human review

**Re-review on updates**:
- Webhook triggers on new commits to PR
- Previous review status shown in new review
- Focuses on changes since last review

### 3. Auto-merge (Trusted Authors)

Authors in `allowlist.json` skip LLM review and auto-merge if:
- All CI checks pass
- Module structure is valid
- No security issues detected

### 4. Direct Publishing (Module Owners)

After first PR is merged:
- Author becomes module owner
- Can publish updates directly via API
- No PR required for version updates
- Maintains same quality checks

### 5. Registry Build

On merge to main:
1. GitHub Actions runs `build-registry.yml`
2. Executes `tools/build-registry.js`:
   - Scans all module directories
   - Handles both versioned and legacy formats
   - Extracts latest version for each module
   - Includes version and ownership metadata
3. Generates two files:
   - `modules.json`: Minified for distribution
   - `modules.generated.json`: Formatted for humans
4. Commits generated files back to repo

## Module Resolution

When code uses `/import module { util } from @author/module` or `@author/module@version`:

1. Import type `module` routes to cached module resolver
2. Checks `mlld-lock.json` for existing installation
3. If not cached, RegistryResolver fetches `modules.json` from CDN
4. Parses version requirement (if specified):
   - No version → uses latest tag
   - Tag (e.g., `@beta`) → resolves via tags
   - Semver range → finds best match
5. Fetches module content from source URL
6. Stores in content-addressed cache with integrity hash
7. Updates `mlld-lock.json` with resolved version and metadata

## Security Model

### Trust Boundaries
- **Registry main branch**: Trusted (reviewed modules)
- **PR branches**: Untrusted (pending review)
- **Vercel environment**: Trusted (holds secrets)
- **Module content**: Verified via SHA256 hashes

### Review Criteria
1. **No hardcoded secrets**: API keys, passwords, tokens
2. **Safe operations**: No arbitrary code execution
3. **Real utility**: Solves actual problems
4. **Proper licensing**: Must be CC0
5. **Accurate metadata**: Matches actual functionality

### Content Integrity
- Every module includes SHA256 hash of source
- Imports verify hash matches fetched content
- Version pinning via commit SHA or release tag

## Review Script Flow

The `review-pr.mld` script:

```mlld
# 1. Fetch PR data
/var @prData = @github.pr.view(@MLLD_PR_NUMBER, @repo)
/var @prFiles = @github.pr.files(@MLLD_PR_NUMBER, @repo)
/var @prDiff = @github.pr.diff(@MLLD_PR_NUMBER, @repo)

# 2. Extract module(s) from diff
/var @modules = @extractModulesFromPR(@prFiles, @prDiff)

# 3. Check if this is a re-review
/var @previousReviews = @github.pr.reviews(@MLLD_PR_NUMBER, @repo)
/var @isUpdate = @previousReviews.length > 0

# 4. Validate structure based on type
/for @module in @modules
  /if @module.isNewModule
    /var @validation = @validateNewModule(@module)
  /else
    /var @validation = @validateModuleUpdate(@module)
  /endif
/endfor

# 5. Query Claude for review
/var @reviewContext = @createReviewContext(
  modules: @modules,
  isUpdate: @isUpdate,
  previousReviews: @previousReviews
)
/var @claudeResponse = @queryClaudeAPI(@reviewPrompt(...))
/var @aiReview = @parseReviewResponse(@claudeResponse)

# 6. Post GitHub review
/run @github.pr.review(@MLLD_PR_NUMBER, @repo, 
                      @aiReview.recommendation, 
                      @githubReview)
```

## Development Workflow

### Testing Locally
```bash
# Test module before publishing
mlld run my-module.mld.md

# Validate without publishing
mlld publish --dry-run my-module.mld.md

# Force PR submission (skip direct publish)
mlld publish --pr my-module.mld.md
```

### Version Management
```bash
# Import specific versions
@import { util } from @author/module@1.0.0
@import { util } from @author/module@^1.0.0
@import { util } from @author/module@beta
```

### Manual Review Override
Maintainers can override LLM decisions by:
1. Commenting with approval/rejection
2. Using GitHub's review features
3. Merging despite review status

### Updating Review Logic
1. Modify scripts in `registry/llm/`
2. Test with sample PRs
3. Deploy changes to main
4. New reviews use updated logic

### API Authentication
```bash
# Login for direct publishing
mlld auth login

# Check auth status
mlld auth status

# Logout
mlld auth logout
```

