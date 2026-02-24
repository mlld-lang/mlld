---
layout: docs.njk
title: "Modules and Registry"
type: explainer
order: 3
---

# Modules and Registry

## Creating Modules

### Basic Module Structure

```mlld
---
name: greetings
author: alice
version: 1.0.0
about: Simple greeting utilities
license: CC0
---

/needs {}

exe @sayHello(name) = `Hello, @name!`
exe @sayGoodbye(name) = `Goodbye, @name!`

export { @sayHello, @sayGoodbye }
```

Save as `greetings.mld` and it's ready to import.

### Export Control

`export` declares what others can import:

```mlld
exe @publicHelper(x) = `Value: @x`
exe @_internalHelper(x) = run {echo "@x" | tr a-z A-Z}

export { @publicHelper }
```

Only `@publicHelper` is accessible to importers. Without `export`, all variables are exported (legacy behavior).

### Module Dependencies

Declare what your module needs with `needs`:

```mlld
/needs {
  js: [lodash],
  sh: true,
  cmd: [git, curl]
}
```

`js`/`node`/`py` entries declare runtime packages. `sh` requests shell access; `cmd` lists required commands.

#### Runtime Dependencies

Types:
- `js` - Browser JavaScript
- `node` - Node.js (fs, path, etc.)
- `py` - Python
- `sh` - Shell commands

#### Package Dependencies

Include package requirements in `needs`:

```mlld
/needs {
  node: [lodash@^4, axios],
  py: [requests>=2.31.0]
}
```

#### Command Dependencies

List required commands:

```mlld
/needs {
  sh: true,
  cmd: [git, curl, jq]
}
```

#### mlld Module Dependencies

```yaml
---
dependencies:
  "@alice/utils": "^1.0.0"
  "@company/auth": "latest"
---
```

#### Auto-Detection

```bash
mlld add-needs my-tool.mld
```

`mlld add-needs` analyzes your module and updates the `needs` block.

Analyzes your module and updates frontmatter with detected dependencies.

### Module Structure

Modules are directories with an entry point, manifest, and optional supporting files:

```
myapp/
├── index.mld          # Entry point
├── module.yml         # Manifest
├── README.md          # Documentation
└── lib/               # Supporting files
    └── helpers.mld
```

**module.yml format:**
```yaml
name: myapp
author: alice
type: app               # library | app | command | skill
about: "Description"
version: 1.0.0
license: CC0
```

### Frontmatter vs module.yml

Directory modules use two metadata layers:

| Source | Lives in | Used for |
|--------|----------|----------|
| Frontmatter (`--- ... ---`) | Entry `.mld` file | Runtime metadata (`@fm`, imported namespace `.__meta__`) |
| `module.yml` | Module directory root | Packaging metadata (type, publish/install metadata) |

If fields differ, runtime metadata comes from entry-file frontmatter, while packaging metadata comes from `module.yml`.
Keep shared identity fields (`name`, `author`, `version`, `about`) aligned in both files.

**Module types and their install locations:**

| Type | Local | Global |
|------|-------|--------|
| `library` | `llm/lib/` | `~/.mlld/lib/` |
| `app` | `llm/run/` | `~/.mlld/run/` |
| `command` | `.claude/commands/` | `~/.claude/commands/` |
| `skill` | `.claude/skills/` | `~/.claude/skills/` |

**Create directory modules:**
```bash
mlld module app myapp              # → llm/run/myapp/
mlld module library utils          # → llm/lib/utils/
mlld module command review         # → .claude/commands/review/
mlld module skill helper           # → .claude/skills/helper/
mlld module app myapp --global     # → ~/.mlld/run/myapp/
```

**Run directory apps:**
```bash
mlld run myapp                     # Runs llm/run/myapp/index.mld
```
Use `index.mld` as the module entry point convention.


## Importing Modules

### Registry Modules

```mlld
import { @helper } from @alice/utils
show @helper("data")
```

Install first:
```bash
mlld install @alice/utils
```

### Local Files

```mlld
import { @config } from "./config.mld"
import "./helpers.mld" as @helpers
import "./agents" as @agents
show @config.apiKey
show @helpers.format("ok")
show @agents.support.reply("hello")
```

Relative `./` and `../` paths resolve from the importing file's directory, not your shell cwd.

If you run:

```bash
cd /tmp
mlld /home/user/project/scripts/main.mld
```

Then `import "./config.mld"` resolves to `/home/user/project/scripts/config.mld`.

Use `@root` for project-root imports:

```mlld
import { @shared } from <@root/lib/shared.mld>
```

### URL Imports

```mlld
import cached(1h) <https://example.com/utils.mld> as @remote
show @remote.version
```

### Import Types

Control when and how imports resolve:

```mlld
>> Registry module (offline after install)
import module { @api } from @company/tools

>> Embedded at parse time (named import)
import static { @prompt } from "./prompt.md"

>> Embedded at parse time (namespace import)
import static <./prompts/system.md> as @systemPrompt

>> Always fetch fresh
import live <https://api.status.io> as @status

>> Cached with TTL
import cached(30m) <https://feed.xml> as @feed

>> Local development (llm/modules/)
import local { @helper } from @alice/dev-module
```

| Type | Behavior | Use Case |
|------|----------|----------|
| `module` | Content-addressed cache | Registry modules (default) |
| `static` | Embedded at parse time | Prompts, templates |
| `live` | Always fresh | Status APIs |
| `cached(TTL)` | Time-based cache | Feeds, configs |
| `local` | Dev modules (llm/modules/) | Development |
| `templates` | Directory of .att files | Template collections |

### Import Patterns

| Goal | Syntax |
|------|--------|
| Selected exports from one module file | `import { @helper } from "./utils.mld"` |
| Namespace import from one module file | `import "./utils.mld" as @utils` |
| Namespace import from a directory | `import "./agents" as @agents` |
| Namespace import from registry module | `import @alice/utils as @utils` |

Directory imports are namespace-only. To import selected exports from a directory module, target its entry file:

```mlld
import { @helper } from "./agents/index.mld"
```

**Selected imports**:
```mlld
import { @helper, @validator } from @alice/utils
```

**Namespace imports**:
```mlld
import @alice/utils as @utils
show @utils.helper("data")
```

**Avoid collisions**:
```mlld
import { @helper } from @alice/utils
import @bob/tools as @bob  >> Use namespace for second import
show @helper("x")
show @bob.helper("y")
```

## Module Environment

Modules capture their defining environment. Executables reference their original variables:

```mlld
>> In utils.mld
var @prefix = "Result: "
exe @format(x) = `@prefix @x`
export { @format }
```

When imported:
```mlld
import { @format } from <./utils.mld>
show @format("success")  >> → "Result: success"
```

`@prefix` resolves from the module, not your script.

## Development Workflow

### Local Development

1. Create module in `llm/modules/`:
```bash
mkdir -p llm/modules/@alice
# Create llm/modules/@alice/my-tool.mld
```

2. Use local import:
```mlld
import local { @tool } from @alice/my-tool
```

3. Test and iterate without registry publishing

### Quick Start

Generate module template:
```bash
mlld module @alice/my-tool
```

This creates a complete module structure with frontmatter and examples.

### Testing Modules

Create test scripts in your project:

```mlld
>> test-module.mld
import { @helper } from <./my-module.mld>
var @result = @helper("test")
when @result == "expected" => show "✓ Pass"
when @result != "expected" => show "✗ Fail"
```

Run tests:
```bash
mlld test-module.mld
```

## Configuration (mlld-config.json)

```json
{
  "dependencies": {
    "@alice/utils": "1.0.0",
    "@company/auth": "latest"
  },
  "dev": {
    "localModulesPath": "llm/modules",
    "enabled": true
  }
}
```

Create config:
```bash
mlld setup
```

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

### Version Resolution in Imports

| Import | Version |
|--------|---------|
| `import ... from @alice/utils` | latest |
| `import ... from @alice/utils@1.0.0` | exact |
| `import ... from @alice/utils@^1.0.0` | compatible |
| `import ... from @alice/utils@beta` | tag |

Lock file pins exact versions for reproducibility.

## Commands

### Install Dependencies
```bash
mlld install                    # Install from mlld-config.json
mlld install @alice/utils       # Install specific module
mlld install @alice/utils@1.2.0 # Install specific version
```

### List Installed Modules
```bash
mlld ls                         # List all installed modules with versions
```

### Update Modules
```bash
mlld update                     # Update all modules
mlld update @alice/utils        # Update specific module
mlld outdated                   # Check for newer versions
mlld registry info @alice/utils # Show module details from registry
```

### Verify Imports
```bash
mlld validate your-file.mld     # Check imports resolve
```

### Publishing
```bash
mlld publish my-module.mld      # Publish to registry
mlld publish --pr               # Force PR workflow
mlld publish --tag beta my-tool.mld.md  # Publish with tag
mlld publish --dry-run my-tool.mld.md   # Validate without publishing
```

## Publishing

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

All fields required. License must be CC0.

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

### Module Validation

Your module must pass validation before publishing:

#### Syntax Validation
- No syntax errors
- No reserved word conflicts
- Valid mlld directives

#### Export Validation
- `export` directive present (recommended)
- Exported names exist as variables
- No duplicate exports

#### Import Validation
- Imports reference valid modules
- No circular dependencies
- Local imports for dev only

#### Metadata Validation
- All required fields present
- Author matches GitHub username
- License is CC0
- Version follows semver

### Publishing Workflow

#### First-Time Module

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

#### Module Updates

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

#### Existing PR Detection

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

For private/internal modules, use local or custom resolvers.

## Registry Structure

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

## Dynamic Modules (SDK)

Runtime module injection without filesystem I/O. Enables multi-tenant applications to inject per-user/project context from database.

### String Modules

Inject mlld source as strings:

```typescript
const output = await processMlld(template, {
  dynamicModules: {
    '@user/context': `/export { @userId, @userName }\n/var @userId = "123"\n/var @userName = "Ada"`
  }
});
```

### Object Modules

Inject structured data directly (recommended):

```typescript
const output = await processMlld(template, {
  dynamicModules: {
    '@state': {
      count: 0,
      messages: ['Hello', 'World'],
      preferences: { theme: 'dark' }
    },
    '@payload': {
      text: userInput,
      userId: session.userId
    }
  }
});
```

Access in your script:

```mlld
var @count = @state.count + 1
var @theme = @state.preferences.theme
var @input = @payload.text
```

### Security

Dynamic modules are automatically labeled `src:dynamic` for guard enforcement:

```mlld
guard before secret = when [
  @input.mx.taint.includes('src:dynamic') =>
    deny "Cannot use dynamic data as secrets"
  * => allow
]
```

### Priority

Dynamic modules override filesystem and registry modules with the same path (highest priority).

**Use cases**: Multi-tenant SaaS, per-request context injection, testing with mock data.

**Not for CLI**: CLI users should use filesystem modules. Dynamic modules are SDK-only.

## Troubleshooting

**Import not found**:
```bash
mlld install @alice/utils  # Install first
```

**Version mismatch**:
```bash
mlld update @alice/utils   # Update to latest
# Or edit mlld-config.json and run mlld install
```

**Export not found**:
Check `export` directive includes the variable name.

**Collision error**:
Use namespace imports:
```mlld
import @alice/utils as @alice
import @bob/utils as @bob
```

**Module not updating**:
Local imports read from disk every time. Registry modules are cached - use `mlld update` to refresh.

**Missing required fields**:
Add all required frontmatter fields.

**Author mismatch**:
Author field must match your GitHub username.

**License not CC0**:
Only CC0 license accepted for registry.

**Not authenticated**:
```bash
mlld auth login
```

**Version already exists**:
Bump version or publish with new version number.

**Import validation failed**:
Fix import references before publishing.

**Review requested changes**:
Address feedback and push new commit.

**Conflicts with main**:
Rebase or close and create new PR.

**PR not found**:
Check github.com/mlld-lang/registry/pulls.

## Common Patterns

### Config Module
```mlld
---
name: config
about: App configuration
---

var @apiUrl = "https://api.example.com"
var @timeout = 30000
export { @apiUrl, @timeout }
```

### Utility Collection
```mlld
---
name: text-utils
about: String manipulation utilities
---

exe @uppercase(text) = run {echo "@text" | tr a-z A-Z}
exe @trim(text) = js { return @text.trim() }
export { @uppercase, @trim }
```

### Template Library
```mlld
---
name: prompts
about: Reusable prompts
---

exe @systemPrompt(role) = `You are a @role assistant.`
exe @userPrompt(task) = `Please help me with: @task`
export { @systemPrompt, @userPrompt }
```

## Best Practices

**Use explicit exports**:
```mlld
export { @publicAPI, @helper }
```

**Prefix internals** (convention):
```mlld
exe @_internal(name) = "opaque"  >> Not in export list
```

Unexported values are not accessible through namespace imports, including executable internal capture metadata.

**Document exports**:
```mlld
>> Public API for data transformation
exe @transform(data) = `Processed: @data`
export { @transform }
```

**Test before publishing**:
```bash
mlld my-module.mld  # Run as script first
mlld publish --dry-run my-tool.mld.md  # Validate
```

**Use local imports for development**:
```mlld
import local { @tool } from @me/dev-module
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
