import * as path from 'path';
import * as fs from 'fs/promises';
import { watch } from 'fs/promises';
import { existsSync } from 'fs';
import { createInterface } from 'readline';
import { registryCommand } from './commands/registry';
import { createInstallCommand } from './commands/install';
import { createLsCommand } from './commands/ls';
import { createInfoCommand } from './commands/info';
import { createAuthCommand } from './commands/auth';
import { createPublishCommand } from './commands/publish';
import { createInitModuleCommand } from './commands/init-module';
import { createAddNeedsCommand } from './commands/add-needs';
import { createSetupCommand } from './commands/setup';
import { createAliasCommand } from './commands/alias';
import { envCommand } from './commands/env';
import { languageServerCommand } from './commands/language-server';
import { testCommand } from './commands/test';
import { createRunCommand } from './commands/run';
import chalk from 'chalk';
import { version } from '@core/version';
import { MlldError, ErrorSeverity } from '@core/errors/MlldError';
import { NodeFileSystem } from '@services/fs/NodeFileSystem';
import { PathService } from '@services/fs/PathService';
import { OutputPathService } from '@services/fs/OutputPathService';
import { interpret } from '@interpreter/index';
import { logger, cliLogger } from '@core/utils/logger';
import { ConfigLoader } from '@core/config/loader';
import type { ResolvedURLConfig } from '@core/config/types';
import { ErrorFormatSelector } from '@core/utils/errorFormatSelector';

// CLI Options interface
export interface CLIOptions {
  input: string;
  output?: string;
  format?: 'markdown' | 'md' | 'xml';
  stdout?: boolean;
  verbose?: boolean;
  debug?: boolean;
  strict?: boolean;
  homePath?: string;
  watch?: boolean;
  version?: boolean;
  help?: boolean;
  custom?: boolean; // Flag for custom filesystem in tests
  debugResolution?: boolean;
  variableName?: string;
  outputFormat?: 'json' | 'text' | 'mermaid';
  debugContext?: boolean;
  visualizationType?: 'hierarchy' | 'variable-propagation' | 'combined' | 'timeline';
  rootStateId?: string;
  includeVars?: boolean;
  includeTimestamps?: boolean;
  includeFilePaths?: boolean;
  debugTransform?: boolean;
  directiveType?: string;
  includeContent?: boolean;
  debugSourceMaps?: boolean; // Flag to display source mapping information
  detailedSourceMaps?: boolean; // Flag to display detailed source mapping information
  pretty?: boolean; // Flag to enable Prettier formatting
  // URL support options
  allowUrls?: boolean;
  urlTimeout?: number;
  urlMaxSize?: number;
  urlAllowedDomains?: string[];
  urlBlockedDomains?: string[];
  // No transform options - transformation is always enabled
  // Output management options
  maxOutputLines?: number;
  showProgress?: boolean;
  errorBehavior?: 'halt' | 'continue';
  collectErrors?: boolean;
  progressStyle?: 'emoji' | 'text';
  showCommandContext?: boolean;
  commandTimeout?: number;
  // Import approval options
  riskyApproveAll?: boolean;
  yolo?: boolean;
  y?: boolean;
  // Blank line normalization
  noNormalizeBlankLines?: boolean;
  // Development mode
  dev?: boolean;
  // Disable prettier formatting
  noFormat?: boolean;
  _?: string[]; // Remaining args after command
}

/**
 * Normalize format string to supported output format
 */
function normalizeFormat(format?: string): 'markdown' | 'xml' {
  if (!format) return 'markdown'; // Default to markdown, not llm
  
  switch (format.toLowerCase()) {
    case 'md':
    case 'markdown':
      return 'markdown';
    case 'xml':
      return 'xml';
    // Removed 'llm' case to match return type
    default:
      // Consider throwing an error for invalid format or defaulting
      logger.warn(`Invalid format specified: ${format}. Defaulting to markdown.`);
      return 'markdown'; // Default to markdown
  }
}


/**
 * Parse flags from command line arguments
 */
function parseFlags(args: string[]): Record<string, any> {
  const flags: Record<string, any> = {};
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
        flags[key] = args[++i];
      } else {
        flags[key] = true;
      }
    } else if (arg.startsWith('-') && arg.length > 1) {
      const key = arg.slice(1);
      if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
        flags[key] = args[++i];
      } else {
        flags[key] = true;
      }
    }
  }
  
  return flags;
}

/**
 * Parse command line arguments
 */
function parseArgs(args: string[]): CLIOptions {
  // Add defensive check
  if (!Array.isArray(args)) {
    console.error('Internal CLI Error: args is not an array in parseArgs', args);
    throw new TypeError('Internal CLI Error: Expected args to be an array.');
  }

  const options: CLIOptions = {
    input: '',
    format: 'markdown', // Default to markdown format
    strict: false  // Default to permissive mode
  };

  // Commands that can have subcommands (and should stop parsing)
  const commandsWithSubcommands = ['auth', 'registry', 'install', 'i', 'ls', 'list', 'info', 'show', 'publish', 'init', 'init-module', 'add-needs', 'needs', 'deps', 'setup', 'env', 'test', 'run'];
  
  // Store remaining args after command
  options._ = [];
  
  // Flag to stop parsing when we hit a command with subcommands
  let stopParsing = false;

  // Check for debug-resolution command
  if (args.length > 0 && args[0] === 'debug-resolution') {
    options.debugResolution = true;
    // Remove the command from args
    args = args.slice(1);
  }

  // Check for debug-transform command
  if (args.length > 0 && args[0] === 'debug-transform') {
    options.debugTransform = true;
    // Remove the command from args
    args = args.slice(1);
  }

  // Check for debug-context command
  if (args.length > 0 && args[0] === 'debug-context') {
    options.debugContext = true;
    // Remove the command from args
    args = args.slice(1);
  }

  // Add context debug options
  if (args.includes('--debug-context')) {
    options.debugContext = true;
    // Remove the flag so it doesn't get treated as a file path
    args = args.filter(arg => arg !== '--debug-context');
  }

  // Handle visualization type
  const vizTypeIndex = args.findIndex(arg => arg === '--viz-type');
  if (vizTypeIndex !== -1 && vizTypeIndex < args.length - 1) {
    const vizType = args[vizTypeIndex + 1];
    if (['hierarchy', 'variable-propagation', 'combined', 'timeline'].includes(vizType)) {
      options.visualizationType = vizType as 'hierarchy' | 'variable-propagation' | 'combined' | 'timeline';
    } else {
      console.error(`Invalid visualization type: ${vizType}. Using default.`);
    }
    // Remove from args to avoid treating as file path
    args.splice(vizTypeIndex, 2);
  }

  // Handle root state ID
  const rootStateIdIndex = args.findIndex(arg => arg === '--root-state-id');
  if (rootStateIdIndex !== -1 && rootStateIdIndex < args.length - 1) {
    options.rootStateId = args[rootStateIdIndex + 1];
    // Remove from args
    args.splice(rootStateIdIndex, 2);
  }

  // Include vars option
  if (args.includes('--no-vars')) {
    options.includeVars = false;
    args = args.filter(arg => arg !== '--no-vars');
  }

  // Include timestamps option
  if (args.includes('--no-timestamps')) {
    options.includeTimestamps = false;
    args = args.filter(arg => arg !== '--no-timestamps');
  }

  // Include file paths option
  if (args.includes('--no-file-paths')) {
    options.includeFilePaths = false;
    args = args.filter(arg => arg !== '--no-file-paths');
  }

  for (let i = 0; i < args.length; i++) {
    if (stopParsing) break;
    
    const arg = args[i];
    
    switch (arg) {
      case '--version':
      case '-V':
        options.version = true;
        break;
      case '--output':
      case '-o':
        options.output = args[++i];
        break;
      case '--format':
      case '-f':
        options.format = normalizeFormat(args[++i]);
        break;
      case '--stdout':
        options.stdout = true;
        break;
      case '--verbose':
      case '-v':
        options.verbose = true;
        break;
      case '--debug':
      case '-d':
        options.debug = true;
        break;
      case '--debug-source-maps':
        options.debugSourceMaps = true;
        break;
      case '--detailed-source-maps':
        options.detailedSourceMaps = true;
        break;
      case '--strict':
        options.strict = true;
        break;
      case '--permissive':
        options.strict = false;
        break;
      case '--home-path':
        options.homePath = args[++i];
        break;
      case '--watch':
      case '-w':
        options.watch = true;
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
      // Add directive type option for debug-transform
      case '--directive':
        options.directiveType = args[++i];
        break;
      // Add include-content option for debug-transform
      case '--include-content':
        options.includeContent = true;
        break;
      case '--pretty':
        options.pretty = true;
        break;
      // URL support options
      case '--allow-urls':
        options.allowUrls = true;
        break;
      case '--url-timeout':
        options.urlTimeout = parseInt(args[++i]);
        if (isNaN(options.urlTimeout)) {
          throw new Error('--url-timeout must be a number');
        }
        break;
      case '--url-max-size':
        options.urlMaxSize = parseInt(args[++i]);
        if (isNaN(options.urlMaxSize)) {
          throw new Error('--url-max-size must be a number');
        }
        break;
      case '--url-allowed-domains':
        options.urlAllowedDomains = args[++i].split(',').filter(Boolean);
        break;
      case '--url-blocked-domains':
        options.urlBlockedDomains = args[++i].split(',').filter(Boolean);
        break;
      // Output management options
      case '--max-output-lines':
        options.maxOutputLines = parseInt(args[++i]);
        if (isNaN(options.maxOutputLines) || options.maxOutputLines < 0) {
          throw new Error('--max-output-lines must be a positive number');
        }
        break;
      case '--show-progress':
        options.showProgress = true;
        break;
      case '--no-progress':
        options.showProgress = false;
        break;
      case '--error-behavior':
        const behavior = args[++i];
        if (behavior !== 'halt' && behavior !== 'continue') {
          throw new Error('--error-behavior must be "halt" or "continue"');
        }
        options.errorBehavior = behavior;
        break;
      case '--collect-errors':
        options.collectErrors = true;
        break;
      case '--show-command-context':
        options.showCommandContext = true;
        break;
      case '--command-timeout':
        options.commandTimeout = parseInt(args[++i]);
        if (isNaN(options.commandTimeout) || options.commandTimeout < 0) {
          throw new Error('--command-timeout must be a positive number (milliseconds)');
        }
        break;
      // Import approval bypass options
      case '--risky-approve-all':
        options.riskyApproveAll = true;
        break;
      case '--yolo':
        options.yolo = true;
        break;
      case '-y':
        options.y = true;
        break;
      // Blank line normalization
      case '--no-normalize-blank-lines':
        options.noNormalizeBlankLines = true;
        break;
      // Development mode
      case '--dev':
        options.dev = true;
        break;
      // Disable prettier formatting
      case '--no-format':
        options.noFormat = true;
        break;
      // Transformation is always enabled by default
      // No transform flags needed
      default:
        if (!arg.startsWith('-') && !options.input) {
          options.input = arg;
          // If this is a command that can have subcommands, stop parsing here
          if (commandsWithSubcommands.includes(arg)) {
            // Store remaining args
            options._ = args.slice(i + 1);
            stopParsing = true;
            break;
          }
        } else if (!arg.startsWith('-') && options.input && commandsWithSubcommands.includes(options.input)) {
          // This is a subcommand for a command that supports them, stop parsing
          // Store this arg and remaining args
          options._ = args.slice(i);
          stopParsing = true;
          break;
        } else {
          throw new Error(`Unknown option: ${arg}`);
        }
    }
  }

  // Version and help can be used without an input file
  if (!options.input && !options.version && !options.help) {
    throw new Error('No input file specified');
  }

  return options;
}

/**
 * Display help information
 */
function displayHelp(command?: string) {
  if (command === 'auth') {
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
    return;
  }
  
  if (command === 'publish') {
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
    return;
  }
  
  if (command === 'init') {
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
    return;
  }
  
  if (command === 'registry') {
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
    return;
  }
  
  if (command === 'add-needs') {
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
    return;
  }
  
  if (command === 'env') {
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
    return;
  }
  
  if (command === 'debug-resolution') {
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
    return;
  }
  
  if (command === 'debug-transform') {
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
    return;
  }
  
  if (command === 'test') {
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
  
  @import { eq, ok, includes } from @mlld/test
  @data result = @myFunction("input")
  @data test_returns_correct_value = @eq(@result, "expected")
  @data test_not_empty = @ok(@result)

Examples:
  mlld test                    # Run all tests
  mlld test array              # Run tests with "array" in the path
  mlld test src/utils          # Run tests in src/utils/
  mlld test parser.test.mld    # Run specific test file
    `);
    return;
  }
  
  if (command === 'language-server' || command === 'lsp') {
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
    return;
  }

  console.log(`
Usage: mlld [command] [options] <input-file>

Commands:
  init                    Create a new mlld module
  add-needs, needs, deps  Analyze and update module dependencies
  env                     Manage environment variables allowed in @INPUT
  install, i              Install mlld modules
  ls, list               List installed modules
  info, show             Show module details
  auth                    Manage GitHub authentication
  publish                 Publish module to mlld registry
  registry                Manage mlld module registry
  run                     Run mlld scripts from script directory
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

/**
 * Prompt for file overwrite confirmation
 */
async function confirmOverwrite(filePath: string): Promise<{ outputPath: string; shouldOverwrite: boolean }> {
  // In test mode, always return true to allow overwriting
  if (process.env.NODE_ENV === 'test') {
    return { outputPath: filePath, shouldOverwrite: true };
  }
  
  // Get the current CLI options from the outer scope
  const cliOptions = getCurrentCLIOptions();
  
  // If output path was not explicitly set, we're using the safe path from OutputPathService
  // so we can just return it
  if (!cliOptions.output) {
    return { outputPath: filePath, shouldOverwrite: true };
  }
  
  // Check if we can use raw mode (might not be available in all environments)
  const canUseRawMode = process.stdin.isTTY && typeof process.stdin.setRawMode === 'function';
  
  // If raw mode isn't available, fall back to readline
  if (!canUseRawMode) {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout
    });

    return new Promise((resolve) => {
      rl.question(`File ${filePath} already exists. Overwrite? [Y/n] `, (answer) => {
        rl.close();
        
        // If user doesn't want to overwrite, find an incremental filename
        if (answer.toLowerCase() === 'n') {
          const newPath = findAvailableIncrementalFilename(filePath);
          console.log(`Using alternative filename: ${newPath}`);
          resolve({ outputPath: newPath, shouldOverwrite: true });
        } else {
          resolve({ outputPath: filePath, shouldOverwrite: true });
        }
      });
    });
  }
  
  // Use raw mode to detect a single keypress
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf8');
  
  process.stdout.write(`File ${filePath} already exists. Overwrite? [Y/n] `);
  
  return new Promise((resolve) => {
    const onKeypress = (key: string) => {
      // Ctrl-C
      if (key === '\u0003') {
        process.stdout.write('\n');
        process.exit(0);
      }
      
      // Convert to lowercase for comparison
      const keyLower = key.toLowerCase();
      
      // Only process y, n, or enter (which is '\r' in raw mode)
      if (keyLower === 'y' || keyLower === 'n' || key === '\r') {
        // Echo the key (since raw mode doesn't show keystrokes)
        process.stdout.write(key === '\r' ? 'y\n' : `${key}\n`);
        
        // Restore the terminal to cooked mode
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdin.removeListener('data', onKeypress);
        
        // If user doesn't want to overwrite or pressed Enter (default to Y), find an incremental filename
        if (keyLower === 'n') {
          const newPath = findAvailableIncrementalFilename(filePath);
          console.log(`Using alternative filename: ${newPath}`);
          resolve({ outputPath: newPath, shouldOverwrite: true });
        } else {
          resolve({ outputPath: filePath, shouldOverwrite: true });
        }
      }
    };
    
    // Listen for keypresses
    process.stdin.on('data', onKeypress);
  });
}

// Store the current CLI options for access by other functions
let currentCLIOptions: CLIOptions | null = null;

function getCurrentCLIOptions(): CLIOptions {
  if (!currentCLIOptions) {
    throw new Error('CLI options not initialized');
  }
  return currentCLIOptions;
}

function setCurrentCLIOptions(options: CLIOptions): void {
  currentCLIOptions = options;
}

/**
 * Finds an available filename by appending an incremental number
 * If file.md exists, tries file-1.md, file-2.md, etc.
 */
function findAvailableIncrementalFilename(filePath: string): string {
  // Extract the base name and extension
  const lastDotIndex = filePath.lastIndexOf('.');
  const baseName = lastDotIndex !== -1 ? filePath.slice(0, lastDotIndex) : filePath;
  const extension = lastDotIndex !== -1 ? filePath.slice(lastDotIndex) : '';
  
  // Try incremental filenames until we find one that doesn't exist
  let counter = 1;
  let newPath = `${baseName}-${counter}${extension}`;
  
  while (existsSync(newPath)) {
    counter++;
    newPath = `${baseName}-${counter}${extension}`;
  }
  
  return newPath;
}

/**
 * Convert CLI options to API options
 */
function cliToApiOptions(cliOptions: CLIOptions): ProcessOptions {
  return {
    format: normalizeFormat(cliOptions.format),
    debug: cliOptions.debug,
    pretty: cliOptions.pretty,
  };
}

/**
 * Watch for file changes and reprocess
 */
async function watchFiles(options: CLIOptions): Promise<void> {
  logger.info('Starting watch mode', { input: options.input });

  const inputPath = options.input;
  const watchDir = path.dirname(inputPath);

  try {
    console.log(`Watching for changes in ${watchDir}...`);
    const watcher = watch(watchDir, { recursive: true });

    for await (const event of watcher) {
      // Only process .mlld files or the specific input file
      if (event.filename?.endsWith('.mlld') || event.filename === path.basename(inputPath)) {
        console.log(`Change detected in ${event.filename}, reprocessing...`);
        await processFile(options);
      }
    }
  } catch (error) {
    logger.error('Watch mode failed', {
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}

/**
 * Read stdin content if available
 */
async function readStdinIfAvailable(): Promise<string | undefined> {
  // Check if stdin is a TTY (terminal) - if so, there's no piped input
  if (process.stdin.isTTY) {
    return undefined;
  }
  
  // Read from stdin
  const chunks: Buffer[] = [];
  
  return new Promise((resolve) => {
    let timeout: NodeJS.Timeout;
    
    // Set a short timeout to check if data is available
    timeout = setTimeout(() => {
      // No data received within timeout, assume no stdin
      process.stdin.pause();
      process.stdin.removeAllListeners('data');
      process.stdin.removeAllListeners('end');
      resolve(undefined);
    }, 100);
    
    process.stdin.on('data', (chunk) => {
      clearTimeout(timeout);
      chunks.push(chunk);
    });
    
    process.stdin.on('end', () => {
      clearTimeout(timeout);
      const content = Buffer.concat(chunks).toString('utf8');
      resolve(content);
    });
    
    // Start reading
    process.stdin.resume();
  });
}

/**
 * Process a file with specific API options
 */
async function processFileWithOptions(cliOptions: CLIOptions, apiOptions: ProcessOptions): Promise<void> {
  const { input, output, format, stdout, debug } = cliOptions;
  let outputPath = output;
  const normalizedFormat = normalizeFormat(format); // Use normalized format


  if (!stdout && !outputPath) {
    const outputPathService = new OutputPathService();
    outputPath = await outputPathService.getSafeOutputPath(input, normalizedFormat, output);
  }

  if (outputPath && outputPath === input) {
    console.error('Error: Input and output files cannot be the same.');
    process.exit(1);
  }

  try {
    // Create services for the interpreter
    const fileSystem = new NodeFileSystem();
    const pathService = new PathService();

    if (debug) {
      console.log('CLI Options:', cliOptions);
      console.log('API Options:', apiOptions);
      console.log('Output Path:', outputPath);
    }

    // Read the input file using Node's fs directly
    const fs = await import('fs/promises');
    const content = await fs.readFile(input, 'utf8');
    
    // Read stdin if available
    const stdinContent = await readStdinIfAvailable();
    
    // Load configuration
    const configLoader = new ConfigLoader(path.dirname(input));
    const config = configLoader.load();
    const urlConfig = configLoader.resolveURLConfig(config);
    const outputConfig = configLoader.resolveOutputConfig(config);
    
    // CLI options override config
    let finalUrlConfig: ResolvedURLConfig | undefined = urlConfig;
    
    if (cliOptions.allowUrls) {
      // CLI explicitly enables URLs, override config
      finalUrlConfig = {
        enabled: true,
        allowedDomains: cliOptions.urlAllowedDomains || urlConfig?.allowedDomains || [],
        blockedDomains: cliOptions.urlBlockedDomains || urlConfig?.blockedDomains || [],
        allowedProtocols: urlConfig?.allowedProtocols || ['https', 'http'],
        timeout: cliOptions.urlTimeout || urlConfig?.timeout || 30000,
        maxSize: cliOptions.urlMaxSize || urlConfig?.maxSize || 5 * 1024 * 1024,
        warnOnInsecureProtocol: urlConfig?.warnOnInsecureProtocol ?? true,
        cache: urlConfig?.cache || {
          enabled: true,
          defaultTTL: 5 * 60 * 1000,
          rules: []
        }
      };
    } else if (urlConfig?.enabled && cliOptions.allowUrls !== false) {
      // Config enables URLs and CLI doesn't explicitly disable
      finalUrlConfig = urlConfig;
    } else {
      // URLs disabled
      finalUrlConfig = undefined;
    }
    
    // Use the new interpreter
    const interpretResult = await interpret(content, {
      basePath: path.resolve(path.dirname(input)),
      filePath: path.resolve(input), // Pass the current file path for error reporting
      format: normalizedFormat,
      fileSystem: fileSystem,
      pathService: pathService,
      strict: cliOptions.strict,
      urlConfig: finalUrlConfig,
      stdinContent: stdinContent,
      outputOptions: {
        showProgress: cliOptions.showProgress !== undefined ? cliOptions.showProgress : outputConfig.showProgress,
        maxOutputLines: cliOptions.maxOutputLines !== undefined ? cliOptions.maxOutputLines : outputConfig.maxOutputLines,
        errorBehavior: cliOptions.errorBehavior || outputConfig.errorBehavior,
        collectErrors: cliOptions.collectErrors !== undefined ? cliOptions.collectErrors : outputConfig.collectErrors,
        showCommandContext: cliOptions.showCommandContext !== undefined ? cliOptions.showCommandContext : outputConfig.showCommandContext,
        timeout: cliOptions.commandTimeout
      },
      returnEnvironment: true,
      approveAllImports: cliOptions.riskyApproveAll || cliOptions.yolo || cliOptions.y,
      normalizeBlankLines: !cliOptions.noNormalizeBlankLines,
      devMode: cliOptions.dev,
      enableTrace: true, // Enable directive trace for better error debugging
      useMarkdownFormatter: !cliOptions.noFormat
    });

    // Extract result and environment
    const result = typeof interpretResult === 'string' ? interpretResult : interpretResult.output;
    const environment = typeof interpretResult === 'string' ? null : interpretResult.environment;
    
    // Check if @output was used in the document
    const hasExplicitOutput = environment && (environment as any).hasExplicitOutput;

    // Output handling - skip default output if @output was used (unless explicitly requested)
    if (stdout) {
      console.log(result);
    } else if (outputPath && (!hasExplicitOutput || output)) {
      const { outputPath: finalPath, shouldOverwrite } = await confirmOverwrite(outputPath);
      if (shouldOverwrite) {
        // Use Node's fs directly
        const dirPath = path.dirname(finalPath);
        
        // Ensure the output directory exists
        await fs.mkdir(dirPath, { recursive: true });
        
        // Write the file
        await fs.writeFile(finalPath, result, 'utf8');
        console.log(`\nOutput written to ${finalPath}`);
      } else {
        console.log('Operation cancelled by user.');
      }
    }
  } catch (error: any) {
    await handleError(error, cliOptions);
    throw error;
  }
}

/**
 * Process a single file
 */
async function processFile(options: CLIOptions): Promise<void> {
  // Convert CLI options to API options
  const apiOptions = cliToApiOptions(options);
  
  if (options.debugContext) {
    // TODO: debugContextCommand is not imported
    console.error('Debug context command not yet implemented');
    return;
    /*
    await debugContextCommand({
      filePath: options.input,
      variableName: options.variableName,
      visualizationType: options.visualizationType || 'hierarchy',
      rootStateId: options.rootStateId,
      outputFormat: options.outputFormat as 'mermaid' | 'dot' | 'json' || 'mermaid',
      outputFile: options.output,
      includeVars: options.includeVars,
      includeTimestamps: options.includeTimestamps,
      includeFilePaths: options.includeFilePaths
    });
    return;
    */
  }

  // Use the common processing function
  await processFileWithOptions(options, apiOptions);
}

// Keep track of error messages we've seen
const seenErrors = new Set<string>();

// Flag to bypass the error deduplication for formatted errors
const bypassDeduplication = false;

// Check if error deduplication should be completely disabled
const disableDeduplication = !!(global as any).MLLD_DISABLE_ERROR_DEDUPLICATION;

// Store the original console.error
const originalConsoleError = console.error;

// Replace console.error with our custom implementation
console.error = function(...args: any[]) {
  // If deduplication is completely disabled via global flag, call original directly
  if (disableDeduplication) {
    originalConsoleError.apply(console, args);
    return;
  }

  // Enhanced error displays from our service should bypass deduplication
  if (bypassDeduplication) {
    // Call the original console.error directly
    originalConsoleError.apply(console, args);
    return;
  }
  
  // Convert the arguments to a string for comparison
  const errorMsg = args.join(' ');
  
  // If we've seen this error before, don't print it
  if (seenErrors.has(errorMsg)) {
    return;
  }
  
  // Add this error to the set of seen errors
  seenErrors.add(errorMsg);
  
  // Call the original console.error
  originalConsoleError.apply(console, args);
};

// Moved handleError definition before main
async function handleError(error: any, options: CLIOptions): Promise<void> {
  const isMlldError = error instanceof MlldError;
  const isCommandError = error.constructor.name === 'MlldCommandExecutionError';
  const severity = isMlldError ? error.severity : ErrorSeverity.Fatal;

  // Ensure the logger configuration matches CLI options
  logger.level = options.debug ? 'debug' : (options.verbose ? 'info' : 'warn');

  if (isMlldError) {
    // Use enhanced error formatting with auto-detection
    const fileSystem = new NodeFileSystem();
    const errorFormatter = new ErrorFormatSelector(fileSystem);
    
    try {
      let result: string;
      
      if (isCommandError && options.showCommandContext) {
        // Enhanced formatting for command errors with full context
        result = await errorFormatter.formatForCLI(error, {
          useColors: true,
          useSourceContext: true,
          useSmartPaths: true,
          basePath: path.resolve(path.dirname(options.input)),
          workingDirectory: process.cwd(),
          contextLines: 3 // More context for command errors
        });
      } else {
        // Standard formatting
        result = await errorFormatter.formatForCLI(error, {
          useColors: true,
          useSourceContext: true,
          useSmartPaths: true,
          basePath: path.resolve(path.dirname(options.input)),
          workingDirectory: process.cwd(),
          contextLines: 2
        });
      }
      
      console.error('\n' + result + '\n');
    } catch {
      // Fallback to basic API format if enhanced formatting fails
      const fallbackFormatter = new ErrorFormatSelector();
      const result = fallbackFormatter.formatForAPI(error);
      console.error('\n' + result.formatted + '\n');
    }
  } else if (error instanceof Error) {
    logger.error('An unexpected error occurred:', error);
    
    // Check for mlld trace on regular errors
    if ((error as any).mlldTrace) {
      const { DirectiveTraceFormatter } = await import('@core/utils/DirectiveTraceFormatter');
      const formatter = new DirectiveTraceFormatter();
      
      // Check if this is an import error that's already shown in the trace
      const hasImportError = (error as any).mlldTrace.some((t: any) => t.failed);
      
      // Format with error message for non-import errors
      const trace = formatter.format(
        (error as any).mlldTrace, 
        true, 
        hasImportError ? undefined : error.message
      );
      
      // Show the formatted error box
      const fileName = path.basename(options.input || 'unknown');
      console.error(`\nThere was an error running ${fileName}\n`);
      console.error(trace);
      console.error('');
    } else {
      // No trace, show the error normally
      console.error('\n  ⎿  ' + chalk.red('Error: ') + error.message);
    }
    
    const cause = error.cause;
    if (cause instanceof Error) {
        console.error(chalk.red(`  Cause: ${cause.message}`));
    }
    
    // Only show stack trace in verbose mode (for now we'll skip it)
    // TODO: Add --verbose flag support
    // if (error.stack && options.verbose) {
    //   console.error(chalk.gray(error.stack));
    // }
  } else {
    logger.error('An unknown error occurred:', { error });
    console.error(chalk.red(`Unknown Error: ${String(error)}`));
  }

  if (severity === ErrorSeverity.Fatal) {
    process.exit(1);
  }
}

/**
 * Central entry point for the CLI, parsing arguments and orchestrating file processing.
 * Allows injecting a filesystem adapter for testing.
 */
export async function main(customArgs?: string[]): Promise<void> {
  process.title = 'mlld';
  let cliOptions: CLIOptions = { input: '' }; // Initialize with default

  try {
    // Clear the set of seen errors
    seenErrors.clear();

    // Explicitly disable debug mode by default
    process.env.DEBUG = '';
    
    // Parse command-line arguments
    const args = customArgs || process.argv.slice(2);
    
    cliOptions = parseArgs(args); // Assign parsed options
    setCurrentCLIOptions(cliOptions);
    
    // Handle version flag
    if (cliOptions.version) {
      console.log(`mlld version ${version}`);
      return;
    }

    // Handle help flag
    if (cliOptions.help) {
      displayHelp(args[0]);
      return;
    }
    
    
    // Handle registry command
    if (cliOptions.input === 'registry') {
      const cmdArgs = cliOptions._ || [];
      await registryCommand(cmdArgs);
      return;
    }
    
    // Handle install command
    if (cliOptions.input === 'install' || cliOptions.input === 'i') {
      const installCmd = createInstallCommand();
      const cmdArgs = cliOptions._ || [];
      await installCmd.execute(cmdArgs, parseFlags(cmdArgs));
      return;
    }
    
    // Handle ls command
    if (cliOptions.input === 'ls' || cliOptions.input === 'list') {
      const lsCmd = createLsCommand();
      const cmdArgs = cliOptions._ || [];
      await lsCmd.execute(cmdArgs, parseFlags(cmdArgs));
      return;
    }
    
    // Handle info command
    if (cliOptions.input === 'info' || cliOptions.input === 'show') {
      const infoCmd = createInfoCommand();
      const cmdArgs = cliOptions._ || [];
      await infoCmd.execute(cmdArgs, parseFlags(cmdArgs));
      return;
    }
    
    // Handle auth command
    if (cliOptions.input === 'auth') {
      const authCmd = createAuthCommand();
      const cmdArgs = cliOptions._ || [];
      await authCmd.execute(cmdArgs, parseFlags(cmdArgs));
      return;
    }
    
    // Handle publish command
    if (cliOptions.input === 'publish') {
      const publishCmd = createPublishCommand();
      const cmdArgs = cliOptions._ || [];
      await publishCmd.execute(cmdArgs, parseFlags(cmdArgs));
      return;
    }
    
    // Handle init/init-module command
    if (cliOptions.input === 'init' || cliOptions.input === 'init-module') {
      // Check if the next argument looks like a subcommand or flag
      const cmdArgs = cliOptions._ || [];
      const flags = parseFlags(cmdArgs);
      
      
      // Check for help flag first
      if (flags.help || flags.h) {
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
        return;
      }
      
      // Always use module creation - no workspace/project concept
      const initModuleCmd = createInitModuleCommand();
      await initModuleCmd.execute(cmdArgs, flags);
      return;
    }
    
    // Handle add-needs command
    if (cliOptions.input === 'add-needs' || cliOptions.input === 'needs' || cliOptions.input === 'deps') {
      const addNeedsCmd = createAddNeedsCommand();
      const cmdArgs = cliOptions._ || [];
      await addNeedsCmd.execute(cmdArgs, parseFlags(cmdArgs));
      return;
    }
    
    // Handle setup command
    if (cliOptions.input === 'setup') {
      const setupCmd = createSetupCommand();
      const cmdArgs = cliOptions._ || [];
      await setupCmd.execute(cmdArgs, parseFlags(cmdArgs));
      return;
    }
    
    // Handle alias command
    if (cliOptions.input === 'alias') {
      const aliasCmd = createAliasCommand();
      const cmdArgs = cliOptions._ || [];
      await aliasCmd.execute(cmdArgs, parseFlags(cmdArgs));
      return;
    }
    
    // Handle env command
    if (cliOptions.input === 'env') {
      const cmdArgs = cliOptions._ || [];
      await envCommand({ _: cmdArgs });
      return;
    }
    
    // Handle language-server command
    if (cliOptions.input === 'language-server' || cliOptions.input === 'lsp') {
      await languageServerCommand();
      return;
    }
    
    // Handle test command
    if (cliOptions.input === 'test') {
      const cmdArgs = cliOptions._ || [];
      await testCommand(cmdArgs);
      return;
    }
    
    // Handle run command
    if (cliOptions.input === 'run') {
      const runCmd = createRunCommand();
      const cmdArgs = cliOptions._ || [];
      await runCmd.execute(cmdArgs, parseFlags(cmdArgs));
      return;
    }
    
    // Handle debug-resolution command
    if (cliOptions.debugResolution) {
      // TODO: debugResolutionCommand is not imported
      console.error('Debug resolution command not yet implemented');
      return;
      /*
      try {
        await debugResolutionCommand({
          filePath: cliOptions.input,
          variableName: cliOptions.variableName,
          outputFormat: cliOptions.outputFormat as 'json' | 'text',
          watchMode: cliOptions.watch
        });
      } catch (error) {
        logger.error('Error running debug-resolution command', { error });
        throw error;
      }
      return;
      */
    }

    // Handle debug-context command
    if (cliOptions.debugContext) {
      // TODO: debugContextCommand is not imported
      console.error('Debug context command not yet implemented');
      return;
      /*
      await debugContextCommand({
        filePath: cliOptions.input,
        variableName: cliOptions.variableName,
        visualizationType: cliOptions.visualizationType || 'hierarchy',
        rootStateId: cliOptions.rootStateId,
        outputFormat: cliOptions.outputFormat as 'mermaid' | 'dot' | 'json',
        outputFile: cliOptions.output,
        includeVars: cliOptions.includeVars !== false,
        includeTimestamps: cliOptions.includeTimestamps !== false,
        includeFilePaths: cliOptions.includeFilePaths !== false
      });
      return;
      */
    }

    // Handle debug-transform command
    if (cliOptions.debugTransform) {
      // TODO: debugTransformCommand is not imported
      console.error('Debug transform command not yet implemented');
      return;
      /*
      await debugTransformCommand({
        filePath: cliOptions.input,
        directiveType: cliOptions.directiveType,
        outputFormat: cliOptions.outputFormat as 'text' | 'json' | 'mermaid',
        outputFile: cliOptions.output,
        includeContent: cliOptions.includeContent
      });
      return;
      */
    }

    // Configure logging based on options
    if (cliOptions.debug) {
      // Set environment variable for child processes and imported modules
      process.env.DEBUG = 'true';
      logger.level = 'trace';
      cliLogger.level = 'trace';
    } else if (cliOptions.verbose) {
      // Show info level messages for verbose, but no debug logs
      logger.level = 'info';
      cliLogger.level = 'info';
      process.env.DEBUG = ''; // Explicitly disable DEBUG
    } else {
      // Only show errors by default (no debug logs)
      logger.level = 'error';
      cliLogger.level = 'error';
      process.env.DEBUG = ''; // Explicitly disable DEBUG
    }

    // Watch mode or single processing
    if (cliOptions.watch) {
      await watchFiles(cliOptions); // Pass cliOptions
      return;
    }

    await processFileWithOptions(cliOptions, cliToApiOptions(cliOptions));

  } catch (error: unknown) { // Catch unknown type
    // Use the centralized error handler
    await handleError(error, cliOptions); // Pass potentially unparsed cliOptions
  }
}

// This file is now imported by cli-entry.ts, which handles the main execution