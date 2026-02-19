# CLI Usage

The mlld CLI provides commands for processing mlld files, managing modules, and configuring your mlld environment.

## Installation

Install globally to use the CLI:

```bash
npm install -g mlld
mlld <command>
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
- `--debug` - Show execution progress to stderr
- `--debug --json` - Output full debug trace as JSON to stdout
- `--structured` - Output JSON with effects, exports, and security metadata
- `--no-stream` - Disable streaming output
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

# Debug mode: show progress on stderr, output to stdout
mlld script.mld --debug

# Debug with JSON: full trace as JSON to stdout
mlld script.mld --debug --json

# Structured output: effects and security metadata
mlld script.mld --structured

# Disable streaming (buffer all output)
mlld script.mld --no-stream
```

### Structured Output Mode

The `--structured` flag outputs JSON with effects, exports, state writes, and full security metadata:

```bash
mlld script.mld --structured
```

**Output format:**
```json
{
  "output": "Hello World\n",
  "effects": [
    {
      "type": "both",
      "content": "Hello World\n",
      "security": {
        "labels": [],
        "taint": [],
        "sources": []
      }
    }
  ],
  "exports": ["greeting"],
  "stateWrites": []
}
```

**Use cases:**
- Auditing: See what files were read/written
- Security analysis: Check taint labels on outputs
- Programmatic consumption: Parse effects in scripts
- CI/CD: Verify no unauthorized file access
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

### `mlld run [script-name]`

Execute mlld scripts from a configured directory with AST caching and performance metrics.

```bash
# List available scripts
mlld run

# Run a script
mlld run my-script

# Run with timeout
mlld run long-task --timeout 10m

# Show execution metrics
mlld run my-script --debug
```

**Options:**
- `--timeout <duration>` - Script timeout (e.g., 5m, 1h, 30s, or ms) - default: unlimited
- `--debug` - Show execution metrics (timing, cache hits, effects, state writes)
- `--checkpoint` - Enable checkpoint reuse for `llm`-labeled operations
- `--fresh` - Clear the script checkpoint cache before running
- `--resume [target]` - Resume with checkpoint reuse (`@fn`, `@fn:index`, `@fn("prefix")`)
- `--fork <script>` - Seed reads from another script's checkpoint cache
- `-h, --help` - Show help message

**Script Directory:**
Scripts are loaded from the directory configured in `mlld-config.json` (default: `llm/run/`). Configure with `mlld setup`.

**Features:**
- AST caching: Scripts are cached after first parse (mtime-based invalidation)
- Timeout support: Automatically aborts long-running scripts
- Metrics: Debug mode shows parse time, evaluation time, cache hits, effect counts
- `--resume` implies checkpoint behavior. Without a target, it re-runs with cache reuse only.
- `--fork` keeps source cache read-only; changed model/prompt arguments miss locally and are written to the current script cache.
- Payload injection: Unknown flags become `@payload` fields (`mlld run my-script --topic foo`). Import `@payload` in your script to access them.
  Known checkpoint flags (`--checkpoint`, `--fresh`, `--resume`, `--fork`) are excluded from `@payload`.

**Example script with payload** (`llm/run/build.mld`):
```mlld
import "@payload" as @payload
var @env = @payload.env ? @payload.env : "dev"
var @fast = @payload.fast ? @payload.fast : false
```

**Example script** (`llm/run/hello.mld`):
```mlld
var @greeting = "Hello from mlld script!"
show @greeting
```

### `mlld checkpoint <list|inspect|clean> <script>`

Inspect and manage checkpoint cache files for a script.

```bash
# List cached call keys/previews
mlld checkpoint list pipeline

# Inspect manifest + records as JSON
mlld checkpoint inspect pipeline

# Remove a script cache
mlld checkpoint clean pipeline

# Resume target forms
mlld run pipeline --resume
mlld run pipeline --resume @processFiles
mlld run pipeline --resume @processFiles:0
mlld run pipeline --resume '@processFiles("tests/cases/docs")'
```

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

### `mlld validate`

Detect common mistakes with static analysis before runtime.

```bash
mlld validate module.mld
mlld validate module.mld --error-on-warnings
mlld validate module.mld --format json
```

**Options:**
- `--error-on-warnings` - Exit 1 if any warnings are present
- `--format <format>` - Output format: `text` (default), `json`

**What it detects:**
- Undefined variables (typos like `@nmae` instead of `@name`)
- Variable redefinition in nested scopes (mlld variables are immutable)
- Reserved name conflicts (`@now`, `@base`, `@mx`, `@p`, `@env`, `@payload`, `@state`)
- Builtin shadowing (`@parse`, `@exists`, `@upper`, `@lower`, etc.)
- Exe parameter shadowing (generic names like `result`, `output`, `data` that risk collision)

**Suppressing warnings:**

Add to `mlld-config.json` to suppress intentional patterns:

```json
{
  "validate": {
    "suppressWarnings": ["exe-parameter-shadowing"]
  }
}
```

Suppressible codes: `exe-parameter-shadowing`, `mutable-state`, `when-exe-implicit-return`, `deprecated-json-transform`.

**Exit codes:**
- Exit 0: valid syntax, no errors
- Exit 1: parse errors or hard validation errors
- Exit 1 with `--error-on-warnings`: any warnings present

**JSON output** returns structured data: `executables`, `exports`, `imports`, `guards`, `needs`, `warnings`, `redefinitions`, `antiPatterns`.

### `mlld mcp-dev`

Start an MCP server that provides language introspection tools for development. Use with Claude Code or other MCP clients to validate syntax, analyze modules, and inspect ASTs.

```bash
mlld mcp-dev
```

Configure in `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "mlld-dev": {
      "command": "mlld",
      "args": ["mcp-dev"]
    }
  }
}
```

**Tools provided:**
- `mlld_validate` — Validate syntax, return errors and warnings
- `mlld_analyze` — Full module analysis: exports, executables, imports, guards, statistics
- `mlld_ast` — Get the raw parsed AST

All tools accept either `file` (path to `.mld` file) or `code` (inline string). Mode is inferred from file extension; override with `"mode": "strict"` or `"mode": "markdown"`.

### `mlld live --stdio`

Persistent NDJSON RPC server for long-running SDK operations.

```bash
mlld live --stdio
```

**Protocol format:**

```json
>> Request
{"method":"process","id":1,"params":{"script":"show 'hello'"}}

>> Event stream (during execution)
{"event":{"id":1,"type":"stream:chunk","content":"hello"}}

>> Result
{"result":{"id":1,"output":"hello","exports":[]}}
```

**Methods:**
- `process` — Execute script text via `params.script`
- `execute` — Run file via `params.filepath` with optional payload/state/dynamicModules
- `analyze` — Static analysis via `params.filepath`
- `state:update` — Update in-flight `@state` for `params.requestId`
- `cancel` — Abort active request by id

**SDK integration:**

Go, Python, Rust, and Ruby SDKs maintain persistent `mlld live --stdio` subprocesses:

```python
handle = client.execute_async("./script.mld", payload)
handle.update_state("flag", True)  # In-flight state mutation
result = handle.wait()
```

**Lifecycle:**
- Server runs until stdin EOF, SIGINT, or SIGTERM
- Each request uses fresh interpreter environment
- AST caching persists across requests (mtime-based invalidation)

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
import { utils } from @shared/utils
import { data } from @desktop/my-data
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

### `mlld vars`

Manage environment variable permissions.

```bash
# Allow environment variables
mlld vars allow GITHUB_TOKEN NODE_ENV API_KEY

# List allowed variables
mlld vars list

# Remove access
mlld vars remove API_KEY
```

**Subcommands:**
- `allow <vars...>` - Allow environment variables
- `list` - List allowed variables
- `remove <vars...>` - Remove variable access

**Usage in mlld:**
```mlld
import { GITHUB_TOKEN, NODE_ENV } from @input
```

### `mlld plugin`

Install the mlld Claude Code plugin for orchestrator authoring skills, language server integration, and MCP dev tools.

```bash
mlld plugin install                  # Install for current user
mlld plugin install --scope project  # Install for current project only
mlld plugin status                   # Check if installed
mlld plugin uninstall                # Remove the plugin
mlld skill install                   # Install skills for codex, opencode, pi 
```

Requires the `claude` CLI to be installed. Restart Claude Code after installing to activate the plugin.

**What's included:**

| Component | Description |
|-----------|-------------|
| Orchestrator skill | Patterns for audit, research, and development pipelines |
| Agent skill | Tool agents, event-driven agents, workflow agents |
| `/mlld:scaffold` | Generate starter orchestrator projects |
| Language server | `.mld` syntax highlighting and diagnostics |
| MCP dev tools | `mlld mcp-dev` for development |


## Environment Commands

### `mlld env`

Manage AI agent environment modules. Environments package credentials, configuration, MCP tools, and security policies for spawning AI agents.

```bash
# List available environments
mlld env list

# Create environment from Claude config
mlld env capture my-claude

# Run agent with prompt
mlld env spawn my-claude -- "Fix the bug"

# Start interactive session
mlld env shell my-claude
```

#### `mlld env list`

List available environment modules.

**Aliases:** `mlld env ls`

```bash
# Human-readable list
mlld env list

# JSON output for scripts
mlld env list --json
```

Shows environments from:
- `.mlld/env/` (project-local)
- `~/.mlld/env/` (global)

**Options:**
- `--json` - Output as JSON

#### `mlld env capture <name>`

Create an environment module from your current Claude configuration.

```bash
# Create project-local environment
mlld env capture my-claude

# Create global environment
mlld env capture my-claude --global
```

**What it does:**
1. Extracts OAuth token from `~/.claude/.credentials.json`
2. Stores token securely in macOS Keychain
3. Copies `settings.json`, `CLAUDE.md`, `hooks.json`
4. Generates `module.yml` and `index.mld`

**Options:**
- `--global` - Create in `~/.mlld/env/` instead of `.mlld/env/`

**Output structure:**
```
.mlld/env/my-claude/
├── module.yml          # Module manifest (type: environment)
├── index.mld           # Entry point with @spawn, @shell exports
└── .claude/            # Copied config files
    ├── settings.json
    ├── CLAUDE.md
    └── hooks.json
```

#### `mlld env spawn <name> -- <prompt>`

Run an agent with a prompt using the environment's credentials and configuration.

```bash
# Basic usage
mlld env spawn my-claude -- "Fix the authentication bug"

# Equivalent to running claude -p with the environment's config
mlld env spawn my-claude -- claude -p "Refactor the tests"
```

The environment module's `@spawn` export is invoked with the prompt. Credentials are injected from the keychain.

#### `mlld env shell <name>`

Start an interactive agent session.

```bash
mlld env shell my-claude
```

Invokes the environment module's `@shell` export, which typically starts an interactive Claude session with the captured configuration.

#### Environment Module Structure

Environment modules use `type: environment` in their manifest:

```yaml
# module.yml
name: my-claude
type: environment
about: "Development Claude environment"
version: 1.0.0
entry: index.mld
```

Required exports:
- `@spawn(prompt)` - Run agent with prompt
- `@shell()` - Start interactive session

Optional exports:
- `@mcpConfig()` - Return MCP server configuration

**Example index.mld:**
```mlld
/needs { cmd: [claude] }
/policy @env = {
  auth: {
    claude: { from: "keychain:mlld-env/my-claude", as: "CLAUDE_CODE_OAUTH_TOKEN" }
  }
}

/exe @spawn(prompt) = run { \
  CLAUDE_CONFIG_DIR=@fm.dir/.claude \
  claude -p @prompt
} using auth:claude

/exe @shell() = run { \
  CLAUDE_CONFIG_DIR=@fm.dir/.claude \
  claude
} using auth:claude

/export { @spawn, @shell }
```

#### Security

- Tokens are stored in the system keychain (macOS Keychain or libsecret via secret-tool), not in files
- Credentials are injected at runtime via `using auth:*` syntax
- Config files (settings, hooks) are copied, not credentials

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

mlld uses two configuration files:
- `mlld-config.json` — Your project settings (edit manually)
- `mlld-lock.json` — Auto-generated locks (do not edit)

### mlld-config.json

Your project settings. Edit manually to configure resolvers, validation options, and script directories.

**Location:** Project root

**Example:**
```json
{
  "resolvers": {
    "prefixes": [
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
  },
  "validate": {
    "suppressWarnings": ["exe-parameter-shadowing"]
  }
}
```

### mlld-lock.json

Auto-generated lock file. Do not edit manually. Created by `mlld setup` or when installing modules.

**Location:** Project root

**Example:**
```json
{
  "modules": {},
  "security": {
    "allowedEnv": ["MLLD_NODE_ENV", "MLLD_API_KEY"]
  }
}
```

### Global Configuration

**Location:** `~/.config/mlld/mlld-config.json`

Used for global aliases and user-wide settings. Created by `mlld alias --global`.

## Environment Variables

### Built-in Variables

- `MLLD_TEST` - Enable test mode
- `LOG_LEVEL` - Set logging level
- `NO_COLOR` - Disable colored output

### Custom Variables

All custom environment variables must be prefixed with `MLLD_`. Allow them in `mlld-lock.json`:
```bash
mlld vars allow MY_API_KEY
```

Then use in mlld files:
```mlld
import { MY_API_KEY } from @input
```

## File Extensions

mlld supports several file extensions:

- `.mld` - Standard mlld files
- `.mld.md` - mlld files with Markdown (recommended for modules)
- `.mlld` - Alternative extension
- `.mlld.md` - Alternative Markdown extension

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
mlld vars allow GITHUB_TOKEN API_KEY

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
mlld vars list

# Add required variables
mlld vars allow NEEDED_VAR
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
