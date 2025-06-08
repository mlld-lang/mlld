# Publishing mlld Modules

This guide covers how to publish and manage mlld modules using the CLI interface. The mlld module system is built on GitHub infrastructure, providing a decentralized, secure way to share reusable code.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Authentication](#authentication)
- [Creating a Module](#creating-a-module)
- [Publishing Workflow](#publishing-workflow)
- [Registry Management](#registry-management)
- [Module Installation](#module-installation)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)

## Prerequisites

Before publishing modules, ensure you have:

1. **mlld CLI installed**: `npm install -g mlld`
2. **GitHub account**: Required for authentication and publishing
3. **Git repository** (optional): For git-native publishing

## Authentication

mlld uses GitHub authentication for publishing modules. Authentication tokens are stored securely in your system keychain.

### Login

```bash
mlld auth login
```

This command initiates GitHub OAuth Device Flow:
1. Opens your browser to GitHub's device authorization page
2. Displays a device code to enter
3. Stores the authentication token securely

### Check Authentication Status

```bash
mlld auth status
```

Shows:
- Whether you're logged in
- Your GitHub username
- Token expiration (if applicable)

### Logout

```bash
mlld auth logout
```

Removes stored credentials from your system.

## Creating a Module

### Module Structure

Every mlld module requires frontmatter metadata:

```markdown
---
name: my-utils
description: Utility functions for text processing
author: myusername
keywords: [utils, text, processing]
---

@text trim(str) = @run [echo "{{str}}" | xargs]
@text uppercase(str) = @run [echo "{{str}}" | tr '[:lower:]' '[:upper:]']
@text lowercase(str) = @run [echo "{{str}}" | tr '[:upper:]' '[:lower:]']
```

### Required Metadata

- **name**: Module name (lowercase, hyphens allowed)
- **description**: Brief description of functionality
- **author**: Your GitHub username or organization

### Optional Metadata

- **keywords**: Array of searchable terms
- **homepage**: Project website
- **repository**: Source repository URL
- **license**: Module license (e.g., MIT, Apache-2.0)

## Publishing Workflow

### Basic Publishing

```bash
mlld publish my-module.mld
```

The publish command:
1. Validates module metadata
2. Checks for clean git status (if applicable)
3. Creates a GitHub gist or uses repository URL
4. Opens a pull request to the mlld registry

### Publishing Options

#### Dry Run
Preview what would be published without making changes:
```bash
mlld publish my-module.mld --dry-run
```

#### Force Publishing
Publish with uncommitted changes (not recommended):
```bash
mlld publish my-module.mld --force
```

#### Organization Publishing
Publish on behalf of an organization:
```bash
mlld publish my-module.mld --org my-org
```

#### Custom PR Message
Add context to your registry pull request:
```bash
mlld publish my-module.mld --message "Initial release with text utilities"
```

#### Force Gist Creation
Use gist even in a git repository:
```bash
mlld publish my-module.mld --gist
```

### Publishing Methods

#### Git-Native Publishing (Preferred)

For modules in public GitHub repositories:
1. Commit your module file
2. Push to GitHub
3. Run `mlld publish`

Benefits:
- Immutable references via commit SHA
- Version history through git
- Easier collaboration

Example:
```bash
git add my-utils.mld
git commit -m "Add text utility functions"
git push origin main
mlld publish my-utils.mld
```

#### Gist Publishing

For standalone files or private repositories:
- Automatically creates a GitHub gist
- Useful for quick prototypes
- No git repository required

The CLI automatically chooses the appropriate method based on your context.

## Registry Management

### Search for Modules

Search the registry for modules:
```bash
mlld registry search text processing
```

Search specifically for MCP servers:
```bash
mlld registry search-servers filesystem
```

### Module Information

Get detailed information about a module:
```bash
mlld registry info @author/module

# Or use the shorter command:
mlld info @author/module
```

### Update Modules

Check for and install updates:
```bash
# Update all modules
mlld registry update

# Update specific module
mlld registry update @author/module
```

### Security Audit

Check installed modules for security advisories:
```bash
mlld registry audit
```

### Usage Statistics

View local module usage statistics:
```bash
mlld registry stats
```

## Module Installation

### Install Specific Modules

```bash
mlld install @author/module1 @author/module2
```

### Install from Lock File

```bash
mlld install
```

This reads `mlld.lock.json` and installs all listed modules.

### List Installed Modules

```bash
mlld ls
```

With detailed information:
```bash
mlld ls --verbose
```

Different output formats:
```bash
mlld ls --format json
mlld ls --format table
```

### Import in Your Code

Once installed, import modules in your mlld files:

```markdown
@import { trim, uppercase } from @author/text-utils

@text cleaned = @trim("  hello world  ")
@text shouting = @uppercase(@cleaned)
@add @shouting
```

## Best Practices

### Module Design

1. **Single Responsibility**: Each module should have a focused purpose
2. **Clear Naming**: Use descriptive function and variable names
3. **Documentation**: Include usage examples in your module
4. **No Side Effects**: Modules should be pure transformations

### Version Management

- Use git tags for semantic versioning
- Document breaking changes in commit messages
- Test thoroughly before publishing

### Security Considerations

1. **Review Dependencies**: Only import from trusted sources
2. **Validate Inputs**: Sanitize parameters in exec commands
3. **Avoid Secrets**: Never include API keys or passwords
4. **Use Lock Files**: Commit `mlld.lock.json` for reproducible builds

### Module Examples

#### Utility Module
```markdown
---
name: string-utils
description: Common string manipulation functions
author: myusername
---

@text trim(str) = @run [echo "{{str}}" | xargs]
@text repeat(str, n) = @run [printf "{{str}}%.0s" $(seq 1 {{n}})]
@text length(str) = @run [echo -n "{{str}}" | wc -c]
```

#### API Client Module
```markdown
---
name: github-api
description: Simple GitHub API client for mlld
author: myusername
keywords: [api, github, rest]
---

@exec get_user(username) = @run [
  curl -s "https://api.github.com/users/{{username}}"
]

@exec get_repos(username) = @run [
  curl -s "https://api.github.com/users/{{username}}/repos"
]
```

## Troubleshooting

### Common Issues

#### "Authentication required"
Run `mlld auth login` to authenticate with GitHub.

#### "Module not found in registry"
- Check the module name format: `@author/module`
- Ensure the module has been published and the PR merged
- Try `mlld registry search` to find similar modules

#### "Uncommitted changes detected"
- Commit your changes: `git add . && git commit -m "..."`
- Or use `--force` flag (not recommended)

#### "Invalid module metadata"
Ensure your module has required frontmatter:
```yaml
---
name: module-name
description: Module description
author: github-username
---
```

#### "Rate limit exceeded"
- Wait for GitHub API rate limit to reset
- Authenticate to increase rate limits

### Debug Mode

For detailed output during publishing:
```bash
mlld publish my-module.mld --verbose
```

### Getting Help

- **Documentation**: [mlld.org/docs](https://mlld.org/docs)
- **Issues**: [github.com/mlld-lang/mlld/issues](https://github.com/mlld-lang/mlld/issues)
- **Registry**: [github.com/mlld-lang/registry](https://github.com/mlld-lang/registry)

## Advanced Topics

### Private Registries

While the default registry is public, you can:
1. Fork the registry repository
2. Configure mlld to use your fork
3. Maintain your own module ecosystem

### Automated Publishing

Integrate publishing into CI/CD:
```yaml
# .github/workflows/publish.yml
name: Publish Module
on:
  release:
    types: [created]

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: npm install -g mlld
      - run: mlld auth login --token ${{ secrets.MLLD_TOKEN }}
      - run: mlld publish my-module.mld --message "Release ${{ github.event.release.tag_name }}"
```

### Module Testing

Before publishing, test your module:
```bash
# Create test file
echo '@import { * } from "./my-module.mld"

@text result = @my_function("test")
@add @result' > test.mld

# Run test
mlld test.mld
```

This ensures your module works as expected before sharing with others.