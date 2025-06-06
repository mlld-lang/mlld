---
layout: docs.njk
title: "mlld Module System"
---

# mlld Module System

The mlld module system allows you to share and reuse mlld code across projects. Modules are distributed through a decentralized registry system that uses DNS for discovery and GitHub gists for storage.

## Quick Start

### Installing Modules

Install a module from the public registry:

```bash
mlld install @alice/utils
```

Install multiple modules:

```bash
mlld install @alice/utils @bob/helpers @charlie/formatting
```

Install all modules from a lock file:

```bash
mlld install
```

### Using Modules

Once installed, import modules in your `.mlld` files:

```mlld
@import { formatDate, capitalize } from @alice/utils

@text greeting = [[Hello {{capitalize("world")}}!]]
@text today = [[Today is {{formatDate(@TIME)}}]]

@add @greeting
@add @today
```

### Listing Modules

See what modules are installed:

```bash
mlld ls
```

View detailed information:

```bash
mlld ls --verbose --format table
```

### Module Information

Get detailed information about a module:

```bash
mlld info @alice/utils
```

## Module System Architecture

### Registry Discovery

The mlld module system uses DNS TXT records for module discovery:

1. **Module Reference**: `@username/module` 
2. **DNS Lookup**: `_mlld.username.public.mlld.ai`
3. **TXT Record**: Contains metadata and gist information
4. **Content Fetch**: Downloads from GitHub gist
5. **Local Cache**: Stores in `~/.mlld/cache/` with SHA-256 hash
6. **Lock File**: Records exact versions in `mlld.lock.json`

### Cache System

Modules are cached locally for performance:

```
~/.mlld/
├── cache/
│   ├── ab/
│   │   └── cdef123.../  # SHA-256 content hash
│   └── xy/
│       └── z789abc.../
└── mlld.lock.json       # Version lock file
```

### Lock File Format

The lock file ensures reproducible builds:

```json
{
  "version": "1.0.0",
  "imports": {
    "mlld://alice/utils": {
      "resolved": "https://gist.githubusercontent.com/alice/abc123/raw/...",
      "gistRevision": "abc123def456",
      "integrity": "sha256:...",
      "approvedAt": "2024-01-15T10:30:00Z",
      "approvedBy": "developer"
    }
  }
}
```

## CLI Commands

### `mlld install [modules...]`

Install modules and update the lock file.

**Options:**
- `--verbose`, `-v`: Show detailed output
- `--no-cache`: Skip cache and re-download
- `--dry-run`: Show what would be installed without making changes
- `--force`, `-f`: Force reinstall even if already present

**Examples:**

```bash
# Install specific modules
mlld install @alice/utils @bob/helpers

# Install from lock file
mlld install

# Dry run to see what would happen
mlld install @alice/utils --dry-run --verbose

# Force reinstall
mlld install @alice/utils --force
```

**Output:**
```
⏳ Installing 2 modules...
✅ @alice/utils@abc123 (cached)
⏳ @bob/helpers - resolving...
⏳ @bob/helpers - fetching from GitHub...
✅ @bob/helpers@def456 (5.2kb)

2 modules installed (1 from cache)
Lock file updated: mlld.lock.json
```

### `mlld ls [options]`

List installed modules and their status.

**Options:**
- `--verbose`, `-v`: Show version hashes and detailed info
- `--format <format>`: Output format (`list`, `table`, `json`)
- `--missing`: Only show modules that are missing from cache
- `--cached`: Only show cached modules

**Examples:**

```bash
# Basic list
mlld ls

# Detailed table view
mlld ls --format table --verbose

# Show only missing modules
mlld ls --missing

# JSON output for scripts
mlld ls --format json
```

**Output:**
```
Modules in mlld.lock.json:
  @alice/utils      ✅ cached  5.2kb   (gist)
  @bob/helpers      ✅ cached  3.1kb   (gist)  
  @work/tools       ❌ missing  -      (local)

3 modules (2 cached, 1 missing)
Run 'mlld install' to fetch missing modules
```

### `mlld info <module>`

Show detailed information about a specific module.

**Options:**
- `--verbose`, `-v`: Include technical details
- `--format <format>`: Output format (`text`, `json`)

**Examples:**

```bash
# Show module information
mlld info @alice/utils

# JSON output
mlld info @alice/utils --format json

# Verbose technical details
mlld info @alice/utils --verbose
```

**Output:**
```
Module: alice/utils
Description: Utility functions for common tasks
Gist: https://gist.github.com/alice/abc123def456
Tags: utility, helper, formatting
Created: January 15, 2024

✅ Installed
  Version: abc123de
  Approved: January 15, 2024

⚠️  Security Advisories:
   medium: Function parseDate has known issue with edge cases
```

## Module Development

### Creating Modules

Create a module by writing standard mlld code with an explicit module export:

**alice-utils.mlld:**
```mlld
---
author: alice
description: Utility functions for text formatting and dates
version: 1.0.0
---

@text formatDate(dateStr) = [[{{dateStr | format("YYYY-MM-DD")}}]]

@text capitalize(text) = [[{{text | title}}]]

@text greeting(name) = [[Hello, {{capitalize(@name)}}!]]

# Explicit module export - defines what's available to importers
@data module = {
  formatDate: @formatDate,
  capitalize: @capitalize,
  greeting: @greeting
}
```

#### Module Export Patterns

mlld supports multiple export patterns to fit different module design needs:

##### 1. Explicit Module Export (`@data module`)

The `@data module = { ... }` pattern gives you complete control over exports:

```mlld
@exec internal_helper(x) = @run [echo "Internal: @x"]
@exec get(url) = @run [curl -s "@url"]
@exec post(url, data) = @run [curl -X POST -d '@data' "@url"]

@data module = {
  get: @get,
  post: @post
  # Note: internal_helper is not exported
}
```

**Import options:**
- `@import { get, post } from @user/api` - Direct function access
- `@import { * as api } from @user/api` - Namespace import: `api.get()`, `api.post()`

##### 2. Named Export Object Pattern

Create a named object alongside individual exports for maximum flexibility:

```mlld
@exec get(url) = @run [curl -s "@url"]
@exec post(url, data) = @run [curl -X POST -d '@data' "@url"]
@exec delete(url) = @run [curl -X DELETE "@url"]

# Named export object
@data http = {
  get: @get,
  post: @post,
  delete: @delete
}
# This creates both individual exports AND the http object
```

**Import options:**
- `@import { http } from @user/http-client` - Use as `http.get()`, `http.post()`
- `@import { get, post } from @user/http-client` - Use functions directly
- `@import { * as client } from @user/http-client` - Access both: `client.http.get()` or `client.get()`

This pattern is ideal when you want to provide both:
- A convenient grouped interface (`http.get()`)
- Individual function exports for tree-shaking and direct use

##### 3. Nested Organization

Create logical groupings within your module:

```mlld
@exec auth_login(user, pass) = @run [...]
@exec auth_logout(token) = @run [...]
@exec auth_refresh(token) = @run [...]

@exec api_get(endpoint) = @run [...]
@exec api_post(endpoint, data) = @run [...]

@data module = {
  auth: {
    login: @auth_login,
    logout: @auth_logout,
    refresh: @auth_refresh
  },
  api: {
    get: @api_get,
    post: @api_post
  }
}
```

**Usage:** `client.auth.login(user, pass)`, `client.api.get('/users')`

#### Automatic Module Generation

If no `@data module` is defined, mlld automatically creates one with all top-level variables:

```mlld
# Without explicit module export:
@text hello = "world"
@exec greet(name) = @run [echo "Hello @name"]

# Automatically generates:
# module = {
#   hello: @hello,
#   greet: @greet
# }
```

#### Module Metadata

Module frontmatter is always available via the `__meta__` property:

```mlld
@import { utils } from @alice/utils

# Access metadata
@add [[Author: {{utils.__meta__.author}}]]
@add [[Version: {{utils.__meta__.version}}]]
```

### Publishing Modules

1. **Create a GitHub Gist** with your module code
2. **Set up DNS TXT record** for discovery
3. **Register with mlld registry** (if using public registry)

**DNS TXT Record Format:**
```
_mlld.alice.public.mlld.ai  TXT  "gist=abc123def456;version=1.0.0;description=Utility functions"
```

### Module Standards

#### Naming Conventions
- Use `@username/module-name` format
- Module names should be lowercase with hyphens
- Usernames should match your GitHub username

#### Code Structure
```mlld
---
author: alice
version: 1.0.0
description: Utility functions for common tasks
license: MIT
---

# Internal helpers (not exported)
@text _validateFormat(format) = [[...]]

# Public functions
@text formatDate(input, format) = [[...]]
@text validateEmail(email) = [[...]]
@text parseJSON(jsonStr) = [[...]]

# Module export - defines the public API
@data module = {
  formatDate: @formatDate,
  validateEmail: @validateEmail,
  parseJSON: @parseJSON
}
```

#### Best Practices

1. **Clear Documentation**: Include usage examples in comments
2. **Error Handling**: Validate inputs and provide meaningful errors
3. **Performance**: Keep modules lightweight and focused
4. **Compatibility**: Test with different mlld versions
5. **Security**: Never include secrets or sensitive data

## Registry System

### Public Registry

The default public registry is `public.mlld.ai`:

- **Discovery**: DNS TXT records under `_mlld.username.public.mlld.ai`
- **Storage**: GitHub gists for module content
- **Search**: Module discovery and search capabilities
- **Security**: Advisory system for known issues

### Custom Registries

You can configure custom registries for private or organizational use:

**mlld.config.json:**
```json
{
  "registries": {
    "work": {
      "type": "dns",
      "domain": "modules.company.com",
      "priority": 1
    },
    "local": {
      "type": "filesystem", 
      "path": "./local-modules",
      "priority": 2
    }
  }
}
```

### Registry Commands

The `mlld registry` command provides additional registry management:

```bash
# Search for modules
mlld registry search json

# Check for security advisories
mlld registry audit

# Update modules
mlld registry update

# Show usage statistics
mlld registry stats
```

## Security

### Content Integrity

All modules are verified using SHA-256 hashes:

1. **Download**: Module content fetched from source
2. **Hash**: SHA-256 calculated and compared to lock file
3. **Cache**: Only verified content is cached locally
4. **Execution**: Only trusted content is executed

### Advisory System

The registry includes a security advisory system:

- **Known Issues**: Database of known security issues
- **Automatic Checks**: `mlld registry audit` checks for advisories
- **Risk Levels**: high, medium, low severity ratings
- **Mitigation**: Guidance on fixing or avoiding issues

### Trust Model

The mlld module system uses explicit trust:

1. **First Use**: Manual approval required for new modules
2. **Lock File**: Exact versions recorded and verified
3. **User Control**: Users control what gets installed
4. **Transparency**: All sources and hashes are visible

## Troubleshooting

### Common Issues

#### Module Not Found
```bash
mlld install @alice/typo
# Error: Module not found: @alice/typo
# 
# Did you mean one of these?
#   @alice/utils
#   @alice/helpers
# 
# Search for more: mlld registry search alice
```

**Solution**: Check spelling and search for similar modules.

#### Network Issues
```bash
mlld install @alice/utils
# Error: Failed to fetch @alice/utils
# Network timeout while fetching from GitHub.
```

**Solutions**:
- Check internet connection
- Try again later (might be temporary)
- Use cached version if available

#### Cache Issues
```bash
mlld ls
# @alice/utils  ❌ missing  -  (gist)
```

**Solution**: Reinstall the module:
```bash
mlld install @alice/utils
```

#### Permission Issues
```bash
mlld install @alice/utils
# Error: Permission denied writing to cache
```

**Solution**: Check cache directory permissions:
```bash
chmod 755 ~/.mlld/cache
```

### Debug Mode

Use `--verbose` for detailed information:

```bash
mlld install @alice/utils --verbose
# ⏳ Installing 1 module...
# ℹ️  Checking cache for @alice/utils
# ℹ️  Cache miss - resolving via DNS
# ℹ️  Found DNS record: gist=abc123;version=1.0.0
# ℹ️  Fetching from https://gist.github.com/alice/abc123
# ℹ️  Content verified: sha256:def456...
# ℹ️  Cached to ~/.mlld/cache/ab/cdef123...
# ✅ @alice/utils@abc123 (5.2kb)
```

### Cache Management

Clear cache if needed:

```bash
# Remove all cached modules
rm -rf ~/.mlld/cache

# Remove specific module cache
rm -rf ~/.mlld/cache/ab/cdef123*
```

## Examples

### Basic Usage

**Install and use a utility module:**

```bash
mlld install @community/string-utils
```

```mlld
@import { slugify, truncate } from @community/string-utils

@text title = "My Blog Post Title!"
@text slug = [[{{slugify(@title)}}]]
@text summary = [[{{truncate("This is a long description...", 50)}}]]

# Output
@add [[Slug: {{@slug}}]]
@add [[Summary: {{@summary}}]]
```

### Template System

**Install and use a template module:**

```bash
mlld install @templates/blog
```

```mlld
@import { postTemplate, authorBio } from @templates/blog

@data post = {
  "title": "Introduction to mlld Modules",
  "author": "Alice Developer", 
  "date": "2024-01-15",
  "content": "Modules make code reusable..."
}

@add {{postTemplate(@post)}}
@add {{authorBio(@post.author)}}
```

### Development Workflow

**Working with local and published modules:**

```bash
# During development
mlld install file:./my-module.mlld

# Publish to gist and install
mlld install @alice/my-module

# Update all modules
mlld registry update

# Check for issues
mlld registry audit
```

## Best Practices

### For Module Users

1. **Lock File**: Always commit `mlld.lock.json` to version control
2. **Security**: Regularly run `mlld registry audit`
3. **Updates**: Use `mlld registry outdated` to check for updates
4. **Testing**: Test modules in isolation before using in production

### For Module Authors

1. **Versioning**: Use semantic versioning for module releases
2. **Documentation**: Include clear usage examples
3. **Testing**: Test modules with different inputs
4. **Security**: Never include secrets or credentials
5. **Maintenance**: Respond to security advisories promptly

### For Organizations

1. **Private Registry**: Set up custom registry for internal modules
2. **Policies**: Establish module approval processes
3. **Auditing**: Regular security audits of used modules
4. **Training**: Educate developers on module best practices

## Future Considerations

The module system may be extended with additional features based on community needs and feedback. Potential areas for enhancement include improved search capabilities, update management, and better integration with development tools.

### Contributing

The mlld module system is open source. Contribute by:

- **Reporting Issues**: Submit bugs and feature requests
- **Writing Modules**: Create useful modules for the community
- **Documentation**: Improve guides and examples
- **Code**: Contribute to the registry and CLI tools

For more information, see the [Contributing Guide](../CONTRIBUTING.md).