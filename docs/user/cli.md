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
- `--format, -f <format>` - Output format: `md` (default), `xml`
- `--output, -o <file>` - Output file path
- `--stdout` - Print to console instead of file
- `--watch, -w` - Watch for file changes
- `--verbose, -v` - Show detailed output
- `--debug` - Show execution progress to stderr
- `--debug --json` - Output full debug trace as JSON to stdout
- `--structured` - Output JSON with effects, exports, and security metadata
- `--no-stream` - Disable streaming output
- `--mlld-env <file|KEY=VALUE,...>` - Load environment variables from a file or inline overrides
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
mlld document.mld --mlld-env .env.local

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

### `mlld module [output]` (alias: `mlld mod`)

Create a new mlld module interactively or with flags.

```bash
# Interactive creation
mlld module

# Create specific module file
mlld module utils.mld.md

# Non-interactive with metadata
mlld module --name utils --author alice --about "Utility functions"

# Create a skill module
mlld module --type skill --name my-skill

# Create in a resolver path
mlld module -o @local/my-utils
```

**Options:**
- `-n, --name <name>` - Module name
- `-a, --author <author>` - Author name
- `-d, --about <description>` - Module description
- `-o, --output <path>` - Output file path (supports `@resolver/name` syntax)
- `--version <version>` - Module version (default: 1.0.0)
- `-k, --keywords <keywords>` - Comma-separated keywords
- `--homepage <url>` - Homepage URL
- `--type <type>` - Module type: `library`, `app`, `command`, `skill`, `environment` (aliases: `lib`, `env`)
- `--global` - Create as a global module
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
  Known checkpoint flags (`--checkpoint`, `--fresh`, `--resume`, `--fork`) and `--mlld-env` are excluded from `@payload`.
  `--env` is available for payload data (for example, `@payload.env`).

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

`mlld test --env` is command-specific. For other commands, use `--mlld-env`.

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

Suppressible codes: `exe-parameter-shadowing`, `deprecated-json-transform`, `hyphenated-identifier-in-template`.

**Exit codes:**
- Exit 0: valid syntax, no errors
- Exit 1: parse errors or hard validation errors
- Exit 1 with `--error-on-warnings`: any warnings present

**JSON output** returns structured data: `executables`, `exports`, `imports`, `guards`, `needs`, `warnings`, `redefinitions`, `antiPatterns`.

### `mlld status`

Inspect filesystem signature state for files tracked by `.sig/` and `policy.filesystem_integrity`.

```bash
mlld status
mlld status --glob 'docs/*.txt'
mlld status --taint
mlld status --json
```

**Options:**
- `--glob <pattern>` - Filter the report to matching paths
- `--taint` - Show taint labels restored from file signature metadata
- `--json` - Emit machine-readable status objects

Each entry reports the relative path, verification status (`verified`, `modified`, `unsigned`, `corrupted`), signer identity, and any signer-derived labels.

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
{"method":"process","id":1,"params":{"script":"show 'hello'","eventMode":"all","recordEffects":true}}

>> Event stream (during execution)
{"event":{"id":1,"type":"stream:chunk","content":"hello"}}

>> Result
{"result":{"id":1,"output":"hello","exports":[]}}
```

**Methods:**
- `process` — Execute script text via `params.script`
- `execute` — Run file via `params.filepath` with optional payload/state/dynamicModules
- `analyze` — Static analysis via `params.filepath`
- `fs:status` — Return filesystem signature status for an optional `glob` and `basePath`
- `state:update` — Update in-flight `@state` for `params.requestId`
- `cancel` — Abort active request by id

By default, streamed requests only emit `state:write` and `guard_denial` events. Set `eventMode: "all"` to receive the full event stream, including command and streaming events like `stream:chunk`. Set `recordEffects: true` to include `effects` in the final structured result. Wrapper SDKs enable `recordEffects` automatically.

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
mlldx script.mld --mlld-env prod.env

# Run without installation
npx mlldx@latest ci-task.mld
```

**Examples:**
```bash
# GitHub Actions
mlldx github-workflow.mld --mlld-env .env.ci

# Serverless functions
mlldx handler.mld --mlld-env .env.production

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

### `mlld init`

Initialize a new mlld project. Creates `mlld-config.json` with sensible defaults.

```bash
# Initialize project in current directory
mlld init

# Override default script directory
mlld init --script-dir scripts/

# Override default local module path
mlld init --local-path ./modules

# Force overwrite existing config
mlld init --force
```

**Options:**
- `--script-dir <path>` - Script directory (default: `llm/run`)
- `--local-path <path>` - Local module base path (default: `./llm/modules`)
- `-f, --force` - Overwrite existing `mlld-config.json`

For full interactive configuration, use `mlld setup`.

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
mlld skill install                   # Install built-in skills for all detected tools
mlld skill install @alice/my-helper  # Install a skill from the registry
mlld skill uninstall @alice/my-helper # Remove a registry skill
mlld skill status                    # Check installation state
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


## Box Commands

### `mlld box`

Manage AI agent box modules. Boxes are plain local modules generated from registry agent modules (`@mlld/agents/*`), plus your local auth/config context.

```bash
# List available boxes
mlld box list

# Create box from Claude config
mlld box capture my-claude

# Run agent with prompt
mlld box spawn my-claude -- "Fix the bug"

# Start interactive session
mlld box shell my-claude
```

#### `mlld box list`

List available box modules.

**Aliases:** `mlld box ls`

```bash
# Human-readable list
mlld box list

# JSON output for scripts
mlld box list --json
```

Shows boxes from:
- `.mlld/box/` (project-local)
- `~/.mlld/box/` (global)

**Options:**
- `--json` - Output as JSON

#### `mlld box capture <name>`

Create a box module from discovered local/global agent configuration.

```bash
# Create project-local box
mlld box capture my-claude

# Create global box
mlld box capture my-claude --global

# Force agent type
mlld box capture my-codex --codex
```

**What it does:**
1. Discovers agent type (`claude`/`codex`) from config dirs (or uses explicit flag)
2. Pulls registry module templates into `.mlld/box/<name>/agents/`
   - `@mlld/agents/base`
   - `@mlld/agents/<agent>`
3. Imports OAuth token from `.credentials.json` into keychain (`mlld-box/<name>`)
4. Copies local agent config files (settings/instructions/hooks/skills when present)
5. Generates inspectable `module.yml` and `index.mld`

**Options:**
- `--local` - Prefer project-local config dirs (`./.claude`, `./.codex`)
- `--global` - Create in `~/.mlld/box/` instead of `.mlld/box/`
- `--claude` - Force Claude module capture
- `--codex` - Force Codex module capture

**Output structure:**
```
.mlld/box/my-claude/
├── module.yml                 # Module manifest (type: environment)
├── index.mld                  # Local wrapper module
├── agents/
│   ├── base.mld               # Pulled @mlld/agents/base
│   └── claude.mld             # Pulled @mlld/agents/claude (or codex.mld)
└── .claude/                   # Copied local config files (if present)
    ├── settings.json
    ├── CLAUDE.md
    └── hooks.json
```

#### `mlld box spawn <name> -- <prompt>`

Run an agent with a prompt using the box's credentials and configuration.

```bash
# Basic usage
mlld box spawn my-claude -- "Fix the authentication bug"

# Equivalent to running claude -p with the box's config
mlld box spawn my-claude -- claude -p "Refactor the tests"
```

The box module's `@spawn` export is invoked with the prompt. Credentials are injected from the keychain.

#### `mlld box shell <name>`

Start an interactive agent session.

```bash
mlld box shell my-claude
```

Invokes the box module's `@shell` export, which typically starts an interactive Claude session with the captured configuration.

#### Box Module Structure

Box modules use `type: environment` in their manifest:

```yaml
# module.yml
name: my-claude
type: environment
about: "Development Claude box"
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
/import { @setup, @configureAuth as @agentConfigureAuth, @spawn as @agentSpawn, @shell as @agentShell, @mcpConfig } from "./agents/claude.mld"
/var @boxName = "my-claude"
/var @configDir = "@fm.dir/.claude"

/exe @configureAuth() = @agentConfigureAuth(@boxName)
/exe @spawn(prompt) = @agentSpawn(@boxName, @prompt, @configDir)
/exe @shell() = @agentShell(@boxName, @configDir)

/export { @setup, @configureAuth, @spawn, @shell, @mcpConfig }
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
mlld module my-utils.mld.md

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
- `1` - Error

## Getting Help

```bash
# General help
mlld --help

# Command-specific help
mlld publish --help
mlld setup --help
```
