export interface HelpContext {
  showExamples: boolean;
  verboseMode: boolean;
  commandPath: string[];
}

export class HelpSystem {
  
  displayHelp(command?: string, context?: HelpContext): void {
    if (command === 'auth') {
      this.displayAuthHelp();
      return;
    }
    
    if (command === 'publish') {
      this.displayPublishHelp();
      return;
    }
    
    if (command === 'init') {
      this.displayInitHelp();
      return;
    }
    
    if (command === 'registry') {
      this.displayRegistryHelp();
      return;
    }
    
    if (command === 'add-needs') {
      this.displayAddNeedsHelp();
      return;
    }
    
    if (command === 'box') {
      this.displayBoxHelp();
      return;
    }

    if (command === 'keychain') {
      this.displayKeychainHelp();
      return;
    }
    
    if (command === 'test') {
      this.displayTestHelp();
      return;
    }
    
    if (command === 'language-server' || command === 'lsp') {
      this.displayLanguageServerHelp();
      return;
    }
    
    if (command === 'dev') {
      this.displayDevHelp();
      return;
    }

    if (command === 'nvim-setup' || command === 'nvim') {
      this.displayNvimSetupHelp();
      return;
    }

    if (command === 'nvim-doctor') {
      this.displayNvimDoctorHelp();
      return;
    }

    if (command === 'mcp' || command === 'serve') {
      this.displayMcpHelp();
      return;
    }

    if (command === 'live') {
      this.displayLiveHelp();
      return;
    }

    if (command === 'mcp-dev') {
      this.displayMcpDevHelp();
      return;
    }

    if (command === 'docs') {
      this.displayDocsHelp();
      return;
    }

    if (command === 'validate' || command === 'analyze') {
      this.displayValidateHelp();
      return;
    }

    this.displayMainHelp(command, context);
  }

  private displayAuthHelp(): void {
    console.log(`
Usage: mlld auth <subcommand> [options]

Manage GitHub authentication for mlld registry.

Subcommands:
  login                Sign in with GitHub
  logout               Sign out
  status               Show authentication status

Options:
  -v, --verbose        Show detailed output

Examples:
  mlld auth login
  mlld auth status
  mlld auth logout
    `);
  }

  private displayDocsHelp(): void {
    console.log(`
Usage: mlld docs <@username/module>

Show documentation for a published mlld module.

Displays the module's # tldr section followed by its # docs section.
Module authors should include these sections in their module files.

Options:
  -v, --verbose        Show detailed output

Examples:
  mlld docs @adam/json-utils    # Show docs for @adam/json-utils
  mlld docs adam/json-utils     # @ prefix is optional

Related:
  mlld info @module             # Show module metadata + tldr
    `);
  }

  private displayValidateHelp(): void {
    console.log(`
Usage: mlld validate <filepath|directory> [options]

Validate mlld syntax and analyze module/template structure without executing.
Supports .mld, .mld.md, .att (@ templates), and .mtt (mustache templates).
When given a directory, recursively validates all mlld files.
Includes anti-pattern warnings such as generic exe parameter shadowing.
Intentional anti-pattern warnings can be suppressed in mlld-config.json via validate.suppressWarnings.

Options:
  --format <format>     Output format: json or text (default: text)
  --verbose             Show full details for all files (default: concise for directories)
  --deep                Follow imports/templates recursively (recommended for entry scripts)
  --context <paths>     Extra file(s)/dir(s) used to validate guard filters, ops, and args
  --ast                 Include the parsed AST in output (requires --format json)
  --no-check-variables  Skip undefined variable checking
  --error-on-warnings   Exit with code 1 if warnings are found
  -h, --help            Show this help message

Examples:
  mlld validate module.mld                     # Validate a module
  mlld validate template.att                   # Validate a template
  mlld validate ./my-project/                  # Validate all files recursively
  mlld validate ./my-project/ --verbose        # Full details for all files
  mlld validate llm/run/review/index.mld --deep
  mlld validate guards.mld --context tools.mld
  mlld validate guards.mld --context tools/,shared/tooling.mld
  mlld validate module.mld --format json       # JSON output
  mlld validate module.mld --error-on-warnings # Fail on warnings

Aliases:
  mlld analyze                                 # Same as validate
    `);
  }

  private displayMcpHelp(): void {
    console.log(`
Usage: mlld mcp [module-path] [options]

Expose exported mlld functions as MCP tools over stdio.

Options:
  --config <module.mld.md>    Load MCP config (exports @config { tools, env })
  --env KEY=VAL,KEY2=VAL2     Inject/override env vars (keys must start with MLLD_)
  --tools tool1,tool2         Explicit tool allow-list (overrides config)

Examples:
  mlld mcp                        # Uses llm/mcp/ when present
  mlld mcp llm/mcp/
  mlld mcp --config llm/agents/sandy.mld.md
  mlld mcp --tools github_readonly,thread_context

Behavior:
  - Discovers modules from files, directories, or glob patterns
  - Reads /export directives when present and falls back to all executables otherwise
  - Applies config module filtering and CLI allow-lists
  - Accepts environment overrides (MLLD_* only) before executing tools
  - Streams JSON-RPC responses to stdout for MCP clients
    `);
  }

  private displayLiveHelp(): void {
    console.log(`
Usage: mlld live --stdio

Start a long-running NDJSON RPC server over stdio.

Protocol:
  Request:  {"method":"process|execute|analyze|cancel","id":1,"params":{...}}
  Event:    {"event":{"id":1,"type":"stream:chunk",...}}
  Result:   {"result":{"id":1,...}}

Methods:
  process   Execute script text (params.script)
  execute   Run file (params.filepath + optional payload/state/dynamicModules)
  analyze   Static analysis only (params.filepath)
  cancel    Abort active request by id

Notes:
  - Each request runs with a fresh interpreter environment
  - Execute-path AST caching persists for process lifetime
  - Server exits on stdin EOF, SIGINT, or SIGTERM
    `);
  }

  private displayMcpDevHelp(): void {
    console.log(`
Usage: mlld mcp-dev

Start an MCP server with language introspection tools for development.

Tools provided:
  mlld_validate   Validate syntax, return errors/warnings
  mlld_analyze    Full module/template analysis (exports, executables, imports, guards)
  mlld_ast        Get parsed AST for debugging

Tool arguments:
  file            Path to .mld, .mld.md, .att, or .mtt file
  code            Inline mlld code (alternative to file)
  mode            Parsing mode: "strict" or "markdown"
  includeAst      Include AST in analyze response (boolean)

Configuration (claude_desktop_config.json):
  {
    "mcpServers": {
      "mlld-dev": {
        "command": "mlld",
        "args": ["mcp-dev"]
      }
    }
  }

Note: This is separate from 'mlld mcp' which serves user-defined tools.
    `);
  }

  private displayPublishHelp(): void {
    console.log(`
Usage: mlld publish [options] <module-path|@author/module>

Publish a module to the mlld registry.

Arguments:
  module-path          File path to module (e.g., ./my-module.mld)
  @author/module       Module reference (e.g., @adam/utils)

Options:
  -n, --dry-run        Show what would be published without actually publishing
  -m, --message <msg>  Add a custom message to the pull request
  -f, --force          Force publish even with uncommitted changes
  -g, --gist           Create a gist even if in a git repository
  --use-gist           Same as --gist
  -r, --repo           Use repository (skip interactive prompt)
  --use-repo           Same as --repo
  -o, --org <name>     Publish on behalf of an organization
  -p, --private        Publish to private repository (skip prompts)
  --pr                 Create registry PR for private publish
  --path <path>        Custom directory for private publish (default: mlld/modules/)
  --title <text>       Override module title (normalized into published module name)
  --description <text> Override module description/about
  --version <semver>   Override module version
  --tags <list>        Override tags/keywords (comma-separated)
  --author <name>      Override module author
  -v, --verbose        Show detailed output

Metadata precedence:
  - CLI metadata flags (e.g., --title, --description) override module frontmatter
  - Frontmatter acts as default metadata when CLI overrides are not provided

Git Integration:
  - Automatically detects git repositories
  - Checks if repository is public or private with write access
  - For private repos: offers choice between private publish or gist
  - Uses commit SHA for immutable references
  - Validates clean working tree (use --force to override)
  - Falls back to gist creation if no write access

Organization Publishing:
  - Use --org <name> to publish as an organization you're a member of
  - Or set 'author: org-name' in frontmatter (will verify membership)
  - Organizations cannot create gists - must use git repositories
  - Requires membership verification via GitHub API

Module Reference Publishing:
  - Use @author/module syntax to publish without specifying file path
  - Automatically finds the module file based on registry configuration
  - Selects the appropriate registry based on prefix and priority
  - Example: mlld publish @adam/utils finds and publishes utils module

Private Repository Publishing:
  - Automatically detected when you have write access to a private repo
  - Interactive prompt offers choice between private publish or gist
  - Use --private to skip prompts and publish directly to private repo
  - Modules stored in mlld/modules/ by default (customize with --path)
  - Creates local manifest.json for team discovery
  - Skip registry PR by default (add with --pr for future public release)

Examples:
  mlld publish @adam/utils        # Publish using module reference
  mlld publish @mlld/http         # Publish to public registry
  mlld publish                    # Publish from git repo or create gist
  mlld publish my-module.mld      # Publish specific file
  mlld publish ./modules/utils    # Publish from directory
  mlld publish --dry-run          # Test publish without creating PR
  mlld publish --force            # Publish with uncommitted changes
  mlld publish --use-gist         # Force gist creation
  mlld publish --org myorg        # Publish as organization 'myorg'
  mlld publish my-module.mld --title "My Utility" --tags utils,strings
  mlld publish --private          # Publish to private repo (skip prompts)
  mlld publish --private --pr     # Private publish + registry PR
  mlld publish --private --path lib/modules  # Custom directory
    `);
  }

  private displayInitHelp(): void {
    console.log(`
Usage: mlld init [options] [module-name.mld]

Create a new mlld module file.

Interactive Creation:
  mlld init                    Prompt for module name and create <name>.mld
  
Module Creation:
  mlld init my-module.mld      Create my-module.mld with interactive setup
  
Creates .mld file with YAML frontmatter (author, description, license).
These files contain mlld code and can be published to the registry.

Options:
  -n, --name <name>           Module name (skip interactive prompt)
  -a, --author <author>       Author name
  -d, --about <description>   Module description
  -o, --output <path>         Output file path
  --skip-git                  Skip git integration
  -f, --force                 Overwrite existing files

Examples:
  mlld init                   # Prompt for module name, create interactively
  mlld init utils.mld         # Create utils.mld interactively
  mlld init --name utils --about "Utility functions" utils.mld
    `);
  }

  private displayRegistryHelp(): void {
    console.log(`
Usage: mlld registry <subcommand> [options]

Manage mlld module registry.

Subcommands:
  install              Install all modules from lock file
  update [module]      Update module(s) to latest version
  audit                Check for security advisories
  search <query>       Search for modules
  info <module>        Show module details
  stats                Show local usage statistics
  outdated             Show outdated modules

Examples:
  mlld registry search json
  mlld registry info adamavenir/json-utils
  mlld registry update
  mlld registry audit
    `);
  }

  private displayAddNeedsHelp(): void {
    console.log(`
Usage: mlld add-needs [options] [module-path]

Analyze and update module runtime dependencies.

Analyzes your mlld module to detect runtime dependencies (js, py, sh) and
updates the frontmatter automatically.

Options:
  -v, --verbose               Show detailed output
  -a, --auto                  Auto-detect mode (default behavior)
  -f, --force                 Add frontmatter even if none exists

Examples:
  mlld add-needs              # Analyze current directory
  mlld add-needs my-module.mld # Analyze specific module
  mlld add-needs --force      # Add frontmatter if missing
  mlld add-needs --verbose    # Show detailed dependency analysis

Aliases:
  mlld needs                  # Short alias
  mlld deps                   # Alternative alias
    `);
  }

  private displayBoxHelp(): void {
    console.log(`
Usage: mlld box <subcommand> [options]

Manage AI agent boxes generated from registry agent modules.

Subcommands:
  list                    List available boxes
  capture <name>          Pull agent module + create local box
  spawn <name> -- <prompt>  Run agent with prompt
  shell <name>            Start interactive session

Examples:
  mlld box capture claude-dev
  mlld box capture project-env --local
  mlld box capture codex-env --codex
  mlld box list
  mlld box spawn claude-dev -- "Fix the bug in main.ts"
  mlld box shell claude-dev

Capture options:
  --local                 Read config from project directories first
  --claude                Force Claude capture
  --codex                 Force Codex capture
  --global                Store in ~/.mlld/box/ instead of .mlld/box/
    `);
  }

  private displayKeychainHelp(): void {
    console.log(`
Usage: mlld keychain <command> [options]

Manage project keychain entries under mlld-box-{projectname}.

Commands:
  add <name>               Add or update a keychain entry (prompts for value)
  add <name> --value <v>   Add or update with explicit value
  rm <name>                Remove a keychain entry
  list                     List entry names
  get <name>               Print entry value
  import <file.env>        Import entries from a .env file

Examples:
  mlld keychain add ANTHROPIC_API_KEY
  mlld keychain add ANTHROPIC_API_KEY --value sk-...
  mlld keychain list
  mlld keychain get ANTHROPIC_API_KEY
  mlld keychain import .env
    `);
  }

  private displayTestHelp(): void {
    console.log(`
Usage: mlld test [pattern...]

Run mlld tests.

Arguments:
  pattern    Test file patterns or paths (e.g., "array", "src/utils", "*.test.mld")

Test Discovery:
  - Finds all **/*.test.mld files by default
  - Use patterns to filter specific tests
  - Pattern matching is case-insensitive

Test Format:
  Tests are written in mlld files using @mlld/test assertions:
  
  /import { eq, ok, includes } from @mlld/test
  /var @result = @myFunction("input")
  /var @test_returns_correct_value = @eq(@result, "expected")
  /var @test_not_empty = @ok(@result)

Examples:
  mlld test                    # Run all tests
  mlld test array              # Run tests with "array" in the path
  mlld test src/utils          # Run tests in src/utils/
  mlld test parser.test.mld    # Run specific test file
    `);
  }

  private displayLanguageServerHelp(): void {
    console.log(`
Usage: mlld language-server

Start the mlld Language Server for editor integration.

The mlld language server implements the Language Server Protocol (LSP) to provide
intelligent features for mlld files in any LSP-compatible editor.

Features:
  - Syntax validation and error reporting
  - Autocomplete for directives, variables, and file paths
  - Hover information showing variable types and values
  - Go-to-definition for variables and imports
  - Import resolution and multi-file analysis
  - Real-time diagnostics as you type

Editor Integration:
  - VSCode: Install the mlld extension (editors/vscode)
  - Neovim: Configure LSP client to use 'mlld language-server'
  - Other editors: Configure your LSP client to run this command

Configuration:
  The language server can be configured through your editor's LSP settings:
  - mlldLanguageServer.maxNumberOfProblems: Maximum diagnostics per file
  - mlldLanguageServer.enableAutocomplete: Enable/disable completions
  - mlldLanguageServer.projectPath: Override project path detection

Note: This command requires the 'vscode-languageserver' package to be installed.
If not installed, run: npm install --save-dev vscode-languageserver

Examples:
  mlld language-server        # Start the language server
  mlld lsp                    # Short alias
    `);
  }

  private displayDevHelp(): void {
    console.log(`
Usage: mlld dev [subcommand]

Inspect local module discovery and status.

Subcommands:
  status               Show detected local modules and access status
  list                 List all local modules with their publish names

Local modules under llm/modules/ are loaded automatically when:
  • The module's author matches your authenticated GitHub user
  • You have a resolver prefix configured for that author (e.g., private modules)

Use '/import local { ... } from @author/module' to force a local read.
No flags or environment variables are required.

Examples:
  mlld dev                    # Show status
  mlld dev list               # List local modules
    `);
  }

  private displayMainHelp(command?: string, context?: HelpContext): void {
    console.log(`
Usage: mlld [command] [options] <input-file-or-url>
       mlld -e '<code>' [options]

Commands:
  init                    Create a new mlld module
  add-needs, needs, deps  Analyze and update module dependencies
  alias                   Create path aliases for module imports
  keychain                Manage project keychain entries
  dev                     Inspect local module discovery
  docs                    Show module documentation (# tldr + # docs)
  box                     Manage AI agent environments
  install, i              Install mlld modules
  update                  Update installed modules to latest versions
  outdated                List modules with available updates
  ls, list               List installed modules
  info, show             Show module details (includes # tldr)
  auth                    Manage GitHub authentication
  publish                 Publish module to mlld registry
  registry                Manage mlld module registry
  run                     Run mlld scripts from script directory
  checkpoint              Inspect and clean checkpoint caches
  verify                  Verify signed variables from MLLD_VERIFY_VARS
  setup                   Configure mlld project with interactive wizard
  test                    Run mlld tests
  serve                   Expose mlld functions as MCP tools over stdio
  live                    Start persistent NDJSON RPC server over stdio
  mcp-dev                 Start MCP server with language introspection tools
  language-server, lsp    Start the mlld language server for editor integration
  nvim-setup, nvim        Set up mlld Language Server for Neovim
  nvim-doctor             Diagnose and fix mlld Neovim LSP configuration
  validate, analyze       Validate mlld syntax and show module/template structure
Options:
  -f, --format <format>   Output format: md, markdown, xml, llm [default: llm]
  --mode <mode>           Parser mode: strict or markdown (default: .mld strict, .mld.md/.md markdown, stdin/eval strict)
  --loose, --markdown, --md
                          Set parser mode to markdown (aliases for --mode markdown)
  -e, --eval <code>       Execute inline mlld code
  -o, --output <path>     Output file path
  --stdout                Print to stdout instead of file
  --strict                Enable strict mode (fail on all errors)
  --permissive            Enable permissive mode (ignore recoverable errors) [default]
  --pretty                Enable markdown output formatting (legacy alias)
    --home-path <path>      Custom home path for ~/ substitution
  -v, --verbose           Enable verbose output (some additional info)
  -d, --debug             Stream execution with progress logs to stderr
  --json                  With --debug, emit DebugResult JSON to stdout (no streaming)
  --structured            Output JSON with effects, exports, and security metadata
  --timeout <duration>    Overall execution timeout (e.g., 5m, 1h, 30s)
  --mlld-heap <size>      Set child Node heap limit for mlld (e.g., 8192m, 8g)
  --heap-snapshot-near-limit <n>
                          Write V8 heap snapshots near heap limit
  --metrics               Show execution timing on stderr
  --trace <level>         Runtime effect tracing: off, effects, handle/handles, or verbose
  --trace-memory          Include memory samples in runtime trace output (implies --trace effects)
  --trace-file <path>     Write runtime trace events as JSONL
                          Ambient debug accessors: @mx.handles, @mx.llm.sessionId/display/resume,
                          @mx.shelf.readable/writable, @mx.policy.active
  --inject, --payload KEY=VALUE
                          Inject dynamic module (can use multiple times)
                          VALUE formats: JSON object, @file.json, or mlld source
  --state <value>         Inject JSON object data into @state (can use multiple times)
                          VALUE formats: @file.json, KEY=VALUE, or JSON object
  --no-stream             Disable streaming (document mode only)
  -w, --watch             Watch for changes and reprocess
  -h, --help              Display this help message
  -V, --version           Display version information

URL Support Options:
  --allow-urls            Enable URL support in directives
  --url-timeout <ms>      URL request timeout in milliseconds [default: 30000]
  --url-max-size <bytes>  Maximum URL response size [default: 5242880]
  --url-allowed-domains   Comma-separated list of allowed domains
  --url-blocked-domains   Comma-separated list of blocked domains

Output Management Options:
  --max-output-lines <n>  Limit command output to n lines [default: 50]
  --show-progress         Show command execution progress [default: true]
  --no-progress           Disable progress display
  --error-behavior <mode> How to handle command failures: halt, continue [default: continue]
  --collect-errors        Collect errors and display summary at end
  --show-command-context  Show source context for command execution errors
  --command-timeout <ms>  Command execution timeout in milliseconds [default: 30000]

Import Approval Options:
  --risky-approve-all     Automatically approve all imports (use with caution!)
  --yolo                  Same as --risky-approve-all (shorter alias)
  -y                      Same as --risky-approve-all (shortest alias)

Output Formatting Options:
  --no-normalize-blank-lines  Disable blank line normalization in output
  --no-format                 Disable markdown output normalization (preserve original spacing)

Security Options:
  --allow-absolute            Allow absolute paths outside project root (use with caution!)

Payload Injection:
  Unknown flags become @payload fields (always available, even when empty):
  mlld script.mld --topic foo         # @payload = {"topic":"foo"}
  mlld script.mld                     # @payload = {}
  Reserved checkpoint flags (--checkpoint, --new, --fresh, --no-checkpoint, --resume, --fork) are not added to @payload.

Examples:
  mlld script.mld                     # Run a local file
  mlld script.mld --stdout            # Output to stdout
  mlld script.mld -o output.md        # Output to file
  mlld -e 'show @now'                 # Execute inline code
  mlld -e 'var @x = "test" | @json; show @x'
  
  # Run scripts directly from URLs
  mlld https://example.com/script.mld
  npx mlld@latest https://raw.githubusercontent.com/mlld-lang/registry/main/llm/scripts/review-pr.mld

Configuration:
  mlld looks for configuration in:
  1. ~/.config/mlld/mlld-config.json (global/user config)
  2. mlld-config.json (project config)
  3. mlld-lock.json (project module lockfile)

  Config keys:
  - nodePackageManager: command to run after mlld install (e.g., npm, pnpm, yarn, bun, or "pnpm install")

  CLI options override configuration file settings.

New to mlld? Run 'mlld quickstart' for an introduction.
Built-in docs and examples available via 'mlld howto'.
  `);

  }

  getCommandHelp(command: string): string | null {
    // This method could be used for getting help content as strings
    // rather than directly outputting to console
    switch (command) {
      case 'auth':
      case 'publish':
      case 'init':
      case 'registry':
      case 'add-needs':
      case 'box':
      case 'dev':
      case 'live':
      case 'docs':
      case 'test':
      case 'language-server':
      case 'lsp':
      case 'validate':
      case 'analyze':
        return `Help available for ${command}`;
      default:
        return null;
    }
  }

  formatHelpContent(content: string, context?: HelpContext): string {
    // Future enhancement: format help content based on context
    return content;
  }

  private displayNvimSetupHelp(): void {
    console.log(`
Usage: mlld nvim-setup [options]

Set up mlld Language Server for Neovim.

This command automatically configures Neovim to use the mlld Language Server,
providing syntax highlighting, autocomplete, and error checking for .mld files.

Works with:
  - Vanilla Neovim
  - LazyVim
  - AstroNvim
  - LunarVim
  - Any Neovim distribution with nvim-lspconfig

Options:
  --force              Overwrite existing configuration
  --show-config        Display the configuration without installing

What it does:
  1. Detects your Neovim setup (LazyVim, vanilla, etc.)
  2. Creates the appropriate config file in the right location
  3. Checks for required dependencies (nvim-lspconfig)
  4. Verifies mlld is installed (or will use npx fallback)

After running:
  1. Restart Neovim
  2. Open a .mld file
  3. Run :LspInfo to verify mlld_ls is attached
  4. Run :MlldLspInfo to check mlld-specific status

Examples:
  mlld nvim-setup              # Auto-configure Neovim
  mlld nvim                    # Short alias
  mlld nvim-setup --force      # Overwrite existing config
  mlld nvim-setup --show-config # Just show the config

Manual Setup:
  If you prefer manual configuration, add this to your Neovim config:
  
  require('lspconfig').mlld_ls.setup{
    cmd = { 'mlld', 'lsp' }
  }
    `);
  }

  private displayNvimDoctorHelp(): void {
    console.log(`
Usage: mlld nvim-doctor [options]

Diagnose and fix mlld Neovim LSP configuration issues.

This command checks your Neovim setup and identifies common problems that prevent
the mlld Language Server from working correctly. It can also automatically fix
many issues.

Options:
  --fix, -f            Automatically fix detected issues

What it checks:
  1. mlld installation and version
  2. LSP server can start correctly
  3. Neovim config directory exists
  4. mlld LSP config file exists and is current
  5. Config uses correct file types (.mld vs .mlld)
  6. Config has required lspconfig.setup() call
  7. nvim-lspconfig is installed

Common issues it fixes:
  - Outdated config files (missing setup() call)
  - Wrong filetype mappings
  - Missing config version

Examples:
  mlld nvim-doctor                  # Check for issues
  mlld nvim-doctor --fix            # Check and auto-fix
  mlld nvim-doctor -f               # Short flag

If LSP still doesn't work after fixing:
  1. Check Neovim LSP logs: :checkhealth lsp
  2. Verify server starts: DEBUG=mlld:lsp mlld lsp
  3. Open a .mld file and run: :LspInfo
    `);
  }

  generateExamples(command: string): string[] {
    // Future enhancement: generate dynamic examples based on command
    return [];
  }
}
