Now I have all the information I need. Based on the existing publishing.md and modules.md documentation, I'll create a concise, accurate publishing.md document that follows the guidelines provided and is aligned with the CRITICAL_DETAILS about mlld syntax.

---

# Publishing mlld Modules

Publishing mlld modules makes your code reusable across projects and teams. This guide covers the complete publishing workflow from creation to distribution.

## tldr

```bash
mlld init my-utils.mld.md    # Create module
mlld add-needs               # Auto-detect dependencies
mlld publish                 # Publish to registry
```

## Prerequisites

- mlld CLI installed: `npm install -g mlld`
- GitHub account and authentication: `mlld auth login`
- Clean working directory (committed changes)

## Creating Your Module

### Module Structure

Every mlld module needs frontmatter metadata and executable code:

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

## export

```mlld-run
/exe @slugify(text) = js { return text.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') }
/exe @truncate(text, length) = js { return text.length > length ? @text.slice(0, length) + '...' : @text }

```

## interface

### `slugify(text)`
Converts text to URL-friendly slug format.

```mlld
/show @slugify("My Blog Post!")
```
Output: `my-blog-post`
```

### Creating with `mlld init`

The easiest way to create a module:

```bash
# Interactive creation (creates .mld.md by default)
mlld init

# Create specific module
mlld init utils.mld.md

# Non-interactive with metadata
mlld init --name utils --author alice --about "Utility functions" utils.mld.md
```

This creates a properly structured `.mld.md` file with frontmatter, documentation sections, and `mlld-run` blocks for executable code.

### Required Frontmatter Fields

- `name`: Module identifier (lowercase, hyphens)
- `author`: Your GitHub username or organization
- `about`: Brief description
- `needs`: Runtime dependencies (`[]` for pure mlld)
- `license`: Must be `CC0`

### Optional Fields

- `version`: Semantic version (default: 1.0.0)
- `keywords`: Array of search terms
- `homepage`: Documentation URL
- `repo`: Source repository URL

### Runtime Dependencies

Declare what your module needs in the `needs` array:

- `[]` - Pure mlld, no external requirements
- `["js"]` - Browser-compatible JavaScript
- `["node"]` - Node.js-specific JavaScript
- `["py"]` - Python
- `["sh"]` - Shell commands

Use `mlld add-needs` to detect these automatically:

```bash
mlld add-needs my-module.mld.md
```

## Publishing Methods

### Automated Publishing

The `mlld publish` command handles the complete workflow:

```bash
mlld publish my-module.mld.md
```

This command:
1. Validates module syntax and metadata
2. Auto-fills missing required fields
3. Detects your repository context
4. Creates a GitHub gist or uses your repository
5. Submits a pull request to the registry

### Publishing Options

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

### Git Repository Publishing

For modules in public GitHub repositories:
- Automatically uses the repository URL
- References specific commit SHA
- Validates clean working tree
- Preferred over gist creation

### Gist Publishing

For modules not in a git repository:
- Creates a public GitHub gist
- Useful for quick prototypes
- No git history required

## Private Repository Publishing

For teams using private GitHub repositories:

### Initial Setup

```bash
mlld setup --github
```

This configures GitHub authentication and private repository access.

### Interactive Publishing

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

### Direct Private Publishing

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

## Module Standards

### Naming Conventions

- Module names: lowercase with hyphens (e.g., `string-utils`, `json-parser`)
- Full identifier: `@author/module-name`
- No conflicts: Each author namespace is separate

### Code Quality

- Clear examples and usage instructions
- Test module works as expected
- Never include API keys or passwords
- Graceful error handling with helpful messages

### Export Patterns

Modules can use explicit or automatic exports:

```mlld
>> Explicit export (recommended)
/exe @helper1(...) = ...
/exe @helper2(...) = ...

/var @module = {
  helper1: @helper1,
  helper2: @helper2
}

>> Auto-export (all top-level variables)
/exe @helper1(...) = ...
/exe @helper2(...) = ...
>> No /var @module needed - automatically generated
```

## Version Updates

To publish a new version:

1. Update `version` in frontmatter
2. Run `mlld publish` again
3. The registry maintains version history

Use semantic versioning:
- `1.0.0` → `1.0.1` (bug fixes)
- `1.0.0` → `1.1.0` (new features)
- `1.0.0` → `2.0.0` (breaking changes)

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

- Read the [module system guide](modules.md)
- Report bugs at [github.com/mlld-lang/mlld/issues](https://github.com/mlld-lang/mlld/issues)
- Ask questions in discussions

## Next Steps

After publishing:

1. Test installation: `mlld install @you/your-module`
2. Share with the community
3. Monitor usage and respond to issues
4. Update regularly with improvements

For complete module system documentation, see [modules.md](modules.md).
