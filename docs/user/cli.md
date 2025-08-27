 mlld CLI Reference

The mlld CLI provides commands for processing mlld files, managing modules, and configuring your mlld environment.

## Installation

Install globally to use the CLI:

```bash
npm install -g mlld
```

Or use it from a local installation:

```bash
npm install mlld
npx mlld <command>
```

## Core Commands

### Processing mlld Files

Process a mlld file with default options:

```bash
mlld input.mld
```

**Options:**
- `--format, -f <format>` - Output format: `xml` (default), `md`
- `--output, -o <file>` - Output file path
- `--stdout` - Print to console instead of file
- `--watch, -w` - Watch for file changes
- `--verbose, -v` - Show detailed output
- `--debug` - Enable debug logging
- `--env <file>` - Load environment variables from specified file
- `--allow-absolute` - Permit file access outside project root

**Examples:**
```bash
# Process with markdown output
mlld document.mld --format md

# Output to specific file
mlld document.mld --output result.llm

# Print to console
mlld document.mld --stdout

# Watch mode for development
mlld document.mld --watch

# Load environment variables
mlld document.mld --env .env.local

# Allow absolute paths outside project
mlld script.mld --allow-absolute
```

## Module Commands

### `mlld init [module.mld.md]`

Create a new mlld module interactively.

```bash
# Interactive creation
mlld init

# Create specific module
mlld init utils.mld.md

# Non-interactive with metadata
mlld init --name utils --author alice --about "Utility functions"
```

**Options:**
- `-n, --name <name>` - Module name
- `-a, --author <author>` - Author name
- `-d, --about <description>` - Module description
- `-o, --output <path>` - Output file path
- `--version <version>` - Module version (default: 1.0.0)
- `-k, --keywords <keywords>` - Comma-separated keywords
- `--homepage <url>` - Homepage URL
- `--skip-git` - Skip git integration
- `-f, --force` - Overwrite existing files

### `mlld publish [module.mld.md]`

Publish a module to the registry or private repository.

```bash
# Publish to public registry
mlld publish my-module.mld.md

# Publish to private repository
mlld publish my-module.mld.md --private

# Preview what would be published
mlld publish --dry-run
```

**Options:**
- `--dry-run` - Preview without publishing
- `--message <msg>` - Custom PR message
- `--force` - Force publish with uncommitted changes
- `--gist` - Create gist even if in repository
- `--repo` - Use repository (skip interactive)
- `--org <name>` - Publish as organization
- `--private` - Publish to private repository
- `--path <dir>` - Custom directory for private modules
- `--pr` - Also create registry PR for private modules

### `mlld install [modules...]`

Install modules from the registry or lock file.

```bash
# Install specific modules
mlld install @alice/utils @bob/helpers

# Install from lock file
mlld install

# Force reinstall
mlld install @alice/utils --force
```

**Options:**
- `-v, --verbose` - Show detailed output
- `--no-cache` - Skip cache and re-download
- `--dry-run` - Preview without installing
- `-f, --force` - Force reinstall

### `mlld ls`

List installed modules and their status.

```bash
# Basic list
mlld ls

# Detailed table view
mlld ls --format table --verbose

# Check for missing modules
mlld ls --missing
```

**Options:**
- `-v, --verbose` - Show version hashes
- `--format <format>` - Output format: `list` (default), `table`, `json`
- `--missing` - Only show missing modules
- `--cached` - Only show cached modules

### `mlld info <module>`

Show detailed information about a module.

```bash
# Show module info
mlld info @alice/utils

# JSON output for scripts
mlld info @alice/utils --format json
```

**Options:**
- `-v, --verbose` - Include technical details
- `--format <format>` - Output format: `text` (default), `json`

### `mlld clean [modules...]`

Remove modules from lock file and cache to resolve import issues.

```bash
# Remove specific module from cache
mlld clean @mlld/env

# Clear all cached modules
mlld clean --all

# Clear only registry modules
mlld clean --registry
```

**Options:**
- `--all` - Clear all cached modules
- `--registry` - Clear only registry modules (preserve local modules)
- `-v, --verbose` - Show detailed output during cleaning

**Use Cases:**
- Fix stale cached module data preventing proper imports
- Clear corrupted module metadata after registry updates
- Force fresh resolution of modules with integrity issues
- Clean up cache when switching between development and production modules

### `mlld add-needs [module.mld.md]`

Analyze and update module dependencies automatically.

**Aliases:** `mlld needs`, `mlld deps`

```bash
# Analyze current directory
mlld add-needs

# Analyze specific module
mlld add-needs my-module.mld.md

# Show detailed analysis
mlld add-needs --verbose
```

**Options:**
- `--verbose` - Show detailed analysis
- `--auto` - Auto-detect mode (default)
- `--force` - Add frontmatter even if missing

## Development Commands

### `mlld test [patterns...]`

Run mlld test files (`.test.mld` files).

```bash
# Run all tests
mlld test

# Run tests matching pattern
mlld test array string

# Use custom environment file
mlld test --env .env.staging
```

**Features:**
- Automatically loads `.env` and `.env.test` files from current directory
- Runs tests in isolated processes when multiple files are executed
- Prevents environment variable pollution between test modules
- Shows test results with timing and pass/fail indicators

**Options:**
- `--env <file>` - Load environment variables from specific file

**Environment Loading:**
- If `--env` is specified: loads only that file
- Otherwise: automatically loads `.env` and `.env.test` if they exist
- Parent process environment variables are inherited

**Test Isolation:**
- Multiple test files run in separate processes automatically
- Prevents shadow environment contamination between tests
- Each test gets a clean environment state

## CI/CD and Ephemeral Execution

### `mlldx`

The ephemeral version of mlld for CI/CD and serverless environments. Uses in-memory caching instead of filesystem persistence.

```bash
# Run with in-memory cache
mlldx script.mld

# Load environment variables
mlldx script.mld --env prod.env

# Run without installation
npx mlldx@latest ci-task.mld
```

**Examples:**
```bash
# GitHub Actions
mlldx github-workflow.mld --env .env.ci

# Serverless functions
mlldx handler.mld --env .env.production

# Docker containers
docker run -it node:18 npx mlldx@latest /scripts/task.mld
```

**Key Differences from mlld:**
- No filesystem caching (all in-memory)
- Useful for stateless environments
- Same functionality, ephemeral execution
- Designed for CI pipelines and serverless

## Configuration Commands

### `mlld setup`

Interactive configuration wizard for mlld projects.

```bash
# Interactive setup wizard
mlld setup

# Set up GitHub modules
mlld setup --github

# Set up path aliases
mlld setup --local

# Check configuration
mlld setup --check
```

**Options:**
- `--github` - Set up GitHub private modules only
- `--local` - Set up path aliases only
- `--basic` - Create basic mlld.lock.json only
- `--force` - Overwrite existing configuration
- `--check` - Check current configuration status
- `--add-resolver` - Add a new resolver to existing config

**What it configures:**
1. GitHub private module access
2. Path aliases for local directories
3. Authentication setup
4. Repository verification

### `mlld alias`

Create path aliases for easy module imports.

```bash
# Create path alias (project-specific)
mlld alias --name shared --path ../shared-modules

# Create global alias (all projects)
mlld alias --name desktop --path ~/Desktop --global

# Use tilde expansion
mlld alias --name home --path ~/my-modules
```

**Options:**
- `-n, --name <alias>` - Alias name (required)
- `-p, --path <path>` - Directory path (required)
- `-g, --global` - Create global alias (default: local)

**Usage after creating:**
```mlld
/import {utils} from @shared/utils
/import {data} from @desktop/my-data
```

### `mlld auth`

Manage GitHub authentication for private modules.

```bash
# Login to GitHub
mlld auth login

# Check status
mlld auth status

# Logout
mlld auth logout
```

**Subcommands:**
- `login` - Authenticate with GitHub
- `logout` - Remove stored credentials
- `status` - Check authentication status

### `mlld env`

Manage environment variable permissions.

```bash
# Allow environment variables
mlld env allow GITHUB_TOKEN NODE_ENV API_KEY

# List allowed variables
mlld env list

# Remove access
mlld env remove API_KEY
```

**Subcommands:**
- `allow <vars...>` - Allow environment variables
- `list` - List allowed variables
- `remove <vars...>` - Remove variable access

**Usage in mlld:**
```mlld
/import {GITHUB_TOKEN, NODE_ENV} from @input
```

## Registry Commands

### `mlld registry`

Interact with the mlld module registry.

```bash
# Search for modules
mlld registry search json

# Check security
mlld registry audit

# Update modules
mlld registry update
```

**Subcommands:**
- `search <query>` - Search for modules
- `audit` - Check for security advisories
- `update` - Update modules
- `stats` - Show usage statistics

## Configuration Files

### mlld.lock.json

Project configuration and module lock file. Created by `mlld setup` or when installing modules.

**Location:** Project root

**Example:**
```json
{
  "version": "1.0",
  "config": {
    "resolvers": {
      "registries": [
        {
          "prefix": "@local/",
          "resolver": "LOCAL",
          "type": "input",
          "config": {
            "basePath": "./llm/modules"
          }
        },
        {
          "prefix": "@myorg/",
          "resolver": "GITHUB",
          "type": "input",
          "config": {
            "repository": "myorg/private-modules",
            "branch": "main",
            "basePath": "modules"
          }
        }
      ]
    }
  },
  "modules": {},
  "security": {
    "allowedEnv": ["NODE_ENV", "API_KEY"]
  }
}
```

### Global Configuration

**Location:** `~/.config/mlld/mlld.lock.json`

Used for global aliases and user-wide settings. Created by `mlld alias --global`.

## Environment Variables

### Built-in Variables

- `MLLD_TEST` - Enable test mode
- `LOG_LEVEL` - Set logging level
- `NO_COLOR` - Disable colored output

### Custom Variables

Must be allowed in mlld.lock.json:
```bash
mlld env allow MY_API_KEY
```

Then use in mlld files:
```mlld
/import {MY_API_KEY} from @input
```

## File Extensions

mlld supports several file extensions:

- `.mld` - Standard mlld files
- `.mld.md` - mlld files with Markdown (recommended for modules)
- `.mll` - Alternative extension
- `.mll.md` - Alternative Markdown extension

## Common Workflows

### Creating and Publishing a Module

```bash
# 1. Create module
mlld init my-utils.mld.md

# 2. Develop and test
mlld my-utils.mld.md

# 3. Add dependencies
mlld add-needs my-utils.mld.md

# 4. Publish
mlld publish my-utils.mld.md
```

### Setting Up Private Modules

```bash
# 1. Configure GitHub access
mlld auth login
mlld setup --github

# 2. Create path aliases
mlld alias --name local --path ./llm/modules

# 3. Publish privately
mlld publish my-module.mld.md --private
```

### Team Development

```bash
# 1. Clone project with mlld.lock.json
git clone myproject
cd myproject

# 2. Install modules
mlld install

# 3. Set up environment
mlld env allow GITHUB_TOKEN API_KEY

# 4. Run mlld files
mlld main.mld
```

## Troubleshooting

### Authentication Issues

```bash
# Check auth status
mlld auth status

# Re-authenticate
mlld auth logout
mlld auth login
```

### Module Not Found

```bash
# Check installed modules
mlld ls

# Reinstall missing modules
mlld install

# Check resolver configuration
mlld setup --check
```

### Permission Errors

```bash
# Check allowed environment variables
mlld env list

# Add required variables
mlld env allow NEEDED_VAR
```

## Exit Codes

- `0` - Success
- `1` - General error
- `2` - Invalid arguments
- `3` - File not found
- `4` - Authentication required
- `5` - Network error

## Getting Help

```bash
# General help
mlld --help

# Command-specific help
mlld publish --help
mlld setup --help
```
