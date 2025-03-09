export interface CLIOptions {
  input?: string;
  output?: string;
  format?: 'md' | 'xml' | 'markdown' | 'llmxml';
  stdout?: boolean;
  verbose?: boolean;
  strict?: boolean;
  version?: boolean;
  debug?: boolean;
  help?: boolean;
  homePath?: string;
}

/**
 * Interface for a service that handles user prompts
 */
export interface IPromptService {
  /**
   * Gets text input from the user
   * @param prompt The prompt to display to the user
   * @param defaultValue Optional default value to use if the user presses Enter without input
   * @returns The user's input
   */
  getText(prompt: string, defaultValue?: string): Promise<string>;
}

export interface ICLIService {
  /**
   * Run the CLI with the given arguments
   * @param args Command line arguments (including node and script path)
   */
  run(args: string[]): Promise<void>;

  /**
   * Parse command line arguments into a structured options object
   * @param args Command line arguments to parse
   */
  parseArguments(args: string[]): CLIOptions;
} 