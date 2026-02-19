# mlld Registry

## tldr

Publish modules to the mlld registry with `mlld publish`. First-time modules go through PR review. Updates publish directly. Authenticate with GitHub, ensure CC0 license, include required metadata. Registry hosted at github.com/mlld-lang/registry.

## Publishing Your First Module

### Prerequisites

1. **GitHub account** - You'll authenticate via GitHub
2. **mlld CLI** - Install via `npm install -g mlld`
3. **Module file** - Your `.mld`/`.mld.md` file with frontmatter and `needs`

### Required Metadata

```yaml
---
name: my-tool
author: yourname
version: 1.0.0
about: Brief description of what this does
license: CC0
---
```

All fields required. License must be CC0. Declare runtimes in the module body:

```mlld
/needs {
  node: [],
  sh: true
}
```

### Publish Command

```bash
mlld publish my-tool.mld.md
```

First time publishing:
1. Authenticates via GitHub
2. Validates module
3. Creates source (Gist or uses your repo)
4. Opens PR to mlld-lang/registry
5. Automated review posts feedback
6. Merge approval gives you publish rights

### Authentication

First time:
```bash
mlld auth login
```

Opens GitHub OAuth flow. Grants:
- `gist` scope - Create Gists for module source
- `public_repo` scope - Create PRs to registry

Check status:
```bash
mlld auth status
```

Logout:
```bash
mlld auth logout
```

## Module Validation

Your module must pass validation before publishing:

### Syntax Validation
- No syntax errors
- No reserved word conflicts
- Valid mlld directives

### Export Validation
- `export` directive present (recommended)
- Exported names exist as variables
- No duplicate exports

### Import Validation
- Imports reference valid modules
- No circular dependencies
- Local imports for dev only

### Metadata Validation
- All required fields present
- Author matches GitHub username
- License is CC0
- Version follows semver

Run validation locally:
```bash
mlld publish --dry-run my-tool.mld.md
```

## Publishing Workflow

### First-Time Module

Creates a pull request:

```bash
mlld publish my-tool.mld.md
```

1. **Validation** - Checks syntax, exports, metadata
2. **Source Creation** - Creates Gist or references repo
3. **PR Creation** - Opens PR to mlld-lang/registry
4. **Automated Review** - LLM reviews for:
   - No hardcoded secrets
   - Safe operations
   - Real utility
   - Proper licensing
5. **Manual Review** (if needed) - Maintainer approval
6. **Merge** - Module becomes available
7. **Publish Rights** - You can update directly going forward

### Module Updates

After first module is merged:

```bash
mlld publish my-tool.mld.md
```

1. **Version Bump** - Prompts for patch/minor/major
2. **Validation** - Same checks as first-time
3. **Direct Publish** - No PR needed (if authenticated)
4. **Registry Update** - New version available immediately

Version bump options:
- `patch` - Bug fixes (1.0.0 → 1.0.1)
- `minor` - New features (1.0.0 → 1.1.0)
- `major` - Breaking changes (1.0.0 → 2.0.0)
- `custom` - Specify exact version

Force PR workflow:
```bash
mlld publish --pr my-tool.mld.md
```

### Existing PR Detection

If you have an open PR:

```bash
mlld publish my-tool.mld.md
```

Options:
- Update existing PR
- Close and create new PR
- View PR in browser

### Direct Publish via API

After your first module is merged, you can publish updates directly using the Registry API:

```bash
# Via mlld CLI (recommended)
mlld publish my-tool.mld.md

# Via API directly
curl -X POST https://registry-api.mlld.org/api/publish \
  -H "Authorization: Bearer $TOKEN" \
  -F "module=@my-tool.mld.md"
```

**Authentication:**
- Requires GitHub authentication token
- Must be module owner or maintainer
- Token obtained via `mlld auth login`

**Behavior:**
- Skips PR workflow
- Publishes immediately
- Updates registry in real-time
- Records `publishedBy` field with your GitHub user ID

**Use cases:**
- Quick bug fixes
- Patch releases
- Version bumps for existing modules

**Force PR workflow:**
```bash
mlld publish --pr my-tool.mld.md  # Creates PR even if you have direct publish rights
```

## Module Structure

### Versioned Registry

Modules are stored with version history:

```
registry/
└── modules/
    └── alice/
        └── my-tool/
            ├── metadata.json      # Core info, owners
            ├── 1.0.0.json         # Version 1.0.0
            ├── 1.0.1.json         # Version 1.0.1
            └── tags.json          # latest, stable, etc.
```

### metadata.json

```json
{
  "name": "my-tool",
  "author": "alice",
  "about": "Brief description",
  "owners": ["alice"],
  "maintainers": [],
  "created": "2024-01-01T00:00:00Z",
  "createdBy": 12345,
  "firstPublishPR": 123
}
```

### {version}.json

```json
{
  "version": "1.0.0",
  "needs": ["js", "sh"],
  "license": "CC0",
  "mlldVersion": ">=1.0.0",
  "source": {
    "type": "github",
    "url": "https://raw.githubusercontent.com/...",
    "contentHash": "sha256:abc123...",
    "repository": {
      "type": "git",
      "url": "https://github.com/alice/repo",
      "commit": "abc123",
      "path": "my-tool.mld.md"
    }
  },
  "dependencies": {
    "js": {
      "packages": ["lodash"]
    }
  },
  "keywords": ["utility", "automation"],
  "publishedAt": "2024-01-01T00:00:00Z",
  "publishedBy": 12345
}
```

**Key Fields:**

- **publishedBy** - GitHub user ID of the publisher (numeric ID, not username)
- **publishedAt** - ISO timestamp when this version was published
- **source.type** - Source type: `github`, `gist`, or `private-repo`
- **source.contentHash** - SHA256 hash for content verification
- **source.repository** - Git repository metadata (for github/private-repo sources)

### tags.json

```json
{
  "latest": "1.0.1",
  "stable": "1.0.1",
  "beta": "2.0.0-beta.1"
}
```

## Module Source

### GitHub Repository

If your module is in a git repo:

```bash
mlld publish my-tool.mld.md
```

Detects:
- Repository URL
- Current commit SHA
- Module file path
- Whether repo is clean

Source references the commit SHA, ensuring immutability.

### Gist

If not in a repo:

Creates a GitHub Gist automatically:
- Public Gist with module content
- Versioned via Gist revisions
- Content hash for integrity

### Private Modules

For private/internal modules, use local or custom resolvers. See [resolvers.md](resolvers.md).

## Dependency Declaration

### Runtime Dependencies

Declare runtimes with `needs`:

```mlld
/needs {
  node: [],
  py: [],
  sh: true
}
```

Types:
- `js` - Browser JavaScript
- `node` - Node.js (fs, path, etc.)
- `py` - Python
- `sh` - Shell commands

### Package Dependencies

Include package requirements in `needs`:

```mlld
/needs {
  node: [lodash@^4, axios],
  py: [requests>=2.31.0]
}
```

### Command Dependencies

List required commands:

```mlld
/needs {
  sh: true,
  cmd: [git, curl, jq]
}
```

### mlld Module Dependencies

```yaml
---
dependencies:
  "@alice/utils": "^1.0.0"
  "@company/auth": "latest"
---
```

### Auto-Detection

```bash
mlld add-needs my-tool.mld
```

`mlld add-needs` analyzes your module and updates the `needs` block.

Analyzes your module and updates frontmatter with detected dependencies.

## Version Management

### Semantic Versioning

Follow semver (major.minor.patch):
- **1.0.0** - Initial release
- **1.0.1** - Bug fix (backward compatible)
- **1.1.0** - New feature (backward compatible)
- **2.0.0** - Breaking change

### Version Tags

Publish with tags:

```bash
mlld publish --tag beta my-tool.mld.md
```

Users import via tag:
```mlld
import { @helper } from @alice/my-tool@beta

>> Namespace alias
import @corp/utils as @corp

>> Semver range
import { @helper } from @alice/utils@^1.0.0
```

Common tags:
- `latest` - Most recent stable (default)
- `stable` - Recommended version
- `beta` - Beta testing
- `alpha` - Alpha testing

### Version Ranges

Users specify ranges in `mlld-config.json`:

```json
{
  "dependencies": {
    "@alice/my-tool": "^1.0.0",  // 1.x.x
    "@bob/utils": "~1.2.0",      // 1.2.x
    "@eve/lib": ">=1.0.0 <2.0.0" // Range
  }
}
```

Lock file pins exact versions.

## Lock File (mlld-lock.json)

When you install modules, mlld creates `mlld-lock.json` to ensure reproducible imports. This file tracks exact versions and content hashes.

### Lock File Schema

```json
{
  "lockfileVersion": 1,
  "modules": {
    "@alice/utils": {
      "version": "1.0.0",
      "resolved": "abc123def456...",
      "source": "@alice/utils",
      "sourceUrl": "https://registry.mlld.org/modules/@alice/utils/1.0.0",
      "integrity": "sha256:abc123...",
      "fetchedAt": "2024-01-15T10:00:00Z",
      "registryVersion": "1.0.0"
    }
  }
}
```

### Lock Entry Fields

**version** - The exact version installed (from registry version.json)

**resolved** - Content hash used for cache lookup (SHA256)

**source** - Original module specifier from your imports

**sourceUrl** - URL where the module was fetched from

**integrity** - Content hash for verification (sha256:...)

**fetchedAt** - Timestamp when module was installed

**registryVersion** - Version from registry metadata (only for registry modules)

### Lock File Behavior

- **Auto-generated** - Created/updated by `mlld install`
- **Version control** - Commit to git for reproducible builds
- **Never edit manually** - Use CLI commands to update
- **Registry-only validation** - Lock file only enforces version matches for registry modules
- **Version pinning** - `version: "latest"` updates to newest on `mlld update`; exact version (e.g. `"1.2.0"`) stays pinned until manually changed

### Commands

**Install from lock file:**
```bash
mlld install  # Installs exact versions from lock file
```

**List installed modules:**
```bash
mlld ls  # Lists installed modules with versions
```

**Update lock file:**
```bash
mlld update @alice/utils  # Updates lock entry for specific module
mlld update               # Updates all modules in mlld-lock.json
```

**Check module info:**
```bash
mlld registry info @alice/utils  # Show module details from registry
```

**Check lock file status:**
```bash
mlld outdated  # Shows modules with newer versions available
```

**Verify after updating:**
```bash
mlld validate your-file.mld  # Check imports resolve
```

## Ownership & Permissions

### Module Owners

After first PR merges, you become module owner:
- Can publish updates directly
- Can add maintainers
- Module namespaced under your GitHub username

### Maintainers

Add collaborators to `metadata.json`:

```json
{
  "owners": ["alice"],
  "maintainers": ["bob", "eve"]
}
```

Maintainers can also publish updates.

### Organization Modules

Publish under org namespace:

```yaml
---
author: company
name: auth-tool
---
```

Requires write access to `@company` in registry.

## Review Process

### Automated Review

LLM reviews check for:

1. **No secrets** - API keys, tokens, passwords
2. **Safe operations** - No arbitrary code execution
3. **Real utility** - Solves actual problems
4. **Proper licensing** - Must be CC0
5. **Accurate metadata** - Matches functionality

Review posts as PR comment with:
- **APPROVE** - Ready to merge
- **REQUEST_CHANGES** - Issues to fix
- **COMMENT** - Needs human review

### Re-review on Updates

Push new commits to PR:
- Webhook triggers new review
- Shows previous review status
- Focuses on changes since last review

### Trusted Authors

Authors in allowlist skip LLM review:
- Module structure validated
- No security issues detected
- Auto-merges if CI passes

## Common Issues

### Validation Errors

**Missing required fields**:
Add all required frontmatter fields.

**Author mismatch**:
Author field must match your GitHub username.

**License not CC0**:
Only CC0 license accepted for registry.

**Export not found**:
Ensure `export` lists match variable names.

### Publishing Errors

**Not authenticated**:
```bash
mlld auth login
```

**Version already exists**:
Bump version or publish with new version number.

**Import validation failed**:
Fix import references before publishing.

### PR Issues

**Review requested changes**:
Address feedback and push new commit.

**Conflicts with main**:
Rebase or close and create new PR.

**PR not found**:
Check github.com/mlld-lang/registry/pulls.

## Best Practices

**Test locally first**:
```bash
mlld my-tool.mld  # Run as script
mlld publish --dry-run my-tool.mld.md  # Validate
```

**Use explicit exports**:
```mlld
export { @publicAPI }
```

**Version appropriately**:
- Patch for bugs
- Minor for features
- Major for breaking changes

**Document well**:
```yaml
---
about: Clear, concise description
keywords: [relevant, searchable, tags]
---
```

**Keep modules focused**:
One module, one purpose. Split large modules into multiple packages.

**Declare dependencies**:
```bash
mlld add-needs my-tool.mld
```

**Test across mlld versions**:
```yaml
---
mlldVersion: ">=1.0.0"
---
```

## Registry API

For advanced use cases, registry API available at `registry-api.mlld.org`:

### Resolve Version
```bash
curl https://registry-api.mlld.org/api/resolve?module=@alice/my-tool
```

### Direct Publish
```bash
curl -X POST https://registry-api.mlld.org/api/publish \
  -H "Authorization: Bearer $TOKEN" \
  -F "module=@my-tool.mld.md"
```

See API docs for details.

## Migration Guide

### From Local to Registry

1. Add frontmatter with required fields
2. Add `export` directive
3. Run `mlld add-needs` to detect dependencies
4. Test locally: `mlld my-tool.mld`
5. Publish: `mlld publish my-tool.mld.md`

### From Gist to Repo

1. Move module to git repo
2. Commit and push
3. Publish update:
```bash
mlld publish my-tool.mld.md
```

Source automatically updates to repo reference.

## Support

**Issues**: https://github.com/mlld-lang/registry/issues
**Discussions**: https://github.com/mlld-lang/mlld/discussions
**Examples**: https://github.com/mlld-lang/registry/tree/main/modules