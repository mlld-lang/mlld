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

Once installed, import modules in your `.mld.md` or `.mld` files:

```mlld
/import { formatDate, capitalize } from @alice/utils

/var @greeting = `Hello @capitalize("world")!`
/var @today = `Today is @formatDate(@NOW)`

/show @greeting
/show @today
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
2. **Content Fetch**: Downloads from GitHub gist
3. **Local Cache**: Stores in `~/.mlld/cache/` with SHA-256 hash
4. **Lock File**: Records exact versions in `mlld.lock.json`

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

### `mlld init [module-name.mld.md]`

Create a new mlld module file with interactive setup. Creates `.mld.md` files by default for better GitHub integration and documentation.

**Location-Aware Creation:**
If you have a local module directory configured (via `mlld setup --local`), the init command will prompt you to create the module there:
```
Create module in llm/modules? [Y/n] (Lets you /import @local/modulename)
```

This makes your module immediately available for import without additional configuration.

**Options:**
- `--name <name>`: Module name (skip interactive prompt)
- `--author <author>`: Author name  
- `--about <description>`: Module description
- `--output <path>`: Output file path
- `--version <version>`: Module version (default: 1.0.0)
- `--keywords <keywords>`: Comma-separated keywords
- `--homepage <url>`: Homepage URL
- `--skip-git`: Skip git integration
- `--force`: Overwrite existing files

**Examples:**

```bash
# Interactive creation (prompts for module name)
mlld init

# Create specific module interactively  
mlld init utils.mld.md

# Non-interactive with flags
mlld init --name utils --author alice --about "Utility functions" utils.mld.md

# Create with all metadata
mlld init --name http-client --author myorg --about "HTTP utilities" \
  --keywords "http,api,client" --homepage "https://github.com/myorg/http-client" \
  http-client.mld.md
```

**Output:**
```
=✨ Creating new mlld module...

Auto-detected repository: https://github.com/alice/my-project

Runtime dependencies:
  Dependencies will be auto-detected when you publish.
  For now, specify if you know you'll use external runtimes.
  Options: js, py, sh (comma-separated, or press Enter for none)
Needs []: js

Module export pattern:
  1. Structured interface (recommended for reusable modules)
  2. Simple module (for basic functionality)  
  3. Empty (I'll add content later)

Choice [1]: 1

✨ Module created: utils.mld.md

Next steps:
  1. Edit utils.mld.md to add your functionality
  2. Test with: mlld utils.mld.md
  3. Publish with: mlld publish utils.mld.md
```

### `mlld add-needs [module-path]`

Analyze module dependencies and update frontmatter automatically.

**Aliases:** `mlld needs`, `mlld deps`

**Options:**
- `--verbose`: Show detailed dependency analysis
- `--auto`: Auto-detect mode (default behavior)
- `--force`: Add frontmatter even if none exists

**Examples:**

```bash
# Analyze current directory
mlld add-needs

# Analyze specific module
mlld add-needs my-module.mld.md

# Add frontmatter to file without frontmatter
mlld add-needs --force basic-script.mld

# Verbose output showing detected dependencies
mlld add-needs --verbose utils.mld.md
```

**Output:**
```
🔍 Analyzing module dependencies...

Parsing module...
✅ Analysis complete

Detected runtime needs:
  needs: ["js", "sh"]

  needs-js:
    packages: ["axios", "lodash"]

  needs-sh:
    commands: ["curl", "grep", "awk"]

📝 Updating frontmatter...
✅ Updated utils.mld.md

Changes:
  needs: [] → ["js", "sh"]
```

### `mlld publish [module-path]`

Publish a module to the mlld registry with automatic metadata handling.

**Options:**
- `--dry-run`: Show what would be published without publishing
- `--message <msg>`: Custom pull request message
- `--force`: Force publish even with uncommitted changes
- `--gist`: Create a gist even if in git repository
- `--repo`: Use repository (skip interactive prompt)
- `--org <name>`: Publish on behalf of an organization

**Enhanced UX for Metadata Changes:**

The publish command now intelligently handles metadata updates:

```bash
mlld publish my-module.mld.md
```

**Output:**
```
🚀 Publishing mlld module...

📋 Checking module metadata...

The following metadata will be added to my-module.mld.md:
   • mlld-version: 1.0.0-rc-12
   • author: alice (auto-detected from git)
   • license: CC0 (required for all modules)
   • repo: https://github.com/alice/my-project (auto-detected)

⚠️  These changes need to be committed before publishing.
Choose an option:
  1. Commit and push changes, then publish
  2. Cancel and let me commit manually

Choice [1]: 1

📝 Committing metadata changes...
✅ Committed: Add mlld-version, author, license to my-module.mld.md
✅ Pushed to origin/main
🚀 Publishing to registry...
✅ Published @alice/my-module
```

This solves the common issue where publish would add metadata but then fail due to uncommitted changes.

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

### Path Resolution in Modules

When working with mlld modules, it's important to understand how relative paths are resolved:

**Relative paths in mlld modules are resolved relative to the module file itself**, not the current working directory or the location of `mlld.lock.json`.

This means:
- If your module is at `/projects/mymodule/utils.mld`
- And it contains `/import { config } from "./config.mld"`
- The path resolves to `/projects/mymodule/config.mld`

This behavior ensures modules are:
- **Portable**: Modules can be moved or installed anywhere without breaking their internal references
- **Self-contained**: All relative paths within a module are predictable and consistent
- **Independent**: Module functionality doesn't depend on where you run the `mlld` command from

**Example:**
```mlld
>> In file: /home/user/modules/string-utils.mld

>> This always resolves relative to string-utils.mld's location
/import { helpers } from "./lib/helpers.mld"  >> → /home/user/modules/lib/helpers.mld

>> Even if you run mlld from a different directory:
>> cd /tmp && mlld /home/user/modules/string-utils.mld
>> The import still resolves to /home/user/modules/lib/helpers.mld
```

This design makes modules reliable and reusable across different projects and execution contexts.

### The `.mld.md` Executable Documentation Format

mlld modules use the `.mld.md` file extension by default, enabling **executable documentation** - files that are simultaneously perfect GitHub markdown documentation and functional mlld modules. This innovative approach combines data, documentation, and code in one file.

#### `mlld-run` vs `mlld` Code Blocks

The key to executable documentation is understanding the difference between these two code block types:

- **`mlld-run` blocks**: Execute as mlld code when the file is processed
- **`mlld` blocks**: Documentation-only, rendered as syntax-highlighted code on GitHub

**Example `.mld.md` module:**

````markdown
# @alice/utils

Utility functions for text formatting and dates. Perfect for blogs, documentation, and data processing.

## tldr

```mlld-run
/import { formatDate, capitalize, greeting } from @alice/utils

/var @today = ::Today is {{formatDate(@NOW)}}::
/show @today
```

## export

```mlld-run
/exe @formatDate(dateStr) = ::{{dateStr | format("YYYY-MM-DD")}}::
/exe @capitalize(text) = ::{{text | title}}::
/exe @greeting(name) = ::Hello, {{capitalize(@name)}}!::

/var @module = {
  formatDate: @formatDate,
  capitalize: @capitalize,
  greeting: @greeting
}
```

## interface

### `formatDate(dateStr)`

Formats a date string to YYYY-MM-DD format.

```mlld
/var @myDate = ::{{formatDate("2024-01-15T10:30:00Z")}}::
/show @myDate
```

Output: `2024-01-15`

### `capitalize(text)`

Capitalizes the first letter of each word.

```mlld
/var @title = ::{{capitalize("hello world")}}::
/show @title
```

Output: `Hello World`

### `greeting(name)`

Creates a personalized greeting message.

```mlld
/var @welcome = ::{{greeting("Alice")}}::
/show @welcome
```

Output: `Hello, Alice!`
````

**When viewed on GitHub**, this renders as beautiful documentation with syntax highlighting. **When processed by mlld**, only the `mlld-run` blocks execute, making the functions available for import.

#### Benefits of Executable Documentation

1. **Single Source of Truth**: Documentation and code stay in sync because they're in the same file
2. **Perfect GitHub Integration**: Modules render beautifully on GitHub with proper syntax highlighting
3. **Live Examples**: Documentation examples can be actual working code that's tested
4. **Reduced Maintenance**: No need to maintain separate documentation and implementation files
5. **Better Discovery**: Modules are discoverable both as code repositories and as documentation

#### Best Practices for `.mld.md` Modules

- **Use `mlld-run` blocks for all executable code** (exports, internal functions, data definitions)
- **Use `mlld` blocks for documentation examples** that show usage but don't execute
- **Structure with standard sections**: `# @author/module`, `## tldr`, `## export`, `## interface`
- **Include working examples** in the `## tldr` section to show immediate value
- **Document each exported function** with usage examples and expected output
- **Keep the executable code clean** since it will be visible in the documentation

### Creating Modules

The easiest way to create a new module is with the `mlld init` command:

```bash
# Interactive creation (creates .mld.md by default)
mlld init

# Create specific module
mlld init utils.mld.md

# Non-interactive with metadata
mlld init --name utils --author alice --about "Utility functions" utils.mld.md
```

This creates a properly structured `.mld.md` file with:
- Frontmatter metadata
- Standard documentation sections (`# @author/module`, `## tldr`, `## export`, `## interface`)
- `mlld-run` blocks for executable code
- `mlld` blocks for documentation examples

You can also create modules manually by writing standard mlld code with frontmatter:

**alice-utils.mld.md:**
```mlld
---
name: utils
author: alice
about: Utility functions for text formatting and dates
version: 1.0.0
needs: []
license: CC0
mlld-version: 1.0.0-rc-12
---

/exe @formatDate(dateStr) = ::{{dateStr | format("YYYY-MM-DD")}}::

/exe @capitalize(text) = ::{{text | title}}::

/exe @greeting(name) = ::Hello, {{capitalize(@name)}}!::

>> Explicit module export - defines what's available to importers
/var @module = {
  formatDate: @formatDate,
  capitalize: @capitalize,
  greeting: @greeting
}
```

### Analyzing Dependencies

Use `mlld add-needs` to automatically detect and add runtime dependencies:

```bash
# Analyze and update dependencies
mlld add-needs utils.mld.md

# Force add frontmatter if missing
mlld add-needs --force legacy-script.mld

# See detailed analysis
mlld add-needs --verbose utils.mld.md
```

This automatically detects JavaScript packages, Python imports, shell commands, and other runtime dependencies in your module.

#### Module Export Patterns

mlld supports multiple export patterns to fit different module design needs:

##### 1. Explicit Module Export (`/var @module`)

The `/var @module = { ... }` pattern gives you complete control over exports:

```mlld
/exe @internal_helper(x) = run {echo "Internal: @x"}
/exe @get(url) = run {curl -s "@url"}
/exe @post(url, data) = run {curl -X POST -d '@data' "@url"}

/var @module = {
  get: @get,
  post: @post
  >> Note: internal_helper is not exported
}
```

**Import options:**
- `/import { get, post } from @user/api` - Direct function access
- `/import { * as api } from @user/api` - Namespace import: `api.get()`, `api.post()`

##### 2. Named Export Object Pattern

Create a named object alongside individual exports for maximum flexibility:

```mlld
/exe @get(url) = run {curl -s "@url"}
/exe @post(url, data) = run {curl -X POST -d '@data' "@url"}
/exe @delete(url) = run {curl -X DELETE "@url"}

>> Named export object
/var @http = {
  get: @get,
  post: @post,
  delete: @delete
}
>> This creates both individual exports AND the http object
```

**Import options:**
- `/import { http } from @user/http-client` - Use as `http.get()`, `http.post()`
- `/import { get, post } from @user/http-client` - Use functions directly
- `/import { * as client } from @user/http-client` - Access both: `client.http.get()` or `client.get()`

This pattern is ideal when you want to provide both:
- A convenient grouped interface (`http.get()`)
- Individual function exports for tree-shaking and direct use

##### 3. Nested Organization

Create logical groupings within your module:

```mlld
/exe @auth_login(user, pass) = run {...}
/exe @auth_logout(token) = run {...}
/exe @auth_refresh(token) = run {...}

/exe @api_get(endpoint) = run {...}
/exe @api_post(endpoint, data) = run {...}

/var @module = {
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

If no `/var @module` is defined, mlld automatically creates one with all top-level variables:

```mlld
>> Without explicit module export:
/var @hello = "world"
/exe @greet(name) = run {echo "Hello @name"}

>> Automatically generates:
>> module = {
>>   hello: @hello,
>>   greet: @greet
>> }
```

#### Module Metadata

Module frontmatter is always available via the `__meta__` property:

```mlld
/import { utils } from @alice/utils

>> Access metadata
/show ::Author: {{utils.__meta__.author}}::
/show ::Version: {{utils.__meta__.version}}::
```

### Publishing Modules

The `mlld publish` command handles the entire publishing workflow:

```bash
# Publish current module
mlld publish my-module.mld.md

# Dry run to see what would be published
mlld publish --dry-run my-module.mld.md

# Publish as organization
mlld publish --org mycompany my-module.mld.md
```

The publish command will:

1. **Validate module** - Check syntax, required fields, and dependencies
2. **Add metadata** - Automatically add mlld-version, license (CC0), and git info
3. **Handle git workflow** - Ask permission to commit changes and push
4. **Create pull request** - Submit to the mlld registry for review
5. **Provide status** - Show publication URL and next steps

**Publishing Process:**

The `mlld publish` command handles everything automatically:

1. **Validates** your module metadata and syntax
2. **Auto-detects** runtime dependencies (js, node, py, sh)
3. **Creates source** (uses git repository or creates gist)
4. **Submits PR** to the mlld registry for review

The registry uses a pull request workflow for quality and security.

### Module Standards

#### Naming Conventions
- Use `@username/module-name` format
- Module names should be lowercase with hyphens
- Usernames should match your GitHub username

#### Runtime Dependencies

Modules should declare their runtime requirements in the `needs` array:

- **`"js"`**: Browser-compatible JavaScript (no Node.js APIs)
- **`"node"`**: Node.js-specific JavaScript (uses fs, path, process, etc.)
- **`"py"`**: Python code execution
- **`"sh"`**: Shell commands or scripts

Example frontmatter with dependencies:
```yaml
---
name: file-utils
author: alice
about: File manipulation utilities
needs: ["node", "sh"]  # Uses Node.js fs module and shell commands
needs-node:
  node: ">=18.0.0"
  packages: ["glob", "fs-extra"]
needs-sh:
  commands: ["find", "grep"]
license: CC0
---
```

The `mlld add-needs` command can automatically detect and update these dependencies.

#### Code Structure
```mlld
---
name: utils
author: alice
version: 1.0.0
about: Utility functions for common tasks
needs: []
license: CC0
---

>> Internal helpers (not exported)
/var @_validateFormat(format) = ::...::

>> Public functions
/exe @formatDate(input, format) = ::...::
/exe @validateEmail(email) = ::...::
/exe @parseJSON(jsonStr) = ::...::

>> Module export - defines the public API
/var @module = {
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

**mlld.lock.json:**
```json
{
  "version": "1.0",
  "config": {
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
  },
  "modules": {},
  "cache": {}
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
/import { slugify, truncate } from @community/string-utils

/var @title = "My Blog Post Title!"
/var @slug = ::{{slugify(@title)}}::
/var @summary = ::{{truncate("This is a long description...", 50)}}::

>> Output
/show ::Slug: {{@slug}}::
/show ::Summary: {{@summary}}::
```

### Template System

**Install and use a template module:**

```bash
mlld install @templates/blog
```

```mlld
/import { postTemplate, authorBio } from @templates/blog

/var @post = {
  "title": "Introduction to mlld Modules",
  "author": "Alice Developer", 
  "date": "2024-01-15",
  "content": "Modules make code reusable..."
}

/show {{postTemplate(@post)}}
/show {{authorBio(@post.author)}}
```

### Development Workflow

**Complete module development workflow:**

```bash
# 1. Create a new module
mlld init my-utils.mld.md

# 2. Edit the module (add your functionality)
# ... edit my-utils.mld.md ...

# 3. Analyze and add dependencies
mlld add-needs my-utils.mld.md

# 4. Test the module locally
mlld my-utils.mld.md

# 5. Publish when ready
mlld publish my-utils.mld.md

# 6. Install in other projects
mlld install @alice/my-utils

# 7. Maintain and update
mlld registry update
mlld registry audit
```

**During development iteration:**

```bash
# Quick dependency re-analysis after code changes
mlld add-needs --verbose my-utils.mld.md

# Test before publishing
mlld publish --dry-run my-utils.mld.md

# Publish updates
mlld publish my-utils.mld.md
```

## Private Modules

mlld supports publishing and using modules from private GitHub repositories, enabling teams to share proprietary code without exposing it publicly.

### Publishing to Private Repositories

When you run `mlld publish` in a private repository where you have write access, mlld detects this and offers you a choice:

```bash
mlld publish my-module.mld.md

# Output:
⚠️  Repository is private but you have write access.

Options:
  [p]     Publish to private repository
  [g]     Create public gist instead
  [c]     Cancel

Your choice: p
```

#### Using the `--private` Flag

Skip the interactive prompt with the `--private` flag:

```bash
# Publish directly to private repo
mlld publish my-module.mld.md --private

# Publish to custom directory
mlld publish my-module.mld.md --private --path lib/mlld-modules

# Also create a registry PR for future public release
mlld publish my-module.mld.md --private --pr
```

#### How Private Publishing Works

1. **Module Storage**: Modules are stored in `mlld/modules/` by default (customize with `--path`)
2. **Manifest File**: A `manifest.json` is created/updated for module discovery
3. **Git Integration**: Changes are committed and pushed to your repository
4. **No Registry PR**: By default, no public registry PR is created (add `--pr` to create one)

Example manifest.json:
```json
{
  "@myteam/utils": {
    "path": "utils.mld.md",
    "version": "1.0.0",
    "about": "Internal utility functions",
    "author": "myteam",
    "needs": ["js"],
    "updatedAt": "2024-01-15T10:30:00.000Z"
  }
}
```

### Using Private Modules

Team members with repository access can import private modules using file paths:

```mlld
>> Import from same repository
/import { formatData } from "./mlld/modules/utils.mld.md"

>> Import from another private repository (must be cloned locally)
/import { validate } from "../other-private-repo/mlld/modules/validator.mld.md"

>> Import using relative paths from module location
/import { shared } from "../../shared/modules/common.mld.md"
```

### Private Module Workflows

#### Team Development

1. **Centralized Private Modules Repository**:
   ```bash
   # Create a dedicated private repo for team modules
   git clone git@github.com:myteam/mlld-modules-private.git
   cd mlld-modules-private
   
   # Publish modules to this repo
   mlld publish utils.mld.md --private
   mlld publish validators.mld.md --private
   ```

2. **Per-Project Private Modules**:
   ```bash
   # Within your project repository
   mlld publish src/modules/project-utils.mld.md --private --path src/mlld
   ```

#### Gradual Open-Sourcing

Use the `--pr` flag to prepare modules for eventual public release:

```bash
# Publish privately but also create a registry PR
mlld publish my-module.mld.md --private --pr
```

This creates:
- Private module in your repo (immediately usable by your team)
- Pull request to public registry (review and merge when ready)

### Authentication and Access

Private module access requires:
- Repository clone access (SSH keys or HTTPS credentials)
- File system access to the module files
- No additional mlld-specific authentication

### Limitations

1. **No Registry Discovery**: Private modules don't appear in `mlld search` or registry listings
2. **Manual Path Management**: Import paths must be maintained manually
3. **No Automatic Installation**: Team members must clone repositories containing private modules
4. **Version Management**: Updates require repository pulls, not `mlld install`

### Best Practices for Private Modules

1. **Consistent Structure**: Use a standard directory structure across projects
2. **Documentation**: Maintain a README listing available private modules
3. **Access Control**: Use GitHub's repository access controls
4. **Migration Path**: Plan for eventual open-sourcing with `--pr` flag
5. **Testing**: Set up CI/CD to test private modules automatically

## Custom Resolver Configuration

mlld 1.4+ introduces a resolver system that enables custom module resolution strategies beyond the default registry.

### Quick Setup with mlld Commands

The easiest way to configure resolvers is using the interactive setup commands:

#### Setting Up Directory Aliases

```bash
# Interactive setup for local directories
mlld setup --local

# Or create aliases directly
mlld alias --name shared --path ../shared-modules
mlld alias --name lib --path ./src/lib

# Global aliases (available to all projects)
mlld alias --name desktop --path ~/Desktop --global
```

#### Setting Up Private GitHub Modules

```bash
# Authenticate first
mlld auth login

# Interactive GitHub setup
mlld setup --github

# Or complete setup wizard
mlld setup
```

### Manual Configuration

You can also configure resolvers manually by editing `mlld.lock.json`:

#### Configuring Path Resolvers

Create custom path prefixes that map to specific directories in your project:

```json
// mlld.lock.json
{
  "version": "1.0",
  "config": {
    "resolvers": {
      "registries": [
        {
          "prefix": "@lib/",
          "resolver": "LOCAL",
          "type": "input",
          "config": {
            "basePath": "./src/lib"
          }
        },
        {
          "prefix": "@components/",
          "resolver": "LOCAL",
          "type": "input",
          "config": {
            "basePath": "./src/components/mlld"
          }
        },
        {
          "prefix": "@shared/",
          "resolver": "LOCAL",
          "type": "input", 
          "config": {
            "basePath": "../shared-modules"
          }
        }
      ]
    }
  },
  "modules": {},
  "cache": {}
}
```

Usage in your mlld files:
```mlld
>> Resolves to ./src/lib/string-utils.mld
/import { slugify, truncate } from @lib/string-utils

>> Resolves to ./src/components/mlld/header.mld
/import { renderHeader } from @components/header

>> Resolves to ../shared-modules/validators.mld
/import { validateEmail } from @shared/validators
```

### GitHub Resolver for Private Modules

Configure private GitHub repositories as module sources. Requires authentication via `mlld auth login`.

**Note:** The GitHub resolver uses secure token storage via keytar (system keychain) when available, with file-based fallback for environments without keychain access.

```json
// mlld.lock.json
{
  "version": "1.0",
  "config": {
    "resolvers": {
      "registries": [
        {
          "prefix": "@myorg/",
          "resolver": "GITHUB",
          "type": "input",
          "config": {
            "repository": "myorg/private-mlld-modules",
            "branch": "main",
            "basePath": "modules"
          }
        },
        {
          "prefix": "@partner/",
          "resolver": "GITHUB",
          "type": "input",
          "config": {
            "repository": "partner-org/shared-modules",
            "branch": "production",
            "basePath": "mlld"
          }
        }
      ]
    }
  },
  "modules": {},
  "cache": {}
}
```

Usage:
```mlld
>> Resolves to: https://github.com/myorg/private-mlld-modules/blob/main/modules/auth/jwt.mld
/import { generateToken, verifyToken } from @myorg/auth/jwt

>> Nested paths work naturally
/import { formatCurrency } from @myorg/utils/finance/currency

>> Import from partner organization
/import { processOrder } from @partner/ecommerce/orders
```

### HTTP Resolver for Remote Modules

Configure HTTP endpoints for module resolution:

```json
{
  "resolvers": {
    "registries": [
      {
        "prefix": "@cdn/",
        "resolver": "HTTP",
        "type": "input",
        "config": {
          "baseUrl": "https://cdn.example.com/mlld-modules",
          "headers": {
            "Authorization": "Bearer ${CDN_TOKEN}"
          },
          "cache": {
            "enabled": true,
            "ttl": 3600
          }
        }
      }
    ]
  }
}
```

### Resolver Priority

When multiple resolvers could handle a path, they're tried in order:

```json
{
  "resolvers": {
    "registries": [
      {
        "prefix": "@utils/",
        "resolver": "LOCAL",
        "type": "input",
        "priority": 1,  // Checked first
        "config": { "basePath": "./local-utils" }
      },
      {
        "prefix": "@utils/",
        "resolver": "GITHUB", 
        "type": "input",
        "priority": 2,  // Fallback if not found locally
        "config": { "repository": "myorg/utils" }
      }
    ]
  }
}
```

### Environment Variables in Configuration

Use environment variables for sensitive configuration:

```json
{
  "resolvers": {
    "registries": [
      {
        "prefix": "@private/",
        "resolver": "GITHUB",
        "type": "input",
        "config": {
          "repository": "${GITHUB_ORG}/${GITHUB_REPO}",
          "branch": "${GITHUB_BRANCH:-main}"  // Default to 'main'
        }
      }
    ]
  }
}
```

### Complete Example Configuration

Here's a comprehensive configuration showing multiple resolver types:

```json
// mlld.lock.json
{
  "version": "1.0",
  "config": {
    "resolvers": {
      "registries": [
        // Local development modules
        {
          "prefix": "@dev/",
          "resolver": "LOCAL",
          "type": "input",
          "config": {
            "basePath": "./dev-modules"
          }
      },
      // Team's private GitHub modules
      {
        "prefix": "@team/",
        "resolver": "GITHUB",
        "type": "input",
        "config": {
          "repository": "mycompany/mlld-modules-private",
          "branch": "main",
          "basePath": "modules"
        }
      },
      // Public CDN modules
      {
        "prefix": "@cdn/",
        "resolver": "HTTP",
        "type": "input",
        "config": {
          "baseUrl": "https://modules.example.com",
          "cache": {
            "enabled": true,
            "ttl": 86400  // 24 hours
          }
        }
      },
      // Default registry (no prefix needed)
      {
        "prefix": "@",
        "resolver": "REGISTRY",
        "type": "input",
        "config": {
          "registryUrl": "https://public.mlld.ai"
        }
      }
    ]
  }
}
```

## Best Practices

### For Module Users

1. **Lock File**: Always commit `mlld.lock.json` to version control
2. **Security**: Regularly run `mlld registry audit`
3. **Updates**: Use `mlld registry outdated` to check for updates
4. **Testing**: Test modules in isolation before using in production
5. **Resolver Configuration**: Keep resolver config in version control for team consistency

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

## Shadow Environments for JavaScript and Node.js

Shadow environments in mlld allow you to define reusable functions in mlld that can be called from JavaScript or Node.js code blocks. This creates a seamless bridge between mlld's declarative syntax and imperative programming.

### JavaScript Shadow Environment

The JavaScript shadow environment enables lightweight, synchronous function execution:

```mlld
>> Define mlld functions
/exe @add(a, b) = js {return @a + @b;}
/exe @multiply(x, y) = js {return @x * @y;}
/exe @calculate(n) = js {(
  const sum = add(@n, 10);
  const product = multiply(sum, 2);
  return product;
)}

>> Create shadow environment
/exe js = { add, multiply, calculate }

>> Use shadow functions in JavaScript
/var @result = run js {(
  // All shadow functions are available
  const r1 = add(5, 3);        // returns 8
  const r2 = multiply(4, 7);   // returns 28
  const r3 = calculate(5);     // returns 30: (5+10)*2
  
  return { r1, r2, r3 };
)}

/show @result
```

**Key features:**
- Functions execute in the same process (fast)
- Synchronous execution for simple operations
- Direct access to shadow functions by name
- Console output is captured automatically

### Node.js Shadow Environment

The Node.js shadow environment provides full Node.js API access with VM isolation:

```mlld
>> Define Node.js functions with full API access
/exe @readConfig(filename) = node {(
  const fs = require('fs');
  const path = require('path');
  
  const configPath = path.resolve(@filename);
  const content = fs.readFileSync(configPath, 'utf8');
  return JSON.parse(content);
)}

/exe @fetchData(url) = node {(
  const https = require('https');
  
  return new Promise((resolve, reject) => {
    https.get(@url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
)}

>> Create Node.js shadow environment
/exe node = { readConfig, fetchData }

>> Use in Node.js code blocks
/var @config = run node {(
  // Access Node.js APIs and shadow functions
  const config = await readConfig('./config.json');
  const apiData = await fetchData(config.apiUrl);
  
  return {
    ...config,
    apiData
  };
)}
```

**Key features:**
- Runs in isolated VM context for security
- Full access to Node.js built-in modules
- Async/await support throughout
- Functions can call each other within the environment

### When to Use Each Environment

**Use JavaScript shadow environment when:**
- Performing simple calculations or transformations
- Speed is critical (no VM overhead)
- You don't need Node.js-specific APIs
- Working with synchronous operations

**Use Node.js shadow environment when:**
- Accessing file system, network, or other Node.js APIs
- Better isolation is desired
- Working with async operations
- Using npm packages (with require)

### Implementation Details

**JavaScript Shadow Environment:**
- Executes in the current Node.js process
- Functions are created using `new Function()`
- Console output is intercepted and captured
- Parameters are merged with shadow functions in scope

**Node.js Shadow Environment:**
- Uses Node.js VM module for isolation
- Each mlld file gets its own VM context
- Includes standard Node.js globals (Buffer, process, require, etc.)
- Functions persist across executions in the same context

### Pipeline Format Support

When using JavaScript or Node.js functions in pipelines with the `format` option, functions receive a structured input object:

```mlld
/exe @processJSON(input) = js {(
  // With format: "json", input has these properties:
  // input.text - raw text
  // input.type - "json"
  // input.data - parsed JSON object (lazy-loaded)
  const users = @input.data;
  return users.map(u => u.name).join(', ');
)}

/var @names = @getData() with { format: "json", pipeline: [@processJSON] }
```

See [Pipeline Format Feature](pipeline.md#pipeline-format-feature) for complete details.

### Best Practices

1. **Use appropriate environment for the task:**
   - Simple math/string operations → JavaScript
   - File I/O, network requests → Node.js

2. **Keep shadow functions focused:**
   ```mlld
   >> Good: Single responsibility
   /exe @formatDate(date) = js {return new Date(@date).toISOString()}
   
   >> Avoid: Too many responsibilities
   /exe @doEverything(data) = js {/* complex logic */}
   ```

3. **Handle errors gracefully:**
   ```mlld
   /exe @safeDiv(a, b) = js {(
     if (@b === 0) return { error: "Division by zero" };
     return { result: @a / @b };
   )}
   ```

4. **Document shadow functions:**
   ```mlld
   >> Calculate compound interest
   >> @param principal - Initial amount
   >> @param rate - Annual interest rate (as decimal)
   >> @param time - Time period in years
   /exe @compound(principal, rate, time) = js {(
     return @principal * Math.pow(1 + @rate, @time);
   )}
   ```

## Future Considerations

The module system may be extended with additional features based on community needs and feedback. Potential areas for enhancement include improved search capabilities, update management, and better integration with development tools.

### Contributing

The mlld module system is open source. Contribute by:

- **Reporting Issues**: Submit bugs and feature requests
- **Writing Modules**: Create useful modules for the community
- **Documentation**: Improve guides and examples
- **Code**: Contribute to the registry and CLI tools

For more information, see the [Contributing Guide](../CONTRIBUTING.md).