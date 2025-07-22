# mlld Registry System

The mlld registry is a decentralized module repository hosted on GitHub that provides:
- Module discovery and resolution for `@author/module` imports
- Automated review via LLM-powered webhook service
- Version pinning and content integrity via SHA256 hashes
- Individual module files that compile to a single registry

## Architecture Overview

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  mlld publish   │────▶│ GitHub Registry  │◀────│ Vercel Webhook  │
│  (local CLI)    │     │ (mlld-lang/      │     │ (review service)│
└─────────────────┘     │  registry)       │     └─────────────────┘
                        └──────────────────┘
                                 │
                                 ▼
                        ┌──────────────────┐
                        │ modules.json     │
                        │ (CDN distributed) │
                        └──────────────────┘
```

## Repository Structure

### Registry Repository (`github.com/mlld-lang/registry`)

```
registry/
├── modules/                     # Individual module files
│   ├── {author}/               # Author namespace
│   │   └── {module}.json       # Module metadata and config
├── modules.json                # Generated registry (minified)
├── modules.generated.json      # Generated registry (formatted)
├── tools/
│   └── build-registry.js       # Combines modules into registry
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

## Module Format

Each module is stored in `modules/{author}/{module}.json`:

```json
{
  "name": "module-name",
  "author": "github-username",
  "version": "1.0.0",
  "about": "Brief description",
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
  "homepage": "https://example.com"
}
```

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

The CLI:
1. Validates module metadata
2. Auto-detects runtime dependencies via AST analysis
3. Creates source (GitHub repo or Gist)
4. Calculates SHA256 content hash
5. Creates PR to registry with `modules/{author}/{module}.json`

### 2. Automated Review

When PR is created:
1. GitHub webhook triggers Vercel service
2. Vercel validates webhook signature
3. Fetches `review-pr.mld` from registry main branch
4. Runs script with injected credentials:
   - `MLLD_GITHUB_TOKEN`
   - `MLLD_ANTHROPIC_API_KEY`
   - `MLLD_PR_NUMBER`
   - `MLLD_REPO_OWNER`
   - `MLLD_REPO_NAME`
5. Script extracts module from PR diff
6. Validates structure and metadata
7. Queries Claude for security/quality review
8. Posts review comment with decision:
   - **APPROVE**: Ready to merge
   - **REQUEST_CHANGES**: Issues to fix
   - **COMMENT**: Needs human review

### 3. Auto-merge (Trusted Authors)

Authors in `allowlist.json` skip LLM review and auto-merge if:
- All CI checks pass
- Module structure is valid
- No security issues detected

### 4. Registry Build

On merge to main:
1. GitHub Actions runs `build-registry.yml`
2. Executes `tools/build-registry.js`:
   - Scans all `modules/**/*.json` files
   - Validates each module
   - Verifies path matches metadata
   - Combines into single registry
3. Generates two files:
   - `modules.json`: Minified for distribution
   - `modules.generated.json`: Formatted for humans
4. Commits generated files back to repo

## Module Resolution

When code uses `@import { util } from @author/module`:

1. RegistryResolver fetches `modules.json` from CDN
2. Looks up `@author/module` entry
3. Returns `source.url` for the module
4. Module content is fetched and cached locally
5. Lock file records URL and content hash

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

# 2. Extract module from diff
/var @moduleContent = @extractModuleFromPR(@prFiles, @prDiff)

# 3. Validate structure
/var @moduleValidation = @validateModule(@moduleContent)

# 4. Query Claude for review
/var @reviewContext = @createReviewContext(...)
/var @claudeResponse = @queryClaudeAPI(@reviewPrompt(...))
/var @aiReview = @parseReviewResponse(@claudeResponse)

# 5. Post GitHub review
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

