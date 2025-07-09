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
    
    if (command === 'env') {
      this.displayEnvHelp();
      return;
    }
    
    if (command === 'debug-resolution') {
      this.displayDebugResolutionHelp();
      return;
    }
    
    if (command === 'debug-transform') {
      this.displayDebugTransformHelp();
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
    
    if (command === 'mode') {
      this.displayModeHelp();
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
  -v, --verbose        Show detailed output

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
  stats share          Share anonymous usage statistics
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

  private displayEnvHelp(): void {
    console.log(`
Usage: mlld env <subcommand> [options]

Manage environment variables allowed in @INPUT.

Subcommands:
  list                    List allowed environment variables
  allow <name> [...]      Allow environment variable(s) in @INPUT
  remove <name> [...]     Remove environment variable(s) from allowed list
  clear                   Clear all allowed environment variables

Examples:
  mlld env list           # Show currently allowed variables
  mlld env allow API_KEY  # Allow API_KEY to be accessed via @INPUT
  mlld env allow HOME USER PATH  # Allow multiple variables
  mlld env remove API_KEY # Remove API_KEY from allowed list
  mlld env clear          # Clear all allowed variables

Note: Environment variables are only accessible via @INPUT when explicitly
allowed. The allowed list is stored in mlld.lock.json.
    `);
  }

  private displayDebugResolutionHelp(): void {
    console.log(`
Usage: mlld debug-resolution [options] <input-file>

Debug variable resolution in a Mlld file.

Options:
  --var, --variable <n>     Filter to a specific variable
  --output-format <format>     Output format (json, text) [default: text]
  -w, --watch                  Watch for changes and reprocess
  -v, --verbose                Enable verbose output
  --home-path <path>           Custom home path for ~/ substitution
  -h, --help                   Display this help message
    `);
  }

  private displayDebugTransformHelp(): void {
    console.log(`
Usage: mlld debug-transform [options] <input-file>

Debug node transformations through the pipeline.

Options:
  --directive <type>           Focus on a specific directive type
  --output-format <format>     Output format (text, json, mermaid) [default: text]
  --output <path>              Output file path
  --include-content            Include node content in output
  -v, --verbose                Enable verbose output
  -h, --help                   Display this help message
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

Manage dev mode for local module development.

Subcommands:
  status               Show current dev mode status and detected modules
  list                 List all local modules with their publish names

Dev mode allows you to use published module names (e.g., @author/module) 
while developing locally, without any configuration. It automatically scans
your local modules and creates temporary prefix mappings.

Enable dev mode:
  mlld <file> --dev           Enable for a single run
  export MLLD_DEV=true        Enable for all runs in the session

Examples:
  mlld dev                    # Show status
  mlld dev status             # Show status 
  mlld dev list               # List all local modules

  # Using dev mode
  mlld test.mld --dev         # Run with dev mode enabled
  export MLLD_DEV=true        # Enable for session
  mlld test.mld               # Now runs with dev mode

How it works:
  1. Scans llm/modules/ for .mlld.md files
  2. Reads module metadata to find authors
  3. Creates temporary @author/ prefixes
  4. Maps @author/module imports to local files
  5. No configuration needed - just works!
    `);
  }

  private displayModeHelp(): void {
    console.log(`
Usage: mlld mode <mode>

Set the mlld execution mode.

Available modes:
  dev, development    Enable development mode (resolve local modules)
  prod, production    Enable production mode (only published modules)
  user                Default user mode
  clear, reset        Remove mode setting (same as user)

Examples:
  mlld mode dev       # Enable development mode
  mlld mode prod      # Enable production mode
  mlld mode user      # Return to default mode
  mlld mode clear     # Clear mode setting (default to user)
  mlld mode reset     # Reset to default (same as clear)

Mode affects:
  - Module resolution (dev mode enables local module resolution)
  - Future: Security policies and permissions
  
The mode is stored in mlld.lock.json and persists across sessions.
Override temporarily with --dev flag or MLLD_DEV=true environment variable.
    `);
  }

  private displayMainHelp(command?: string, context?: HelpContext): void {
    console.log(`
Usage: mlld [command] [options] <input-file>

Commands:
  init                    Create a new mlld module
  add-needs, needs, deps  Analyze and update module dependencies
  alias                   Create path aliases for module imports
  dev                     Manage dev mode for local module development
  env                     Manage environment variables allowed in @INPUT
  mode                    Set mlld execution mode
  install, i              Install mlld modules
  ls, list               List installed modules
  info, show             Show module details
  auth                    Manage GitHub authentication
  publish                 Publish module to mlld registry
  registry                Manage mlld module registry
  run                     Run mlld scripts from script directory
  setup                   Configure mlld project with interactive wizard
  test                    Run mlld tests
  language-server, lsp    Start the mlld language server for editor integration
  debug-resolution        Debug variable resolution in a mlld file
  debug-transform         Debug node transformations through the pipeline

Options:
  -f, --format <format>   Output format: md, markdown, xml, llm [default: llm]
  -o, --output <path>     Output file path
  --stdout                Print to stdout instead of file
  --strict                Enable strict mode (fail on all errors)
  --permissive            Enable permissive mode (ignore recoverable errors) [default]
  --pretty                Format the output with Prettier
  --dev                   Enable dev mode (use published names for local modules)
  --home-path <path>      Custom home path for ~/ substitution
  -v, --verbose           Enable verbose output (some additional info)
  -d, --debug             Enable debug output (full verbose logging)
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
  --no-format                 Disable prettier markdown formatting (preserve original spacing)

Configuration:
  Mlld looks for configuration in:
  1. ~/.config/mlld/mlld.lock.json (global/user config)
  2. mlld.config.json (project config)
  
  CLI options override configuration file settings.
  `);

    if (!command || command === 'debug-context') {
      console.log('\nContext Debugging Options:');
      console.log('  --debug-context            Debug context boundaries and variable propagation');
      console.log('  --viz-type <type>          Type of visualization (hierarchy, variable-propagation, combined, timeline)');
      console.log('  --root-state-id <id>       Root state ID to start visualization from');
      console.log('  --variable-name <n>     Variable name to track (required for variable-propagation and timeline)');
      console.log('  --output-format <format>   Output format (mermaid, dot, json)');
      console.log('  --no-vars                  Exclude variables from context visualization');
      console.log('  --no-timestamps            Exclude timestamps from visualization');
      console.log('  --no-file-paths            Exclude file paths from visualization');
    }
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
      case 'env':
      case 'dev':
      case 'mode':
      case 'debug-resolution':
      case 'debug-transform':
      case 'test':
      case 'language-server':
      case 'lsp':
        return `Help available for ${command}`;
      default:
        return null;
    }
  }

  formatHelpContent(content: string, context?: HelpContext): string {
    // Future enhancement: format help content based on context
    return content;
  }

  generateExamples(command: string): string[] {
    // Future enhancement: generate dynamic examples based on command
    return [];
  }
}