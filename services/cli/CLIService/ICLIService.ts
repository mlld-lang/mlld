/**
 * Command line interface options for Meld processing.
 * Represents the parsed command line arguments.
 */
export interface CLIOptions {
  /** Input file or directory path to process */
  input?: string;
  
  /** Output file or directory path for processed content */
  output?: string;
  
  /** Output format for processed content */
  format?: 'md' | 'xml' | 'markdown' | 'llmxml';
  
  /** Whether to output to stdout instead of a file */
  stdout?: boolean;
  
  /** Whether to enable verbose logging */
  verbose?: boolean;
  
  /** Whether to run in strict mode (fail on errors) */
  strict?: boolean;
  
  /** Whether to display version information */
  version?: boolean;
  
  /** Whether to enable debug mode */
  debug?: boolean;
  
  /** Whether to display help information */
  help?: boolean;
  
  /** Custom home path to use for $HOMEPATH resolution */
  homePath?: string;
}

/**
 * Interface for a service that handles user prompts and interactive input.
 * Used by CLI for interacting with users in the terminal.
 */
export interface IPromptService {
  /**
   * Gets text input from the user.
   * 
   * @param prompt - The prompt to display to the user
   * @param defaultValue - Optional default value to use if the user presses Enter without input
   * @returns A promise that resolves with the user's input
   * 
   * @example
   * ```ts
   * const filename = await promptService.getText('Enter output filename:', 'output.md');
   * console.log(`Using filename: ${filename}`);
   * ```
   */
  getText(prompt: string, defaultValue?: string): Promise<string>;
}

/**
 * Service responsible for command line interface operations.
 * Handles argument parsing, command execution, and user interaction.
 * 
 * @remarks
 * The CLIService is the main entry point for Meld's command line interface.
 * It parses command line arguments, validates options, and orchestrates the
 * execution of Meld operations based on user input. It coordinates between
 * multiple services to provide a complete CLI experience.
 * 
 * Dependencies:
 * - IInterpreterService: For processing Meld content
 * - IFileSystemService: For file operations
 * - IPathService: For path resolution
 * - IOutputService: For output formatting
 * - IPromptService: For interactive user input
 */
export interface ICLIService {
  /**
   * Run the CLI with the given arguments.
   * Main entry point for executing the CLI.
   * 
   * @param args - Command line arguments (including node and script path)
   * @returns A promise that resolves when the CLI operation completes
   * 
   * @example
   * ```ts
   * await cliService.run(['node', 'meld', 'input.meld', '-o', 'output.md', '--format', 'markdown']);
   * ```
   */
  run(args: string[]): Promise<void>;

  /**
   * Parse command line arguments into a structured options object.
   * 
   * @param args - Command line arguments to parse
   * @returns Structured CLI options object
   * 
   * @example
   * ```ts
   * const options = cliService.parseArguments(['input.meld', '-o', 'output.md']);
   * console.log(`Input: ${options.input}, Output: ${options.output}`);
   * ```
   */
  parseArguments(args: string[]): CLIOptions;
} 