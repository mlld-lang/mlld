export interface CLIOptions {
  input: string;
  output?: string;
  format?: 'md' | 'xml';
  stdout?: boolean;
  watch?: boolean;
  verbose?: boolean;
  strict?: boolean;
  config?: string;
  projectPath?: string;
  homePath?: string;
}

export interface ICLIService {
  /**
   * Run the CLI with the given arguments
   * @param args Command line arguments (including node and script path)
   */
  run(args: string[]): Promise<void>;

  /**
   * Watch for changes and reprocess files
   * @param options CLI options for watch mode
   */
  watch(options: CLIOptions): Promise<void>;
} 