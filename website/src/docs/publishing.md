---
layout: docs.njk
title: "Publishing mlld Modules"
---

# Publishing mlld Modules

This guide covers how to publish mlld modules, from creation to making them available in the public registry or keeping them private for your team.

## Table of Contents

- [Quick Start](#quick-start)
- [Prerequisites](#prerequisites)
- [Creating Your Module](#creating-your-module)
- [Publishing Methods](#publishing-methods)
  - [Automated Publishing](#automated-publishing)
  - [Private Repository Publishing](#private-repository-publishing)
  - [Manual Registry Registration](#manual-registry-registration)
- [Module Standards](#module-standards)
- [Version Updates](#version-updates)
- [Security Advisories](#security-advisories)
- [Troubleshooting](#troubleshooting)

## Quick Start

```bash
# Create a new module
mlld init my-utils.mld.md

# Add dependencies automatically
mlld add-needs my-utils.mld.md

# Publish to registry
mlld publish my-utils.mld.md

# Or use simplified syntax if configured
mlld publish @myusername/my-utils
```

## Prerequisites

1. **mlld CLI installed**: `npm install -g mlld`
2. **GitHub account**: Required for authentication
3. **GitHub authentication**: Run `mlld auth login`
4. **Initial setup** (optional): Run `mlld setup` to configure resolvers and authentication

## Creating Your Module

### Module Structure

Every mlld module needs:
1. **Frontmatter** with metadata
2. **Documentation** explaining usage
3. **Code** in `mlld-run` blocks

Example module:
```markdown
---
name: string-utils
author: alice
version: 1.0.0
about: String manipulation utilities
needs: ["js"]
license: CC0
---

# String Utilities

Helpful functions for string manipulation.

## Module

```mlld-run
/exe @slugify(text) = /run js {@text.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}
/exe @truncate(text, length) = /run js {@text.length > @length ? @text.slice(0, @length) + '...' : @text}
```

### Module Metadata

Required fields:
- `name`: Module identifier (lowercase, hyphens)
- `author`: Your GitHub username or organization
- `about`: Brief description
- `needs`: Runtime dependencies (`[]` for pure mlld)
- `license`: Must be `CC0`

Optional fields:
- `version`: Semantic version (default: 1.0.0)
- `keywords`: Array of search terms
- `homepage`: Documentation URL
- `bugs`: Issue tracker URL
- `repo`: Source repository URL

### Runtime Dependencies

Declare what your module needs to run:
- `[]` - Pure mlld, no external requirements
- `["js"]` - Browser-compatible JavaScript
- `["node"]` - Node.js-specific JavaScript
- `["py"]` - Python
- `["sh"]` - Shell commands

The `mlld add-needs` command detects these automatically.

## Publishing Methods

### Automated Publishing

The `mlld publish` command handles most publishing scenarios automatically:

```bash
mlld publish my-module.mld.md
```

This command:
1. Validates module syntax and metadata
2. Auto-fills missing required fields
3. Detects your repository context
4. Creates a GitHub gist or uses your repository
5. Submits a pull request to the registry

#### Publishing Options

```bash
# Preview without publishing
mlld publish --dry-run

# Force publish with uncommitted changes
mlld publish --force

# Add custom PR message
mlld publish --message "Initial release"

# Publish as organization
mlld publish --org myorg

# Force specific method
mlld publish --gist    # Always create gist
mlld publish --repo    # Always use repository
```

#### Git Repository Publishing

If your module is in a public GitHub repository:
- Automatically uses the repository URL
- References specific commit SHA
- Validates clean working tree
- Prefers this over gist creation

#### Gist Publishing

For modules not in a git repository or in private repos without write access:
- Creates a public GitHub gist
- Useful for quick prototypes
- No git history required

### Simplified Publish Syntax

If you have configured registries in your `mlld.lock.json`, you can use the simplified publish syntax:

```bash
# Instead of specifying the file path:
mlld publish ./llm/modules/my-module.mlld.md

# Use the module reference directly:
mlld publish @myusername/my-module
```

This will:
1. Look up the registry configuration for `@myusername/`
2. Find the module file based on the configured base path
3. Select the appropriate publishing method (GitHub, registry, etc.)

Configure registries with `mlld setup` or manually in `mlld.lock.json`.

### Private Repository Publishing

For teams using private GitHub repositories:

#### Initial Setup

```bash
# Set up GitHub authentication and private repository access
mlld setup --github

# This will:
# 1. Verify your GitHub authentication
# 2. Configure your private repository
# 3. Set up resolver configuration in mlld.lock.json
# 4. Test repository access
```

#### Interactive Mode

When in a private repo with write access:
```bash
mlld publish my-module.mld.md

# You'll see:
⚠️  Repository is private but you have write access.

Options:
  [p]     Publish to private repository
  [g]     Create public gist instead
  [c]     Cancel
```

#### Direct Private Publishing

Skip prompts with the `--private` flag:

```bash
# Publish to private repo
mlld publish my-module.mld.md --private

# Custom directory
mlld publish my-module.mld.md --private --path lib/modules

# Also create registry PR for future public release
mlld publish my-module.mld.md --private --pr
```

Private publishing:
- Stores modules in `llm/modules/` (or custom path)
- Creates `manifest.json` for team discovery
- Commits and pushes to your repository
- No public registry PR by default

Team members import using file paths:
```mlld
/import { utils } from "./llm/modules/utils.mld.md"
/import { shared } from "../other-repo/llm/modules/shared.mld.md"
```

### Manual Registry Registration

If you need to manually add your module to the registry:

1. **Create your module** (as a gist or in a public repo)

2. **Fork the registry**:
   ```bash
   gh repo fork mlld-lang/registry --clone
   cd registry
   ```

3. **Add your module** to `modules.json`:
   ```json
   {
     "@alice/string-utils": {
       "name": "string-utils",
       "author": "alice",
       "version": "1.0.0",
       "about": "String manipulation utilities",
       "needs": ["js"],
       "license": "CC0",
       "source": {
         "type": "gist",
         "url": "https://gist.githubusercontent.com/alice/abc123/raw/string-utils.mld.md",
         "gistId": "abc123",
         "contentHash": "sha256..."
       },
       "publishedAt": "2024-01-15T10:30:00Z"
     }
   }
   ```

4. **Submit a pull request**:
   ```bash
   git add modules.json
   git commit -m "Add @alice/string-utils"
   git push origin main
   gh pr create
   ```

## Module Standards

### Naming Conventions

- **Module names**: lowercase with hyphens (e.g., `string-utils`, `json-parser`)
- **Full identifier**: `@author/module-name`
- **No conflicts**: Each author namespace is separate

### Code Quality

- **Documentation**: Clear examples and usage instructions
- **Testing**: Verify module works as expected
- **No secrets**: Never include API keys or passwords
- **Error handling**: Graceful failures with helpful messages

### Export Patterns

Modules auto-export all top-level variables, or use explicit patterns:

```mlld
>> Auto-export pattern
/exe @helper1(...) = ...
/exe @helper2(...) = ...

>> Explicit export
/var @module = {
  helper1: @helper1,
  helper2: @helper2
}
```

## Version Updates

To publish a new version:

1. Update `version` in frontmatter
2. Run `mlld publish` again
3. The registry maintains version history

Semantic versioning recommended:
- `1.0.0` → `1.0.1` (bug fixes)
- `1.0.0` → `1.1.0` (new features)
- `1.0.0` → `2.0.0` (breaking changes)

## Security Advisories

Report security issues in modules:

1. Create `advisory-[module-name].json`:
   ```json
   {
     "module": "@author/vulnerable-module",
     "severity": "high",
     "title": "Command injection vulnerability",
     "description": "User input passed directly to shell",
     "affectedVersions": "<=1.0.5",
     "patchedVersions": ">=1.0.6",
     "references": ["https://github.com/author/module/security/advisories/GHSA-xxxx"],
     "reportedBy": "security-researcher",
     "reportedAt": "2024-01-15T10:00:00Z"
   }
   ```

2. Submit PR to registry's `advisories/` directory

## Troubleshooting

### Common Issues

**"Module validation failed"**
- Run `mlld add-needs` to detect dependencies
- Ensure `license: CC0` is set
- Check module name is lowercase with hyphens

**"Uncommitted changes"**
- Commit your changes: `git add . && git commit -m "Update"`
- Or use `--force` to publish anyway

**"Not authorized to publish as organization"**
- Verify you're a member of the organization
- Check organization permissions on GitHub

**"Module already exists"**
- Only the original author can update modules
- Choose a different module name
- Or contact the module author

### Getting Help

- **Documentation**: Read the [module system guide](modules.md)
- **Issues**: Report bugs at [github.com/mlld-lang/mlld/issues](https://github.com/mlld-lang/mlld/issues)
- **Community**: Ask questions in discussions

## Next Steps

After publishing:
1. Share your module: `mlld install @you/your-module`
2. Monitor usage: `mlld registry stats`
3. Respond to issues and security reports
4. Update regularly with improvements

Happy publishing! 🚀